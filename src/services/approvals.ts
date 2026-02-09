import { prisma } from "../db.js";
import { ApprovalRule, DecisionType, ParticipantRole, ParticipantStatus, ProcessStatus } from "@prisma/client";
import { rejectionRequiresReason } from "./approvalLogic.js";

export type CycleInput = {
  order: number;
  rule: ApprovalRule;
  participants: Array<{ role: ParticipantRole; email?: string | null; displayName?: string | null }>;
};

export async function configureCycles(processId: string, cycles: CycleInput[]) {
  await prisma.approvalCycle.deleteMany({ where: { processId } });
  for (const cycle of cycles) {
    const created = await prisma.approvalCycle.create({
      data: {
        processId,
        order: cycle.order,
        rule: cycle.rule
      }
    });
    for (const participant of cycle.participants) {
      await prisma.participant.create({
        data: {
          cycleId: created.id,
          role: participant.role,
          email: participant.email ?? null,
          displayName: participant.displayName ?? null
        }
      });
    }
  }
}

export async function startCycles(processId: string) {
  return prisma.process.update({
    where: { id: processId },
    data: { status: ProcessStatus.IN_REVIEW }
  });
}

export async function recordDecision(input: {
  processId: string;
  participantId: string;
  decision: DecisionType;
  reason?: string | null;
  fileVersionId?: string | null;
}) {
  if (!input.fileVersionId) throw new Error("fileVersionId is required");
  const participant = await prisma.participant.findUnique({ where: { id: input.participantId } });
  if (!participant) throw new Error("Participant not found");
  if (participant.role !== ParticipantRole.APPROVER) throw new Error("Participant is not an approver");
  if (participant.status === ParticipantStatus.HANDED_OFF || participant.status === ParticipantStatus.REMOVED) {
    throw new Error("Participant is inactive");
  }
  const cycle = await prisma.approvalCycle.findUnique({ where: { id: participant.cycleId } });
  if (!cycle) throw new Error("Cycle not found");
  const process = await prisma.process.findUnique({ where: { id: input.processId } });
  if (!process) throw new Error("Process not found");
  if (process.status === ProcessStatus.REJECTED || process.status === ProcessStatus.APPROVED) {
    throw new Error("Process already finalized");
  }

  const version = await prisma.fileVersion.findUnique({
    where: { id: input.fileVersionId },
    include: { file: true }
  });
  if (!version || version.file.processId !== input.processId) {
    throw new Error("File version not found for process");
  }

  const currentCycle = await getCurrentCycle(input.processId);
  if (!currentCycle || currentCycle.id !== cycle.id) {
    throw new Error("Cycle not active");
  }
  const snapshotBefore = await calculateProcessApprovalSnapshot(input.processId);
  if (snapshotBefore.fileStatuses[input.fileVersionId] && snapshotBefore.fileStatuses[input.fileVersionId] !== "PENDING") {
    throw new Error("File already finalized");
  }

  const existingDecisionByParticipant = await prisma.decision.findFirst({
    where: {
      processId: input.processId,
      cycleId: cycle.id,
      participantId: participant.id,
      fileVersionId: input.fileVersionId
    }
  });
  if (existingDecisionByParticipant) {
    throw new Error("Decision already recorded for this file");
  }

  if (rejectionRequiresReason(input.decision, input.reason)) {
    throw new Error("Rejection reason required");
  }

  await prisma.decision.create({
    data: {
      processId: input.processId,
      cycleId: cycle.id,
      participantId: participant.id,
      fileVersionId: input.fileVersionId,
      decision: input.decision,
      reason: input.reason ?? null
    }
  });

  const snapshot = await calculateProcessApprovalSnapshot(input.processId);
  if (process.status !== snapshot.processStatus) {
    await prisma.process.update({
      where: { id: input.processId },
      data: { status: snapshot.processStatus }
    });
  }

  return { status: snapshot.processStatus };
}

export type FileApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";

export async function calculateProcessApprovalSnapshot(processId: string): Promise<{
  processStatus: ProcessStatus;
  activeCycleId: string | null;
  fileStatuses: Record<string, FileApprovalStatus>;
}> {
  const cycles = await prisma.approvalCycle.findMany({
    where: { processId },
    orderBy: { order: "asc" }
  });
  const fileVersions = await prisma.fileVersion.findMany({
    where: { file: { processId } },
    select: { id: true, approvalRule: true }
  });
  const fileVersionIds = fileVersions.map((item) => item.id);
  const ruleByFileVersionId = fileVersions.reduce((acc, item) => {
    acc[item.id] = item.approvalRule;
    return acc;
  }, {} as Record<string, ApprovalRule>);
  if (fileVersionIds.length === 0) {
    return {
      processStatus: ProcessStatus.DRAFT,
      activeCycleId: cycles[0]?.id ?? null,
      fileStatuses: {}
    };
  }

  let lastEvaluatedStatuses: Record<string, FileApprovalStatus> = fileVersionIds.reduce((acc, id) => {
    acc[id] = "PENDING";
    return acc;
  }, {} as Record<string, FileApprovalStatus>);

  for (const cycle of cycles) {
    const evaluated = await evaluateCycleFiles({
      processId,
      cycleId: cycle.id,
      fallbackRule: cycle.rule,
      ruleByFileVersionId,
      fileVersionIds
    });
    lastEvaluatedStatuses = evaluated.fileStatuses;
    if (evaluated.hasRejected) {
      return {
        processStatus: ProcessStatus.REJECTED,
        activeCycleId: cycle.id,
        fileStatuses: evaluated.fileStatuses
      };
    }
    if (!evaluated.allApproved) {
      return {
        processStatus: ProcessStatus.IN_REVIEW,
        activeCycleId: cycle.id,
        fileStatuses: evaluated.fileStatuses
      };
    }
  }

  if (cycles.length === 0) {
    return {
      processStatus: ProcessStatus.IN_REVIEW,
      activeCycleId: null,
      fileStatuses: lastEvaluatedStatuses
    };
  }

  return {
    processStatus: ProcessStatus.APPROVED,
    activeCycleId: null,
    fileStatuses: lastEvaluatedStatuses
  };
}

async function getCurrentCycle(processId: string) {
  const snapshot = await calculateProcessApprovalSnapshot(processId);
  if (!snapshot.activeCycleId) return null;
  return prisma.approvalCycle.findUnique({ where: { id: snapshot.activeCycleId } });
}

async function evaluateCycleFiles(input: {
  processId: string;
  cycleId: string;
  fallbackRule: ApprovalRule;
  ruleByFileVersionId: Record<string, ApprovalRule>;
  fileVersionIds: string[];
}) {
  const approvers = await prisma.participant.findMany({
    where: {
      cycleId: input.cycleId,
      role: ParticipantRole.APPROVER,
      status: { notIn: [ParticipantStatus.HANDED_OFF, ParticipantStatus.REMOVED] }
    },
    select: { id: true }
  });
  const approverIds = approvers.map((item) => item.id);

  const decisions = await prisma.decision.findMany({
    where: {
      processId: input.processId,
      cycleId: input.cycleId,
      fileVersionId: { in: input.fileVersionIds }
    },
    orderBy: { createdAt: "asc" },
    select: {
      fileVersionId: true,
      participantId: true,
      decision: true
    }
  });

  const latestByFileAndParticipant = new Map<string, DecisionType>();
  for (const decision of decisions) {
    if (!decision.fileVersionId) continue;
    if (!approverIds.includes(decision.participantId)) continue;
    latestByFileAndParticipant.set(`${decision.fileVersionId}:${decision.participantId}`, decision.decision);
  }

  const fileStatuses: Record<string, FileApprovalStatus> = {};
  for (const fileVersionId of input.fileVersionIds) {
    const fileRule = input.ruleByFileVersionId[fileVersionId] ?? input.fallbackRule;
    if (approverIds.length === 0) {
      fileStatuses[fileVersionId] = "APPROVED";
      continue;
    }
    const latestDecisions = approverIds
      .map((participantId) => latestByFileAndParticipant.get(`${fileVersionId}:${participantId}`))
      .filter((value): value is DecisionType => Boolean(value));
    if (latestDecisions.includes(DecisionType.REJECT)) {
      fileStatuses[fileVersionId] = "REJECTED";
      continue;
    }
    if (fileRule === ApprovalRule.ALL_APPROVE) {
      const allApproved = approverIds.every(
        (participantId) => latestByFileAndParticipant.get(`${fileVersionId}:${participantId}`) === DecisionType.APPROVE
      );
      fileStatuses[fileVersionId] = allApproved ? "APPROVED" : "PENDING";
      continue;
    }
    const anyApproved = latestDecisions.some((decision) => decision === DecisionType.APPROVE);
    fileStatuses[fileVersionId] = anyApproved ? "APPROVED" : "PENDING";
  }

  return {
    fileStatuses,
    hasRejected: Object.values(fileStatuses).includes("REJECTED"),
    allApproved:
      Object.keys(fileStatuses).length > 0 &&
      Object.values(fileStatuses).every((status) => status === "APPROVED")
  };
}

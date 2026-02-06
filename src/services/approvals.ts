import { prisma } from "../db.js";
import { ApprovalRule, DecisionType, ParticipantRole, ParticipantStatus, ProcessStatus } from "@prisma/client";
import { cycleComplete, rejectionRequiresReason } from "./approvalLogic.js";

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
  const participant = await prisma.participant.findUnique({ where: { id: input.participantId } });
  if (!participant) throw new Error("Participant not found");
  const cycle = await prisma.approvalCycle.findUnique({ where: { id: participant.cycleId } });
  if (!cycle) throw new Error("Cycle not found");

  const currentCycle = await getCurrentCycle(input.processId);
  if (!currentCycle || currentCycle.id !== cycle.id) {
    throw new Error("Cycle not active");
  }

  if (rejectionRequiresReason(input.decision, input.reason)) {
    throw new Error("Rejection reason required");
  }

  await prisma.decision.create({
    data: {
      processId: input.processId,
      cycleId: cycle.id,
      participantId: participant.id,
      fileVersionId: input.fileVersionId ?? null,
      decision: input.decision,
      reason: input.reason ?? null
    }
  });

  await prisma.participant.update({
    where: { id: participant.id },
    data: { status: input.decision === DecisionType.APPROVE ? ParticipantStatus.APPROVED : ParticipantStatus.REJECTED }
  });

  if (input.decision === DecisionType.REJECT) {
    await prisma.process.update({ where: { id: input.processId }, data: { status: ProcessStatus.REJECTED } });
    return { status: ProcessStatus.REJECTED };
  }

  const cycleComplete = await isCycleComplete(cycle.id, cycle.rule);
  if (cycleComplete) {
    const nextCycle = await getNextCycle(input.processId, cycle.order);
    if (!nextCycle) {
      await prisma.process.update({ where: { id: input.processId }, data: { status: ProcessStatus.APPROVED } });
      return { status: ProcessStatus.APPROVED };
    }
  }

  return { status: ProcessStatus.IN_REVIEW };
}

async function getCurrentCycle(processId: string) {
  const cycles = await prisma.approvalCycle.findMany({
    where: { processId },
    orderBy: { order: "asc" }
  });
  for (const cycle of cycles) {
    const complete = await isCycleComplete(cycle.id, cycle.rule);
    if (!complete) return cycle;
  }
  return null;
}

async function isCycleComplete(cycleId: string, rule: ApprovalRule) {
  const participants = await prisma.participant.findMany({ where: { cycleId, role: ParticipantRole.APPROVER } });
  if (participants.length === 0) return true;
  const statuses = participants.map(p => p.status);
  return cycleComplete(rule, statuses);
}

async function getNextCycle(processId: string, currentOrder: number) {
  return prisma.approvalCycle.findFirst({
    where: { processId, order: { gt: currentOrder } },
    orderBy: { order: "asc" }
  });
}

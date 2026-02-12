import { prisma } from "../db.js";
import { calculateProcessApprovalSnapshot } from "../services/approvals.js";
import { appendAuditEvent } from "../services/audit.js";
import { AuditEventType } from "@prisma/client";
import { parseJsonString } from "./helpers.js";

export async function buildSummaryResponse(token: {
  id: string;
  processId: string;
  participantId?: string | null;
  scopes: string[];
  roleAtTime?: string | null;
  expiry?: Date | null;
}, requestMeta?: { ip?: string | null; userAgent?: string | null }) {
  const process = await prisma.process.findUnique({
    where: { id: token.processId },
    include: {
      files: { include: { versions: { orderBy: { versionNumber: "desc" } } } },
      cycles: { include: { participants: true } },
      decisions: {
        include: { participant: true },
        orderBy: { createdAt: "asc" }
      }
    }
  });
  if (!process) return null;

  const snapshot = await calculateProcessApprovalSnapshot(process.id);
  if (process.status !== snapshot.processStatus) {
    await prisma.process.update({
      where: { id: process.id },
      data: { status: snapshot.processStatus }
    });
  }

  const fileVersionToFilename = new Map<string, string>();
  const fileVersionToFileId = new Map<string, string>();
  const fileVersionToNumber = new Map<string, number>();
  process.files.forEach((file) => {
    file.versions.forEach((version) => {
      fileVersionToFilename.set(version.id, file.originalFilename || file.normalizedOriginalFilename);
      fileVersionToFileId.set(version.id, file.id);
      fileVersionToNumber.set(version.id, version.versionNumber);
    });
  });

  const waitingFiles = Object.entries(snapshot.fileStatuses)
    .filter(([, status]) => status === "PENDING")
    .map(([versionId]) => ({
      fileVersionId: versionId,
      filename: fileVersionToFilename.get(versionId) ?? "unknown"
    }));

  const participants = process.cycles.flatMap((cycle) => cycle.participants);
  const approvers = participants.filter((participant) => participant.role === "APPROVER");
  const reviewers = participants.filter((participant) => participant.role === "REVIEWER");
  const currentCycle = snapshot.activeCycleId
    ? process.cycles.find((cycle) => cycle.id === snapshot.activeCycleId) ?? null
    : null;
  const currentCycleApprovers = currentCycle
    ? currentCycle.participants.filter((participant) => participant.role === "APPROVER")
    : [];
  const actorParticipantInProcess = token.participantId
    ? participants.find((participant) => participant.id === token.participantId) ?? null
    : null;
  let actorEmail: string | null = null;
  if (actorParticipantInProcess) {
    actorEmail = actorParticipantInProcess.email ?? null;
  } else if (token.participantId) {
    const actorParticipantAny = await prisma.participant.findUnique({
      where: { id: token.participantId },
      select: { email: true }
    });
    actorEmail = actorParticipantAny?.email ?? null;
  } else if (token.roleAtTime === "UPLOADER" && process.uploaderId) {
    actorEmail = process.uploaderEmail ?? null;
  }
  const decisionsByVersion: Record<
    string,
    Array<{ decision: string; reason: string | null; by: string; createdAt: Date; participantId: string }>
  > = {};
  const decisionCountByVersion: Record<string, number> = {};
  const pendingApproversByVersion: Record<string, string[]> = {};
  const approvalRuleByVersion: Record<string, string> = {};
  const historyByFile: Record<
    string,
    Array<{
      kind: "upload" | "annotation" | "decision";
      decision?: string;
      reason?: string | null;
      by: string;
      createdAt: Date;
      versionNumber?: number;
      versionId?: string;
      participantId?: string | null;
      tokenId?: string | null;
    }>
  > = {};
  const participantByTokenId = new Map<string, { email: string | null; displayName: string | null }>();
  for (const participant of participants) {
    if (participant.tokenId) {
      participantByTokenId.set(participant.tokenId, {
        email: participant.email,
        displayName: participant.displayName
      });
    }
  }

  for (const file of process.files) {
    for (const version of file.versions) {
      if (!historyByFile[file.id]) {
        historyByFile[file.id] = [];
      }
      historyByFile[file.id].push({
        kind: "upload",
        by: process.uploaderEmail || process.uploaderName || process.uploaderId,
        createdAt: version.createdAt,
        versionNumber: version.versionNumber,
        versionId: version.id
      });
    }
  }

  for (const decision of process.decisions) {
    if (!decision.fileVersionId) continue;
    decisionCountByVersion[decision.fileVersionId] = (decisionCountByVersion[decision.fileVersionId] ?? 0) + 1;
    if (!decisionsByVersion[decision.fileVersionId]) {
      decisionsByVersion[decision.fileVersionId] = [];
    }
    decisionsByVersion[decision.fileVersionId].push({
      decision: decision.decision,
      reason: decision.reason,
      by: decision.participant.displayName || decision.participant.email || decision.participant.id,
      createdAt: decision.createdAt,
      participantId: decision.participantId
    });
    const fileId = fileVersionToFileId.get(decision.fileVersionId);
    if (!fileId) continue;
    if (!historyByFile[fileId]) {
      historyByFile[fileId] = [];
    }
    historyByFile[fileId].push({
      kind: "decision",
      decision: decision.decision,
      reason: decision.reason,
      by: decision.participant.displayName || decision.participant.email || decision.participant.id,
      createdAt: decision.createdAt,
      versionNumber: fileVersionToNumber.get(decision.fileVersionId),
      versionId: decision.fileVersionId,
      participantId: decision.participantId
    });
  }

  const decisionAuditEvents = await prisma.auditEvent.findMany({
    where: {
      processId: process.id,
      eventType: { in: [AuditEventType.DECISION_RECORDED, AuditEventType.REJECTION_RECORDED] }
    },
    orderBy: { timestampUtc: "asc" }
  });
  for (const event of decisionAuditEvents) {
    const payload = parseJsonString(event.validatedData);
    const fileVersionId =
      typeof payload.fileVersionId === "string" ? payload.fileVersionId : event.fileVersionId;
    if (!fileVersionId) continue;
    if ((decisionCountByVersion[fileVersionId] ?? 0) > 0) continue;
    const fileId = fileVersionToFileId.get(fileVersionId);
    if (!fileId) continue;
    const participantId = typeof payload.participantId === "string" ? payload.participantId : null;
    const decision = typeof payload.decision === "string" ? payload.decision : null;
    if (!decision) continue;
    const reason = typeof payload.reason === "string" ? payload.reason : null;
    const participant = participantId ? participants.find((item) => item.id === participantId) : null;
    const actorFromToken = event.tokenId ? participantByTokenId.get(event.tokenId) : undefined;
    const actorEmail =
      typeof payload.participantEmail === "string"
        ? payload.participantEmail
        : participant?.email || actorFromToken?.email || null;
    const actorName =
      typeof payload.participantDisplayName === "string"
        ? payload.participantDisplayName
        : participant?.displayName || actorFromToken?.displayName || null;
    const by = actorName || actorEmail || "unknown";
    if (!historyByFile[fileId]) {
      historyByFile[fileId] = [];
    }
    historyByFile[fileId].push({
      kind: "decision",
      decision,
      reason,
      by,
      createdAt: event.timestampUtc,
      versionNumber: fileVersionToNumber.get(fileVersionId),
      versionId: fileVersionId,
      participantId,
      tokenId: event.tokenId ?? null
    });
  }

  const currentCycleDecisions = currentCycle
    ? process.decisions.filter((decision) => decision.cycleId === currentCycle.id && decision.fileVersionId)
    : [];
  const latestByVersionAndParticipant = new Map<string, "APPROVE" | "REJECT">();
  for (const decision of currentCycleDecisions) {
    if (!decision.fileVersionId) continue;
    latestByVersionAndParticipant.set(`${decision.fileVersionId}:${decision.participantId}`, decision.decision);
  }

  for (const file of process.files) {
    for (const version of file.versions.filter((item) => item.isCurrent)) {
      approvalRuleByVersion[version.id] = version.approvalRule;
      const status = snapshot.fileStatuses[version.id] ?? "PENDING";
      if (status !== "PENDING" || !currentCycle) {
        pendingApproversByVersion[version.id] = [];
        continue;
      }
      if (version.approvalRule === "ANY_APPROVE") {
        pendingApproversByVersion[version.id] = currentCycleApprovers.map(
          (participant) => participant.displayName || participant.email || participant.id
        );
        continue;
      }
      pendingApproversByVersion[version.id] = currentCycleApprovers
        .filter((participant) => latestByVersionAndParticipant.get(`${version.id}:${participant.id}`) !== "APPROVE")
        .map((participant) => participant.displayName || participant.email || participant.id);
    }
  }

  const annotations = await prisma.annotation.findMany({
    where: {
      fileVersionId: {
        in: process.files.flatMap((file) => file.versions.map((version) => version.id))
      }
    },
    include: {
      participant: true,
      fileVersion: true
    }
  });
  for (const annotation of annotations) {
    const actorFromToken = annotation.tokenId ? participantByTokenId.get(annotation.tokenId) : undefined;
    const annotationActor =
      annotation.participant?.displayName ||
      annotation.participant?.email ||
      actorFromToken?.displayName ||
      actorFromToken?.email ||
      "unknown";
    const fileId = fileVersionToFileId.get(annotation.fileVersionId);
    if (!fileId) continue;
    if (!historyByFile[fileId]) {
      historyByFile[fileId] = [];
    }
    historyByFile[fileId].push({
      kind: "annotation",
      by: annotationActor,
      createdAt: annotation.createdAt,
      versionNumber: annotation.fileVersion.versionNumber,
      versionId: annotation.fileVersionId
    });
  }

  await appendAuditEvent({
    eventType: AuditEventType.ACCESS_LOGGED,
    processId: process.id,
    tokenId: token.id,
    roleAtTime: token.roleAtTime ?? null,
    ip: requestMeta?.ip ?? null,
    userAgent: requestMeta?.userAgent ?? null,
    validatedData: { action: "ui.summary" }
  });

  return {
    process: {
      id: process.id,
      projectNumber: process.projectNumber,
      customerNumber: process.customerNumber,
      status: snapshot.processStatus,
      attributesJson: parseJsonString(process.attributesJson)
    },
    participantId: actorParticipantInProcess?.id ?? null,
    actor: {
      email: actorEmail,
      roleAtTime: token.roleAtTime ?? null,
      expiry: token.expiry ?? null
    },
    waitingFiles,
    approvalRule: currentCycle?.rule ?? process.cycles.sort((a, b) => a.order - b.order)[0]?.rule ?? null,
    approvalRuleByVersion,
    pendingApproversByVersion,
    files: process.files.map((file) => ({
      id: file.id,
      originalFilename: file.originalFilename || file.normalizedOriginalFilename,
      versions: file.versions
        .filter((item) => item.isCurrent)
        .map((version) => ({
          id: version.id,
          versionNumber: version.versionNumber,
          createdAt: version.createdAt,
          approvalRequired: version.approvalRequired,
          approvalRule: version.approvalRule,
          status: snapshot.fileStatuses[version.id] ?? "PENDING",
          hasViewFile: Boolean(version.viewStoragePath),
          viewMime: version.viewMime,
          downloadMime: version.downloadMime || version.mime
        }))
    })),
    roles: {
      uploader: {
        uploaderId: process.uploaderId,
        email: process.uploaderEmail,
        displayName: process.uploaderName
      },
      approvers: approvers.map((participant) => ({
        id: participant.id,
        email: participant.email,
        displayName: participant.displayName
      })),
      reviewers: reviewers.map((participant) => ({
        id: participant.id,
        email: participant.email,
        displayName: participant.displayName
      })),
      decisionsByVersion,
      historyByFile,
      allParticipants: participants.map((p) => ({
        id: p.id,
        email: p.email,
        displayName: p.displayName,
        tokenId: p.tokenId
      })),
      participantByTokenId: Object.fromEntries(participantByTokenId.entries())
    },
    versionToFileId: Object.fromEntries(fileVersionToFileId.entries()),
    scopes: token.scopes ?? []
  };
}

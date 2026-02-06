import { prisma } from "../db.js";
import { canonicalJson } from "../utils/canonicalJson.js";
import { sha256Hex } from "../utils/crypto.js";
import { AuditEventType } from "@prisma/client";

export type AuditPayload = {
  eventType: AuditEventType;
  processId?: string | null;
  cycleId?: string | null;
  fileId?: string | null;
  fileVersionId?: string | null;
  tokenId?: string | null;
  roleAtTime?: string | null;
  customerNumber?: string | null;
  uploaderId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  validatedData: unknown;
};

export async function appendAuditEvent(payload: AuditPayload) {
  const last = await prisma.auditEvent.findFirst({
    orderBy: { timestampUtc: "desc" }
  });
  const prevHash = last?.eventHash ?? "";
  const timestampUtc = new Date();
  const eventPayload = {
    timestampUtc: timestampUtc.toISOString(),
    ...payload,
    validatedData: payload.validatedData ?? {}
  };
  const canonical = canonicalJson(eventPayload);
  const eventHash = sha256Hex(canonical + prevHash);
  return prisma.auditEvent.create({
    data: {
      timestampUtc,
      eventType: payload.eventType,
      processId: payload.processId ?? null,
      cycleId: payload.cycleId ?? null,
      fileId: payload.fileId ?? null,
      fileVersionId: payload.fileVersionId ?? null,
      tokenId: payload.tokenId ?? null,
      roleAtTime: payload.roleAtTime ?? null,
      customerNumber: payload.customerNumber ?? null,
      uploaderId: payload.uploaderId ?? null,
      ip: payload.ip ?? null,
      userAgent: payload.userAgent ?? null,
      validatedData: payload.validatedData ?? {},
      prevHash,
      eventHash
    }
  });
}

export function verifyAuditChain(events: Array<{ prevHash: string; eventHash: string; payload: unknown }>) {
  let prev = "";
  for (const event of events) {
    const canonical = canonicalJson(event.payload);
    const computed = sha256Hex(canonical + prev);
    if (computed !== event.eventHash || event.prevHash !== prev) {
      return { ok: false, failedAt: event.eventHash };
    }
    prev = event.eventHash;
  }
  return { ok: true };
}

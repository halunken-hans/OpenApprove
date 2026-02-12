import { prisma } from "../db.js";
import { calculateProcessApprovalSnapshot } from "../services/approvals.js";

export function parseJsonString(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

export async function ensureFileVersionMutableForAnnotations(processId: string, fileVersionId: string) {
  const version = await prisma.fileVersion.findUnique({
    where: { id: fileVersionId },
    select: { isCurrent: true, approvalRequired: true, viewStoragePath: true }
  });
  if (!version || !version.isCurrent) return false;
  if (!version.approvalRequired) return false;
  if (!version.viewStoragePath) return false;
  const snapshot = await calculateProcessApprovalSnapshot(processId);
  const status = snapshot.fileStatuses[fileVersionId] ?? "PENDING";
  return status === "PENDING";
}

import { prisma } from "../db.js";
import { calculateProcessApprovalSnapshot } from "../services/approvals.js";

export function parseJsonString(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

export function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function sanitizeAnnotationObject(obj: any): any {
  if (obj === "alphabetical") return "alphabetic";
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeAnnotationObject);
  const out: Record<string, any> = {};
  Object.keys(obj).forEach((key) => {
    const value = (obj as any)[key];
    if (key === "textBaseline" && value === "alphabetical") {
      out[key] = "alphabetic";
    } else if (value === "alphabetical") {
      out[key] = "alphabetic";
    } else {
      out[key] = sanitizeAnnotationObject(value);
    }
  });
  return out;
}

export function formatDateDdMmYyyy(isoValue?: string | null) {
  if (!isoValue) return "-";
  const dt = new Date(isoValue);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatDateTime(isoValue?: string | Date | null) {
  if (!isoValue) return "-";
  const dt = isoValue instanceof Date ? isoValue : new Date(isoValue);
  if (Number.isNaN(dt.getTime())) return "-";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    pad(dt.getDate()) +
    "." +
    pad(dt.getMonth() + 1) +
    "." +
    dt.getFullYear() +
    " " +
    pad(dt.getHours()) +
    ":" +
    pad(dt.getMinutes()) +
    ":" +
    pad(dt.getSeconds())
  );
}

export function statusCss(status: string | null | undefined) {
  return "status-" + String(status || "PENDING").toLowerCase();
}

export function translateStatus(status: string | null | undefined, L: Record<string, string>) {
  const value = String(status || "PENDING").toUpperCase();
  if (value === "DRAFT") return L.statusDraft || value;
  if (value === "IN_REVIEW") return L.statusInReview || value;
  if (value === "PENDING") return L.statusPending || value;
  if (value === "APPROVED") return L.statusApproved || value;
  if (value === "REJECTED") return L.statusRejected || value;
  return value;
}

export async function ensureFileVersionMutableForAnnotations(processId: string, fileVersionId: string) {
  const version = await prisma.fileVersion.findUnique({
    where: { id: fileVersionId },
    select: { isCurrent: true }
  });
  if (!version || !version.isCurrent) return false;
  const snapshot = await calculateProcessApprovalSnapshot(processId);
  const status = snapshot.fileStatuses[fileVersionId] ?? "PENDING";
  return status === "PENDING";
}

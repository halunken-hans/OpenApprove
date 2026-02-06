import { ApprovalRule, ParticipantStatus } from "@prisma/client";

export function cycleComplete(rule: ApprovalRule, statuses: ParticipantStatus[]): boolean {
  if (statuses.length === 0) return true;
  if (rule === ApprovalRule.ALL_APPROVE) {
    return statuses.every(status => status === ParticipantStatus.APPROVED);
  }
  if (rule === ApprovalRule.ANY_APPROVE) {
    return statuses.some(status => status === ParticipantStatus.APPROVED);
  }
  return false;
}

export function rejectionRequiresReason(decision: "APPROVE" | "REJECT", reason?: string | null): boolean {
  if (decision !== "REJECT") return false;
  return !reason || reason.trim().length === 0;
}

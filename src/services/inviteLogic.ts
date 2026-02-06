import { ParticipantRole, ParticipantStatus } from "@prisma/client";

export function handoffRoleUpdate() {
  return { role: ParticipantRole.REVIEWER, status: ParticipantStatus.HANDED_OFF };
}

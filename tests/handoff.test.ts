import { describe, expect, it } from "vitest";
import { handoffRoleUpdate } from "../src/services/inviteLogic.js";
import { ParticipantRole, ParticipantStatus } from "@prisma/client";

describe("reviewer invite handoff", () => {
  it("downgrades approver on handoff", () => {
    const result = handoffRoleUpdate();
    expect(result.role).toBe(ParticipantRole.REVIEWER);
    expect(result.status).toBe(ParticipantStatus.HANDED_OFF);
  });
});

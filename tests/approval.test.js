import { describe, expect, it } from "vitest";
import { cycleComplete, rejectionRequiresReason } from "../src/services/approvalLogic.js";
import { ApprovalRule, ParticipantStatus } from "@prisma/client";
describe("approval cycles", () => {
    it("ALL_APPROVE requires all approvals", () => {
        const result = cycleComplete(ApprovalRule.ALL_APPROVE, [ParticipantStatus.APPROVED, ParticipantStatus.PENDING]);
        expect(result).toBe(false);
    });
    it("ANY_APPROVE allows any approval", () => {
        const result = cycleComplete(ApprovalRule.ANY_APPROVE, [ParticipantStatus.APPROVED, ParticipantStatus.PENDING]);
        expect(result).toBe(true);
    });
    it("rejection requires reason", () => {
        expect(rejectionRequiresReason("REJECT", "")).toBe(true);
        expect(rejectionRequiresReason("REJECT", "Not ok")).toBe(false);
    });
});

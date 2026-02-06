import { describe, expect, it } from "vitest";
import { canSendEmail } from "../src/services/tokens.js";
describe("email scope restrictions", () => {
    it("blocks viewer/uploader scopes", () => {
        expect(canSendEmail("CUSTOMER_PORTAL_VIEW")).toBe(false);
        expect(canSendEmail("UPLOAD_PROCESS")).toBe(false);
    });
    it("allows reviewer/approver scopes", () => {
        expect(canSendEmail("DECIDE")).toBe(true);
        expect(canSendEmail("INVITE_REVIEWER")).toBe(true);
    });
});

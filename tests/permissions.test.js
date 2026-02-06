import { describe, expect, it } from "vitest";
import { canAccessCustomer, canAccessMyUploads } from "../src/services/permissions.js";
describe("portal permissions", () => {
    it("enforces customerNumber binding", () => {
        expect(canAccessCustomer("C123", "C123")).toBe(true);
        expect(canAccessCustomer("C123", "C999")).toBe(false);
    });
    it("enforces uploaderId binding", () => {
        expect(canAccessMyUploads("U1", "U1")).toBe(true);
        expect(canAccessMyUploads("U1", "U2")).toBe(false);
    });
});

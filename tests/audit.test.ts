import { describe, expect, it } from "vitest";
import { verifyAuditChain } from "../src/services/audit.js";
import { sha256Hex } from "../src/utils/crypto.js";
import { canonicalJson } from "../src/utils/canonicalJson.js";

describe("audit chain", () => {
  it("verifies a valid chain", () => {
    const payload1 = { eventType: "A", timestampUtc: "2020-01-01T00:00:00Z" };
    const hash1 = sha256Hex(canonicalJson(payload1) + "");
    const payload2 = { eventType: "B", timestampUtc: "2020-01-01T00:00:01Z" };
    const hash2 = sha256Hex(canonicalJson(payload2) + hash1);
    const result = verifyAuditChain([
      { prevHash: "", eventHash: hash1, payload: payload1 },
      { prevHash: hash1, eventHash: hash2, payload: payload2 }
    ]);
    expect(result.ok).toBe(true);
  });

  it("rejects a tampered chain", () => {
    const payload1 = { eventType: "A", timestampUtc: "2020-01-01T00:00:00Z" };
    const hash1 = sha256Hex(canonicalJson(payload1) + "");
    const payload2 = { eventType: "B", timestampUtc: "2020-01-01T00:00:01Z" };
    const result = verifyAuditChain([
      { prevHash: "", eventHash: hash1, payload: payload1 },
      { prevHash: hash1, eventHash: "bad", payload: payload2 }
    ]);
    expect(result.ok).toBe(false);
  });
});

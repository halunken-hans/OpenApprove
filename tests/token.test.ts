import { describe, expect, it } from "vitest";
import { isTokenUsable } from "../src/services/tokens.js";

describe("token validation", () => {
  it("accepts valid token", () => {
    const result = isTokenUsable({
      expiry: new Date(Date.now() + 1000),
      oneTime: false,
      lastUsedAt: null
    });
    expect(result.ok).toBe(true);
  });

  it("rejects expired token", () => {
    const result = isTokenUsable({
      expiry: new Date(Date.now() - 1000),
      oneTime: false,
      lastUsedAt: null
    });
    expect(result.ok).toBe(false);
  });

  it("rejects used one-time token", () => {
    const result = isTokenUsable({
      expiry: new Date(Date.now() + 1000),
      oneTime: true,
      lastUsedAt: new Date()
    });
    expect(result.ok).toBe(false);
  });
});

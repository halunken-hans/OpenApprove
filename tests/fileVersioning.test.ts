import { describe, expect, it } from "vitest";
import { nextVersionNumber } from "../src/services/files.js";

describe("file versioning", () => {
  it("increments version numbers", () => {
    expect(nextVersionNumber(undefined)).toBe(1);
    expect(nextVersionNumber(1)).toBe(2);
  });
});

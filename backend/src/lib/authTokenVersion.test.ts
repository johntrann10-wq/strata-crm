import { describe, expect, it } from "vitest";
import { isAuthTokenVersionMismatch, normalizeTokenVersion } from "./authTokenVersion.js";

describe("authTokenVersion helpers", () => {
  it("normalizes token versions safely", () => {
    expect(normalizeTokenVersion(2)).toBe(2);
    expect(normalizeTokenVersion("3")).toBe(3);
    expect(normalizeTokenVersion("not-a-number")).toBe(1);
    expect(normalizeTokenVersion(undefined)).toBe(1);
  });

  it("detects mismatched token versions only when enforced", () => {
    expect(isAuthTokenVersionMismatch(1, 1)).toBe(false);
    expect(isAuthTokenVersionMismatch(2, 1)).toBe(true);
    expect(isAuthTokenVersionMismatch(undefined, 1)).toBe(false);
    expect(isAuthTokenVersionMismatch(undefined, 2)).toBe(true);
    expect(isAuthTokenVersionMismatch(1, null)).toBe(false);
  });
});

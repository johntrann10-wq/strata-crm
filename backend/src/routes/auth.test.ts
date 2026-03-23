import { describe, expect, it } from "vitest";

describe("auth route helper logic", () => {
  it("normalizes sign-in emails before lookup", async () => {
    const { normalizeEmail } = await import("./auth.js");
    expect(normalizeEmail("  USER@Example.COM ")).toBe("user@example.com");
  });

  it("only accepts safe in-app redirect paths for Google auth", async () => {
    const { resolveSafeRedirectPath } = await import("./auth.js");
    expect(resolveSafeRedirectPath("/signed-in")).toBe("/signed-in");
    expect(resolveSafeRedirectPath("https://evil.example")).toBe("/signed-in");
    expect(resolveSafeRedirectPath("//evil.example")).toBe("/signed-in");
    expect(resolveSafeRedirectPath("settings")).toBe("/signed-in");
  });
});

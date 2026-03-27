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

  it("defaults Google auth redirects to the app when state is missing or invalid", async () => {
    const { resolveGoogleStateRedirect } = await import("./auth.js");
    expect(resolveGoogleStateRedirect(undefined)).toBe("/signed-in");
    expect(resolveGoogleStateRedirect("")).toBe("/signed-in");
    expect(resolveGoogleStateRedirect("{not-json")).toBe("/signed-in");
    expect(resolveGoogleStateRedirect(JSON.stringify({ redirectPath: "/signed-in" }))).toBe("/signed-in");
  });
});

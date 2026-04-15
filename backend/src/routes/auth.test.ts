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

  it("builds post-auth redirects with a hash token instead of a query token", async () => {
    const { buildPostAuthRedirectUrl } = await import("./auth.js");
    expect(buildPostAuthRedirectUrl("https://app.strata.test", "/signed-in", "abc123")).toBe(
      "https://app.strata.test/signed-in#authToken=abc123"
    );
    expect(buildPostAuthRedirectUrl("https://app.strata.test", "/signed-in#tab=billing", "abc123")).toBe(
      "https://app.strata.test/signed-in#tab=billing&authToken=abc123"
    );
  });

  it("uses the configured frontend origin for security-sensitive links", async () => {
    const { resolveFrontendBaseUrl } = await import("./auth.js");
    const previous = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = "https://app.strata.test/";
    expect(resolveFrontendBaseUrl({} as any)).toBe("https://app.strata.test");
    if (previous === undefined) {
      delete process.env.FRONTEND_URL;
    } else {
      process.env.FRONTEND_URL = previous;
    }
  });

  it("rejects reset URLs when no frontend origin is configured", async () => {
    const { resolveFrontendBaseUrl } = await import("./auth.js");
    const previous = process.env.FRONTEND_URL;
    delete process.env.FRONTEND_URL;
    expect(() => resolveFrontendBaseUrl({} as any)).toThrowError("Password reset is not configured.");
    if (previous !== undefined) process.env.FRONTEND_URL = previous;
  });

  it("backfills Google linkage and verification for existing email accounts", async () => {
    const { resolveGoogleAccountUpdates } = await import("./auth.js");
    const updates = resolveGoogleAccountUpdates(
      {
        googleProfileId: null,
        firstName: null,
        lastName: "Existing",
        emailVerified: false,
      },
      {
        googleProfileId: "google-sub-123",
        firstName: "Jamie",
        lastName: "Fresh",
      }
    );
    expect(updates).toMatchObject({
      googleProfileId: "google-sub-123",
      firstName: "Jamie",
      emailVerified: true,
    });
    expect(updates?.lastName).toBeUndefined();
    expect(updates?.updatedAt).toBeInstanceOf(Date);
  });

  it("returns no Google account updates when the account is already linked", async () => {
    const { resolveGoogleAccountUpdates } = await import("./auth.js");
    const updates = resolveGoogleAccountUpdates(
      {
        googleProfileId: "google-sub-123",
        firstName: "Jamie",
        lastName: "Existing",
        emailVerified: true,
      },
      {
        googleProfileId: "google-sub-123",
        firstName: "Jamie",
        lastName: "Fresh",
      }
    );
    expect(updates).toBeNull();
  });

  it("rejects a Google sign-in when the email is linked to a different Google profile", async () => {
    const { resolveGoogleAccountUpdates } = await import("./auth.js");
    expect(() =>
      resolveGoogleAccountUpdates(
        {
          googleProfileId: "google-sub-123",
          firstName: "Jamie",
          lastName: "Existing",
          emailVerified: true,
        },
        {
          googleProfileId: "google-sub-999",
          firstName: "Jamie",
          lastName: "Existing",
        }
      )
    ).toThrowError("This email is already linked to a different Google account.");
  });
});

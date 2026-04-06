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

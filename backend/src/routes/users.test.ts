import { describe, expect, it } from "vitest";

describe("users route account deletion helpers", () => {
  it("builds a unique placeholder email for deleted users", async () => {
    const { buildDeletedUserPlaceholderEmail } = await import("./users.js");
    expect(buildDeletedUserPlaceholderEmail("1234-abcd")).toBe(
      "deleted+1234-abcd@deleted.stratacrm.invalid"
    );
  });

  it("hashes deletion audit emails from normalized addresses", async () => {
    const { hashDeletionAuditEmail } = await import("./users.js");
    expect(hashDeletionAuditEmail("  OWNER@Example.com ")).toBe(
      hashDeletionAuditEmail("owner@example.com")
    );
  });

  it("includes linked auth and workspace access in the deletion preview", async () => {
    const { buildAccountDeletionPreview } = await import("./users.js");
    const preview = buildAccountDeletionPreview({
      hasPassword: true,
      hasGoogle: true,
      hasApple: true,
      ownedBusinessCount: 1,
      businessMembershipCount: 2,
      linkedStaffProfileCount: 1,
    });

    expect(preview.deletedDataSummary).toContain("Email and password sign-in for this account");
    expect(preview.deletedDataSummary.some((item) => item.includes("Linked Apple and Google"))).toBe(true);
    expect(preview.deletedDataSummary).toContain("Business memberships, permissions, and workspace access");
    expect(preview.retainedDataSummary.some((item) => item.includes("tax records"))).toBe(true);
    expect(preview.requiresHistoricalRetention).toBe(true);
  });

  it("omits retention copy when no historical business records are attached", async () => {
    const { buildAccountDeletionPreview } = await import("./users.js");
    const preview = buildAccountDeletionPreview({
      hasPassword: false,
      hasGoogle: false,
      hasApple: false,
      ownedBusinessCount: 0,
      businessMembershipCount: 0,
      linkedStaffProfileCount: 0,
    });

    expect(preview.retainedDataSummary).toEqual([]);
    expect(preview.requiresHistoricalRetention).toBe(false);
  });
});

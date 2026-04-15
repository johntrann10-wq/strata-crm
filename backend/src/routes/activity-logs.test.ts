import { describe, expect, it } from "vitest";

describe("activity log serialization", () => {
  it("sanitizes metadata before returning it to the client", async () => {
    const { serializeActivityLogRecord } = await import("./activity-logs.js");
    const serialized = serializeActivityLogRecord({
      id: "activity_123",
      action: "appointment.media_added",
      entityType: "appointment",
      entityId: "entity_123",
      userId: "user_123",
      metadata: JSON.stringify({
        label: "Estimate",
        url: "https://app.strata.test/public/invoice/inv_123?token=public_token_123",
        recipientEmail: "owner@example.com",
      }),
      createdAt: new Date("2026-04-14T12:00:00.000Z"),
    });

    expect(serialized.metadata).toBe(
      JSON.stringify({
        label: "Estimate",
        url: "https://app.strata.test/public/invoice/inv_123?token=[REDACTED]",
        recipientEmail: "o***@example.com",
      })
    );
    expect(serialized.description).toContain("[REDACTED]");
    expect(serialized.description).not.toContain("public_token_123");
  });

  it("sanitizes plain-string metadata when the payload is not valid json", async () => {
    const { serializeActivityLogRecord } = await import("./activity-logs.js");
    const serialized = serializeActivityLogRecord({
      id: "activity_456",
      action: "appointment.note_added",
      entityType: "appointment",
      entityId: "entity_456",
      userId: "user_456",
      metadata: "Reset link copied from https://app.strata.test/reset-password?token=reset_123",
      createdAt: new Date("2026-04-14T12:00:00.000Z"),
    });

    expect(serialized.metadata).toBe(
      "Reset link copied from https://app.strata.test/reset-password?token=[REDACTED]"
    );
  });
});

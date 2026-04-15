import { describe, expect, it } from "vitest";

describe("notification log serialization", () => {
  it("returns a minimized, masked record for settings views", async () => {
    const { serializeNotificationLogRecord } = await import("./notification-logs.js");
    const serialized = serializeNotificationLogRecord({
      id: "notif_123",
      channel: "email",
      recipient: "owner@example.com",
      subject: "Invoice ready for Coastline Detail Co.",
      sentAt: new Date("2026-04-14T12:00:00.000Z"),
      providerStatus: "delivered",
      providerStatusAt: new Date("2026-04-14T12:01:00.000Z"),
      deliveredAt: new Date("2026-04-14T12:01:00.000Z"),
      providerErrorCode: null,
      error: "Provider rejected https://app.strata.test/reset-password?token=reset_123",
      retryCount: 2,
      lastRetryAt: new Date("2026-04-14T12:05:00.000Z"),
    });

    expect(serialized).toEqual({
      id: "notif_123",
      channel: "email",
      recipient: "o***@example.com",
      subject: "Invoice ready for Coastline Detail Co.",
      sentAt: new Date("2026-04-14T12:00:00.000Z"),
      status: "failed",
      providerStatus: "delivered",
      providerStatusAt: new Date("2026-04-14T12:01:00.000Z"),
      deliveredAt: new Date("2026-04-14T12:01:00.000Z"),
      providerErrorCode: null,
      error: "Provider rejected https://app.strata.test/reset-password?token=[REDACTED]",
      retryCount: 2,
      lastRetryAt: new Date("2026-04-14T12:05:00.000Z"),
    });
    expect(serialized).not.toHaveProperty("providerMessageId");
    expect(serialized).not.toHaveProperty("metadata");
  });

  it("masks sms recipients without removing delivery state", async () => {
    const { serializeNotificationLogRecord } = await import("./notification-logs.js");
    const serialized = serializeNotificationLogRecord({
      id: "notif_456",
      channel: "sms",
      recipient: "+1 (555) 222-1111",
      subject: null,
      sentAt: new Date("2026-04-14T12:00:00.000Z"),
      providerStatus: "queued",
      providerStatusAt: null,
      deliveredAt: null,
      providerErrorCode: null,
      error: null,
      retryCount: 0,
      lastRetryAt: null,
    });

    expect(serialized.recipient).toBe("***-***-1111");
    expect(serialized.status).toBe("sent");
  });
});

import { describe, expect, it } from "vitest";

describe("business route serialization", () => {
  it("never returns the outbound webhook signing secret in API payloads", async () => {
    const { serializeBusiness } = await import("./businesses.js");
    const record = {
      id: "biz_123",
      ownerId: "user_123",
      name: "Coastline Detail Co.",
      type: "auto_detailing",
      integrationWebhookSecret: "super-secret-value",
      integrationWebhookEvents: "[\"lead.created\"]",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    } as Parameters<typeof serializeBusiness>[0];
    const serialized = serializeBusiness(record);

    expect(serialized).not.toHaveProperty("integrationWebhookSecret");
    expect(serialized.integrationWebhookEvents).toEqual(["lead.created"]);
  });
});

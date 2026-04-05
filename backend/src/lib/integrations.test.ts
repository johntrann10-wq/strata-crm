import { describe, expect, it } from "vitest";
import { buildOutboundWebhookRequest, buildOutboundWebhookSignature } from "./integrations.js";

describe("outbound webhook helpers", () => {
  it("builds a stable signed webhook request envelope", () => {
    const request = buildOutboundWebhookRequest({
      config: {
        webhookUrl: "https://hooks.example.com/strata",
        webhookSecret: "super-secret",
        webhookEvents: ["invoice.sent"],
        payloadVersion: "2026-04-04",
      },
      payload: {
        version: "2026-04-04",
        mode: "live",
        source: "strata",
        event: {
          id: "activity-1",
          type: "invoice.sent",
          occurredAt: "2026-04-04T18:10:00.000Z",
        },
        business: {
          id: "biz-1",
        },
        actor: {
          userId: "user-1",
        },
        entity: {
          type: "invoice",
          id: "invoice-1",
        },
        data: {
          total: 125,
        },
      },
    });

    expect(request.url).toBe("https://hooks.example.com/strata");
    expect(request.headers["x-strata-event"]).toBe("invoice.sent");
    expect(request.headers["x-strata-event-id"]).toBe("activity-1");
    expect(request.headers["x-strata-payload-version"]).toBe("2026-04-04");
    expect(request.headers["x-strata-delivery-mode"]).toBe("live");
    expect(request.headers["x-strata-signature"]).toBe(
      buildOutboundWebhookSignature(request.body, "super-secret")
    );
    expect(JSON.parse(request.body)).toMatchObject({
      version: "2026-04-04",
      event: {
        id: "activity-1",
        type: "invoice.sent",
      },
      business: {
        id: "biz-1",
      },
    });
  });

  it("omits the signature header payload when no signing secret is configured", () => {
    const signature = buildOutboundWebhookSignature('{"ok":true}', null);
    expect(signature).toBe("");
  });
});

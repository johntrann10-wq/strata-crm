import crypto from "crypto";
import { describe, expect, it } from "vitest";
import { TWILIO_TEMPLATE_SLUGS, shouldQueueMissedCallTextBack, validateTwilioWebhookSignature } from "./twilio.js";

describe("twilio helpers", () => {
  it("validates Twilio webhook signatures using the signed callback URL and params", () => {
    const url = "https://api.strata.test/api/integrations/twilio/status/conn-123";
    const params = {
      MessageSid: "SM123",
      MessageStatus: "delivered",
      To: "+15555551212",
    };
    const authToken = "twilio-auth-token";
    const payload =
      url +
      Object.keys(params)
        .sort()
        .map((key) => `${key}${params[key as keyof typeof params]}`)
        .join("");
    const signature = crypto.createHmac("sha1", authToken).update(payload, "utf8").digest("base64");

    expect(
      validateTwilioWebhookSignature({
        url,
        params,
        signature,
        authToken,
      })
    ).toBe(true);

    expect(
      validateTwilioWebhookSignature({
        url,
        params,
        signature: "bad-signature",
        authToken,
      })
    ).toBe(false);
  });

  it("exposes the production SMS template set", () => {
    expect(TWILIO_TEMPLATE_SLUGS).toEqual([
      "lead_auto_response",
      "missed_call_text_back",
      "appointment_confirmation",
      "booking_request_received",
      "booking_request_customer_update",
      "appointment_reminder",
      "payment_receipt",
      "review_request",
      "lapsed_client_reengagement",
    ]);
  });

  it("only treats inbound missed outcomes as missed-call text-back candidates", () => {
    expect(
      shouldQueueMissedCallTextBack({
        Direction: "inbound",
        CallStatus: "no-answer",
      })
    ).toBe(true);

    expect(
      shouldQueueMissedCallTextBack({
        Direction: "inbound",
        CallStatus: "completed",
        CallDuration: "0",
      })
    ).toBe(true);

    expect(
      shouldQueueMissedCallTextBack({
        Direction: "inbound",
        CallStatus: "completed",
        CallDuration: "45",
      })
    ).toBe(false);

    expect(
      shouldQueueMissedCallTextBack({
        Direction: "outbound-api",
        CallStatus: "no-answer",
      })
    ).toBe(false);
  });
});

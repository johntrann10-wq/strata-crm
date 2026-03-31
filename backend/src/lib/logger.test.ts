import { describe, expect, it } from "vitest";
import { sanitizeContext } from "./logger.js";

describe("sanitizeContext", () => {
  it("redacts tokens and masks contact fields", () => {
    const sanitized = sanitizeContext({
      token: "abc123",
      recipientEmail: "owner@example.com",
      clientPhone: "(555) 123-4567",
      clientAddress: "123 Ocean Ave",
      nested: {
        authorization: "Bearer abc",
        to: "vip@example.com",
      },
    });

    expect(sanitized).toEqual({
      token: "[REDACTED]",
      recipientEmail: "o***@example.com",
      clientPhone: "***-***-4567",
      clientAddress: "[REDACTED]",
      nested: {
        authorization: "[REDACTED]",
        to: "v***@example.com",
      },
    });
  });

  it("leaves operational ids and non-sensitive fields untouched", () => {
    const sanitized = sanitizeContext({
      requestId: "req_123",
      businessId: "biz_123",
      quoteId: "quote_123",
      error: "SMTP failed",
    });

    expect(sanitized).toEqual({
      requestId: "req_123",
      businessId: "biz_123",
      quoteId: "quote_123",
      error: "SMTP failed",
    });
  });
});

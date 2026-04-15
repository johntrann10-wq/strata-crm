import { describe, expect, it } from "vitest";
import { sanitizeContext, sanitizeStringValue } from "./logger.js";

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

  it("redacts sensitive tokens inside generic string values and urls", () => {
    const sanitized = sanitizeContext({
      error:
        "Reset link failed: https://app.strata.test/reset-password?token=reset_123&next=%2Fsigned-in",
      note: "Authorization header was Bearer abc.def.ghi",
      inviteUrl: "https://app.strata.test/claim-invite?inviteToken=invite_123",
      nested: {
        message: "Use authToken=hash_token_123 when resuming session",
      },
    });

    expect(sanitized).toEqual({
      error:
        "Reset link failed: https://app.strata.test/reset-password?token=[REDACTED]&next=%2Fsigned-in",
      note: "Authorization header was Bearer [REDACTED]",
      inviteUrl: "https://app.strata.test/claim-invite?inviteToken=[REDACTED]",
      nested: {
        message: "Use authToken=[REDACTED] when resuming session",
      },
    });
  });
});

describe("sanitizeStringValue", () => {
  it("redacts jwt-like strings without removing operational context", () => {
    expect(
      sanitizeStringValue("Callback failed after redirect #authToken=eyJhbGciOiJIUzI1NiJ9.payload.signature")
    ).toBe("Callback failed after redirect #authToken=[REDACTED]");
  });
});

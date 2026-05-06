import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildPublicBookingRequestUrl,
  createBookingRequestToken,
  isBookingRequestTokenCurrent,
  verifyBookingRequestToken,
  verifyCurrentBookingRequestToken,
} from "./bookingRequestAccess.js";

describe("bookingRequestAccess", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("includes the requested token version in booking request tokens", () => {
    const token = createBookingRequestToken({
      requestId: "req-123",
      businessId: "biz-123",
      tokenVersion: 4,
    });
    const payload = verifyBookingRequestToken(token, { requestId: "req-123", businessId: "biz-123" });
    expect(payload?.ver).toBe(4);
  });

  it("rejects replaying a request token against another request id", () => {
    const token = createBookingRequestToken({
      requestId: "req-123",
      businessId: "biz-123",
      tokenVersion: 1,
    });

    expect(verifyBookingRequestToken(token, { requestId: "req-999", businessId: "biz-123" })).toBeNull();
  });

  it("rejects replaying a request token against another business id", () => {
    const token = createBookingRequestToken({
      requestId: "req-123",
      businessId: "biz-123",
      tokenVersion: 1,
    });

    expect(verifyBookingRequestToken(token, { requestId: "req-123", businessId: "biz-999" })).toBeNull();
  });

  it("keeps default booking request response links valid for 30 days", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-16T10:00:00.000Z"));

    const token = createBookingRequestToken({
      requestId: "req-123",
      businessId: "biz-123",
    });

    vi.setSystemTime(new Date("2026-05-16T09:59:00.000Z"));
    expect(verifyCurrentBookingRequestToken(token, { requestId: "req-123", businessId: "biz-123" }, 1)).not.toBeNull();

    vi.setSystemTime(new Date("2026-05-17T10:00:00.000Z"));
    expect(verifyCurrentBookingRequestToken(token, { requestId: "req-123", businessId: "biz-123" }, 1)).toBeNull();
  });

  it("rejects expired request tokens", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-16T10:00:00.000Z"));

    const token = createBookingRequestToken({
      requestId: "req-123",
      businessId: "biz-123",
      expiresIn: "1s",
    });

    vi.setSystemTime(new Date("2026-04-16T10:00:02.000Z"));
    expect(verifyCurrentBookingRequestToken(token, { requestId: "req-123", businessId: "biz-123" }, 1)).toBeNull();
  });

  it("treats rotated request versions as revoked", () => {
    const token = createBookingRequestToken({
      requestId: "req-123",
      businessId: "biz-123",
      tokenVersion: 2,
    });
    const payload = verifyCurrentBookingRequestToken(token, { requestId: "req-123", businessId: "biz-123" }, 2);
    expect(isBookingRequestTokenCurrent(payload, 2)).toBe(true);
    expect(verifyCurrentBookingRequestToken(token, { requestId: "req-123", businessId: "biz-123" }, 3)).toBeNull();
  });

  it("builds the public request url with the token attached", () => {
    const url = buildPublicBookingRequestUrl({
      businessId: "biz-123",
      requestId: "req-123",
      token: "signed-token",
    });
    expect(url).toContain("/booking-request/biz-123/req-123");
    expect(url).toContain("token=signed-token");
  });
});

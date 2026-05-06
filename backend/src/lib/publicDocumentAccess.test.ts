import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPublicDocumentToken,
  getPublicDocumentTokenExpiry,
  isPublicDocumentTokenCurrent,
  verifyAnyPublicDocumentToken,
  verifyCurrentPublicDocumentToken,
  verifyPublicDocumentToken,
} from "./publicDocumentAccess.js";

describe("publicDocumentAccess", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("includes the requested token version in public document tokens", () => {
    const token = createPublicDocumentToken({
      kind: "invoice",
      entityId: "inv-123",
      businessId: "biz-123",
      tokenVersion: 3,
    });
    const payload = verifyAnyPublicDocumentToken(token);
    expect(payload?.ver).toBe(3);
  });

  it("defaults token version to 1 when missing", () => {
    const token = createPublicDocumentToken({
      kind: "quote",
      entityId: "quote-123",
      businessId: "biz-123",
    });
    const payload = verifyAnyPublicDocumentToken(token);
    expect(payload?.ver).toBe(1);
    expect(verifyPublicDocumentToken(token, { kind: "quote", entityId: "quote-123" })?.ver).toBe(1);
  });

  it("uses longer practical default expiry windows for customer-facing document links", () => {
    expect(getPublicDocumentTokenExpiry("appointment")).toBe("90d");
    expect(getPublicDocumentTokenExpiry("quote")).toBe("90d");
    expect(getPublicDocumentTokenExpiry("invoice")).toBe("365d");
  });

  it("returns a current payload for a valid token and matching version", () => {
    const token = createPublicDocumentToken({
      kind: "appointment",
      entityId: "appt-123",
      businessId: "biz-123",
      tokenVersion: 2,
    });

    const payload = verifyCurrentPublicDocumentToken(
      token,
      { kind: "appointment", entityId: "appt-123" },
      2
    );

    expect(payload?.businessId).toBe("biz-123");
    expect(isPublicDocumentTokenCurrent(payload, 2)).toBe(true);
  });

  it("rejects access when the token is replayed against a neighboring record id", () => {
    const token = createPublicDocumentToken({
      kind: "invoice",
      entityId: "inv-123",
      businessId: "biz-123",
      tokenVersion: 1,
    });

    expect(
      verifyCurrentPublicDocumentToken(token, { kind: "invoice", entityId: "inv-999" }, 1)
    ).toBeNull();
  });

  it("rejects expired tokens", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-14T00:00:00.000Z"));

    const token = createPublicDocumentToken({
      kind: "invoice",
      entityId: "inv-123",
      businessId: "biz-123",
      expiresIn: "1s",
    });

    vi.setSystemTime(new Date("2026-04-14T00:00:02.000Z"));

    expect(
      verifyCurrentPublicDocumentToken(token, { kind: "invoice", entityId: "inv-123" }, 1)
    ).toBeNull();
  });

  it("rejects revoked tokens when the document version has been rotated", () => {
    const token = createPublicDocumentToken({
      kind: "quote",
      entityId: "quote-123",
      businessId: "biz-123",
      tokenVersion: 2,
    });

    expect(
      verifyCurrentPublicDocumentToken(token, { kind: "quote", entityId: "quote-123" }, 3)
    ).toBeNull();
  });

  it("rejects invalid token strings", () => {
    expect(
      verifyCurrentPublicDocumentToken("definitely-not-a-real-token", { kind: "invoice", entityId: "inv-123" }, 1)
    ).toBeNull();
  });

  it("issues unique tokens for the same document payload", () => {
    const one = createPublicDocumentToken({
      kind: "invoice",
      entityId: "inv-123",
      businessId: "biz-123",
      tokenVersion: 1,
    });
    const two = createPublicDocumentToken({
      kind: "invoice",
      entityId: "inv-123",
      businessId: "biz-123",
      tokenVersion: 1,
    });

    expect(one).not.toBe(two);
  });
});

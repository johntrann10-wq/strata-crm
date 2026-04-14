import { describe, expect, it } from "vitest";
import {
  createPublicDocumentToken,
  verifyAnyPublicDocumentToken,
  verifyPublicDocumentToken,
} from "./publicDocumentAccess.js";

describe("publicDocumentAccess", () => {
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
});

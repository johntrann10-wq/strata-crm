import { describe, it, expect } from "vitest";
import { z } from "zod";

const createSchema = z.object({
  clientId: z.string().uuid(),
  appointmentId: z.string().uuid().optional(),
  lineItems: z.array(
    z.object({
      description: z.string().min(1),
      quantity: z.number().positive(),
      unitPrice: z.number().min(0),
    })
  ).min(1),
  discountAmount: z.number().min(0).optional(),
});
const sendSchema = z.object({
  message: z.string().max(2000).optional(),
  recipientEmail: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().email().optional()
  ),
  recipientName: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().max(120).optional()
  ),
});

describe("invoices route logic", () => {
  it("createSchema accepts valid input and rejects invalid clientId", () => {
    const valid = createSchema.safeParse({
      clientId: "550e8400-e29b-41d4-a716-446655440000",
      lineItems: [{ description: "Oil change", quantity: 1, unitPrice: 50 }],
    });
    expect(valid.success).toBe(true);
    const invalid = createSchema.safeParse({ clientId: "not-a-uuid" });
    expect(invalid.success).toBe(false);
  });

  it("createSchema with discountAmount applies min 0", () => {
    const withDiscount = createSchema.safeParse({
      clientId: "550e8400-e29b-41d4-a716-446655440000",
      lineItems: [{ description: "Oil change", quantity: 1, unitPrice: 50 }],
      discountAmount: 10,
    });
    expect(withDiscount.success).toBe(true);
    const negative = createSchema.safeParse({
      clientId: "550e8400-e29b-41d4-a716-446655440000",
      lineItems: [{ description: "Oil change", quantity: 1, unitPrice: 50 }],
      discountAmount: -1,
    });
    expect(negative.success).toBe(false);
  });

  it("multi-tenant: clientId must be UUID to avoid injection", () => {
    const bad = createSchema.safeParse({ clientId: "1; DELETE FROM clients;--" });
    expect(bad.success).toBe(false);
  });

  it("requires at least one valid line item", () => {
    const emptyItems = createSchema.safeParse({
      clientId: "550e8400-e29b-41d4-a716-446655440000",
      lineItems: [],
    });
    expect(emptyItems.success).toBe(false);

    const invalidQuantity = createSchema.safeParse({
      clientId: "550e8400-e29b-41d4-a716-446655440000",
      lineItems: [{ description: "Test", quantity: 0, unitPrice: 25 }],
    });
    expect(invalidQuantity.success).toBe(false);

    const invalidPrice = createSchema.safeParse({
      clientId: "550e8400-e29b-41d4-a716-446655440000",
      lineItems: [{ description: "Test", quantity: 1, unitPrice: -1 }],
    });
    expect(invalidPrice.success).toBe(false);
  });

  it("accepts direct-recipient invoice send overrides", () => {
    const result = sendSchema.safeParse({
      recipientEmail: "billing@example.com",
      recipientName: "Billing Contact",
      message: "Invoice attached.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid direct-recipient invoice emails", () => {
    const result = sendSchema.safeParse({
      recipientEmail: "bad-address",
    });
    expect(result.success).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { z } from "zod";

const createSchema = z.object({
  clientId: z.string().uuid(),
  appointmentId: z.string().uuid().optional(),
  lineItems: z.array(z.object({ description: z.string(), quantity: z.number(), unitPrice: z.number() })).optional(),
  discountAmount: z.number().min(0).optional(),
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
    const withDiscount = createSchema.safeParse({ clientId: "550e8400-e29b-41d4-a716-446655440000", discountAmount: 10 });
    expect(withDiscount.success).toBe(true);
    const negative = createSchema.safeParse({ clientId: "550e8400-e29b-41d4-a716-446655440000", discountAmount: -1 });
    expect(negative.success).toBe(false);
  });

  it("multi-tenant: clientId must be UUID to avoid injection", () => {
    const bad = createSchema.safeParse({ clientId: "1; DELETE FROM clients;--" });
    expect(bad.success).toBe(false);
  });
});

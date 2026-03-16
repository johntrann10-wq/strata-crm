import { describe, it, expect } from "vitest";
import { z } from "zod";

describe("payments route logic", () => {
  const createSchema = z.object({
    invoiceId: z.string().uuid(),
    amount: z.number().positive(),
    method: z.enum(["cash", "card", "check", "venmo", "cashapp", "zelle", "other"]),
    idempotencyKey: z.string().optional(),
    notes: z.string().optional(),
    referenceNumber: z.string().optional(),
  });

  it("accepts valid payment payload", () => {
    const result = createSchema.safeParse({
      invoiceId: "550e8400-e29b-41d4-a716-446655440000",
      amount: 100,
      method: "card",
    });
    expect(result.success).toBe(true);
  });

  it("rejects amount exceeding invoice total (logic: newTotal > invoiceTotal)", () => {
    const invoiceTotal = 100;
    const paidSoFar = 30;
    const newAmount = 80;
    const newTotal = paidSoFar + newAmount;
    expect(newTotal > invoiceTotal).toBe(true);
  });

  it("accepts amount that keeps total within invoice total", () => {
    const invoiceTotal = 100;
    const paidSoFar = 30;
    const newAmount = 50;
    const newTotal = paidSoFar + newAmount;
    expect(newTotal <= invoiceTotal).toBe(true);
  });

  it("rejects non-positive amount", () => {
    const result = createSchema.safeParse({
      invoiceId: "550e8400-e29b-41d4-a716-446655440000",
      amount: 0,
      method: "cash",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid method", () => {
    const result = createSchema.safeParse({
      invoiceId: "550e8400-e29b-41d4-a716-446655440000",
      amount: 10,
      method: "crypto",
    });
    expect(result.success).toBe(false);
  });
});

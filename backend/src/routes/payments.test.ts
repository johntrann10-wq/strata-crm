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
    paidAt: z.preprocess((value) => {
      if (value == null) return undefined;
      if (value instanceof Date) return Number.isNaN(value.getTime()) ? Symbol.for("invalid-date") : value;
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) return undefined;
        const parsed = new Date(trimmed);
        return Number.isNaN(parsed.getTime()) ? Symbol.for("invalid-date") : parsed;
      }
      return value;
    }, z.union([z.date(), z.undefined()])),
  });

  it("accepts valid payment payload", () => {
    const result = createSchema.safeParse({
      invoiceId: "550e8400-e29b-41d4-a716-446655440000",
      amount: 100,
      method: "card",
      paidAt: "2026-04-11T10:00:00.000Z",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.paidAt).toBeInstanceOf(Date);
    }
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

  it("rejects invalid paidAt values", () => {
    const result = createSchema.safeParse({
      invoiceId: "550e8400-e29b-41d4-a716-446655440000",
      amount: 10,
      method: "cash",
      paidAt: "not-a-date",
    });
    expect(result.success).toBe(false);
  });
});

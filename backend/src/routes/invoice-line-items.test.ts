import { describe, it, expect } from "vitest";
import { z } from "zod";

const createSchema = z.object({
  invoiceId: z.string().uuid(),
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
});

describe("invoice-line-items route logic", () => {
  it("createSchema accepts valid input", () => {
    const result = createSchema.safeParse({
      invoiceId: "550e8400-e29b-41d4-a716-446655440000",
      description: "Oil change",
      quantity: 1,
      unitPrice: 50,
    });
    expect(result.success).toBe(true);
  });

  it("createSchema rejects missing invoiceId", () => {
    const result = createSchema.safeParse({
      description: "Oil change",
      quantity: 1,
      unitPrice: 50,
    });
    expect(result.success).toBe(false);
  });

  it("createSchema rejects invalid uuid", () => {
    const result = createSchema.safeParse({
      invoiceId: "not-a-uuid",
      description: "Oil change",
      quantity: 1,
      unitPrice: 50,
    });
    expect(result.success).toBe(false);
  });

  it("createSchema rejects empty description", () => {
    const result = createSchema.safeParse({
      invoiceId: "550e8400-e29b-41d4-a716-446655440000",
      description: "",
      quantity: 1,
      unitPrice: 50,
    });
    expect(result.success).toBe(false);
  });

  it("createSchema rejects negative quantity", () => {
    const result = createSchema.safeParse({
      invoiceId: "550e8400-e29b-41d4-a716-446655440000",
      description: "Oil change",
      quantity: -1,
      unitPrice: 50,
    });
    expect(result.success).toBe(false);
  });
});

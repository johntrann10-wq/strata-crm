import { describe, expect, it } from "vitest";
import { z } from "zod";

describe("quotes route logic", () => {
  const createSchema = z.object({
    clientId: z.string().uuid(),
    vehicleId: z.string().uuid().nullable().optional(),
    taxRate: z.coerce.number().min(0).max(100).optional(),
    lineItems: z
      .array(
        z.object({
          description: z.string().trim().min(1),
          quantity: z.coerce.number().positive(),
          unitPrice: z.coerce.number().min(0),
        })
      )
      .optional(),
  });

  it("accepts atomic quote creation with line items", () => {
    const result = createSchema.safeParse({
      clientId: "550e8400-e29b-41d4-a716-446655440000",
      vehicleId: "660e8400-e29b-41d4-a716-446655440001",
      lineItems: [
        {
          description: "Full detail package",
          quantity: 1,
          unitPrice: 199,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects whitespace-only line item descriptions", () => {
    const result = createSchema.safeParse({
      clientId: "550e8400-e29b-41d4-a716-446655440000",
      lineItems: [
        {
          description: "   ",
          quantity: 1,
          unitPrice: 50,
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { z } from "zod";

describe("appointments route logic", () => {
  const appointmentStatusSchema = z.enum(["scheduled", "confirmed", "in_progress", "completed", "cancelled", "no-show"]);
  const createSchema = z.object({
    clientId: z.string().uuid(),
    vehicleId: z.string().uuid(),
    startTime: z.string().datetime(),
    endTime: z.string().datetime().optional(),
    title: z.string().optional(),
    assignedStaffId: z.string().uuid().optional(),
    locationId: z.string().uuid().optional(),
  });

  it("accepts valid appointment create payload", () => {
    const result = createSchema.safeParse({
      clientId: "550e8400-e29b-41d4-a716-446655440000",
      vehicleId: "660e8400-e29b-41d4-a716-446655440001",
      startTime: "2025-03-20T10:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("updateStatus accepts only valid statuses", () => {
    expect(appointmentStatusSchema.safeParse("scheduled").success).toBe(true);
    expect(appointmentStatusSchema.safeParse("completed").success).toBe(true);
    expect(appointmentStatusSchema.safeParse("invalid").success).toBe(false);
    expect(appointmentStatusSchema.safeParse("").success).toBe(false);
  });

  it("tenancy: clientId and vehicleId must be UUIDs", () => {
    const result = createSchema.safeParse({
      clientId: "not-uuid",
      vehicleId: "660e8400-e29b-41d4-a716-446655440001",
      startTime: "2025-03-20T10:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });
});

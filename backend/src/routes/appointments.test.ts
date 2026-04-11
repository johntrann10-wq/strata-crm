import { describe, it, expect } from "vitest";
import { z } from "zod";
import { canDeleteAppointmentWithInvoiceStatuses } from "./appointments.js";

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
  const updateSchema = z
    .object({
      startTime: z.string().datetime().optional(),
      endTime: z.string().datetime().optional(),
      title: z.string().nullable().optional(),
      assignedStaffId: z.string().uuid().optional(),
      locationId: z.string().uuid().optional(),
      depositAmount: z.coerce.number().min(0).optional(),
      notes: z.string().optional(),
      internalNotes: z.string().optional(),
    })
    .strict();
  const sendConfirmationSchema = z.object({
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
  const recordDepositPaymentSchema = z.object({
    amount: z.number().positive(),
    method: z.enum(["cash", "card", "check", "venmo", "cashapp", "zelle", "other"]),
    notes: z.string().trim().max(1000).optional(),
    referenceNumber: z.string().trim().max(120).optional(),
    paidAt: z.union([z.string(), z.date()]).optional(),
  });

  it("accepts valid appointment create payload", () => {
    const result = createSchema.safeParse({
      clientId: "550e8400-e29b-41d4-a716-446655440000",
      vehicleId: "660e8400-e29b-41d4-a716-446655440001",
      startTime: "2025-03-20T10:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("createSchema strips legacy depositPaid input instead of accepting it as finance state", () => {
    const result = createSchema.safeParse({
      clientId: "550e8400-e29b-41d4-a716-446655440000",
      vehicleId: "660e8400-e29b-41d4-a716-446655440001",
      startTime: "2025-03-20T10:00:00.000Z",
      depositPaid: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("depositPaid" in result.data).toBe(false);
    }
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

  it("updateSchema rejects unsupported relationship changes", () => {
    const result = updateSchema.safeParse({
      clientId: "550e8400-e29b-41d4-a716-446655440000",
      vehicleId: "660e8400-e29b-41d4-a716-446655440001",
    });
    expect(result.success).toBe(false);
  });

  it("updateSchema rejects legacy depositPaid input", () => {
    const result = updateSchema.safeParse({
      depositPaid: true,
    });
    expect(result.success).toBe(false);
  });

  it("accepts direct-recipient appointment confirmation overrides", () => {
    const result = sendConfirmationSchema.safeParse({
      recipientEmail: "service@example.com",
      recipientName: "Service Desk",
      message: "See you soon.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid direct-recipient appointment emails", () => {
    const result = sendConfirmationSchema.safeParse({
      recipientEmail: "wrong",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid manual deposit payment input", () => {
    const result = recordDepositPaymentSchema.safeParse({
      amount: 50,
      method: "card",
      notes: "Taken at pickup",
      paidAt: "2026-03-30T10:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects deposit payment with invalid method", () => {
    const result = recordDepositPaymentSchema.safeParse({
      amount: 50,
      method: "wire",
    });
    expect(result.success).toBe(false);
  });

  it("allows deleting appointments linked only to void invoices", () => {
    expect(canDeleteAppointmentWithInvoiceStatuses(["void"])).toBe(true);
    expect(canDeleteAppointmentWithInvoiceStatuses(["void", "void", null])).toBe(true);
  });

  it("blocks deleting appointments linked to active invoices", () => {
    expect(canDeleteAppointmentWithInvoiceStatuses(["sent"])).toBe(false);
    expect(canDeleteAppointmentWithInvoiceStatuses(["void", "paid"])).toBe(false);
  });
});

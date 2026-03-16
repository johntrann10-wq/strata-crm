/**
 * Client-side validation and backend-rule constants.
 * Use for form validation and UI state (invoice status, appointment status).
 */

export const APPOINTMENT_STATUSES = [
  "scheduled",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "no-show",
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const INVOICE_STATUSES = ["draft", "sent", "paid", "partial", "void"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const PAYMENT_METHODS = [
  "cash",
  "card",
  "check",
  "venmo",
  "cashapp",
  "zelle",
  "other",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Invoice states that allow recording a payment (backend: cannot add payment to void) */
export function invoiceAllowsPayment(status: string | null | undefined): boolean {
  return status != null && status !== "void";
}

/** Invoice states that allow voiding */
export function invoiceAllowsVoid(status: string | null | undefined): boolean {
  return status != null && status !== "void";
}

export function isValidPaymentMethod(m: string): m is PaymentMethod {
  return PAYMENT_METHODS.includes(m as PaymentMethod);
}

/** Validate payment amount: positive and finite */
export function validatePaymentAmount(
  amount: number,
  max?: number
): { ok: true } | { ok: false; message: string } {
  if (typeof amount !== "number" || !isFinite(amount))
    return { ok: false, message: "Amount must be a valid number" };
  if (amount <= 0) return { ok: false, message: "Amount must be greater than 0" };
  if (max != null && amount > max)
    return { ok: false, message: `Amount cannot exceed ${max.toFixed(2)}` };
  return { ok: true };
}

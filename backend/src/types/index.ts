/**
 * Shared types for API and domain. Keeps frontend/backend contracts consistent.
 */

export type BusinessType =
  | "auto_detailing"
  | "mobile_detailing"
  | "wrap_ppf"
  | "window_tinting"
  | "performance"
  | "mechanic"
  | "tire_shop"
  | "muffler_shop";

export type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no-show";

export type InvoiceStatus = "draft" | "sent" | "paid" | "partial" | "void";

export type QuoteStatus = "draft" | "sent" | "accepted" | "declined" | "expired";

export type PaymentMethod =
  | "cash"
  | "card"
  | "check"
  | "venmo"
  | "cashapp"
  | "zelle"
  | "other";

/** For UI branching: tire vs detail vs body shop */
export const BUSINESS_TYPE_GROUP = {
  tire_shop: "tire" as const,
  mechanic: "mechanic" as const,
  performance: "mechanic" as const,
  muffler_shop: "mechanic" as const,
  auto_detailing: "detail" as const,
  mobile_detailing: "detail" as const,
  window_tinting: "detail" as const,
  wrap_ppf: "body" as const,
} satisfies Record<BusinessType, "tire" | "detail" | "body" | "mechanic" | "other">;

export function getBusinessTypeGroup(type: string): "tire" | "detail" | "body" | "mechanic" | "other" {
  return (BUSINESS_TYPE_GROUP as Record<string, "tire" | "detail" | "body" | "mechanic" | "other">)[type] ?? "other";
}

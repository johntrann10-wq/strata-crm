/**
 * Shared types for API and domain. Keeps frontend/backend contracts consistent.
 */

export type BusinessType =
  | "auto_detailing"
  | "mobile_detailing"
  | "ppf_ceramic"
  | "tint_shop"
  | "mechanic"
  | "tire_shop"
  | "car_wash"
  | "wrap_shop"
  | "dealership_service"
  | "body_shop"
  | "other_auto_service";

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
  auto_detailing: "detail" as const,
  mobile_detailing: "detail" as const,
  ppf_ceramic: "detail" as const,
  tint_shop: "detail" as const,
  car_wash: "detail" as const,
  wrap_shop: "body" as const,
  body_shop: "body" as const,
  dealership_service: "other" as const,
  other_auto_service: "other" as const,
} satisfies Record<BusinessType, "tire" | "detail" | "body" | "mechanic" | "other">;

export function getBusinessTypeGroup(type: string): "tire" | "detail" | "body" | "mechanic" | "other" {
  return (BUSINESS_TYPE_GROUP as Record<string, "tire" | "detail" | "body" | "mechanic" | "other">)[type] ?? "other";
}

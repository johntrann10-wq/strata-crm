export type BillingAccessState =
  | "pending_setup"
  | "pending_setup_failure"
  | "active_trial"
  | "active_paid"
  | "paused_missing_payment_method"
  | "canceled";

export function getBillingAccessStateForSubscriptionStatus(
  status: string | null | undefined
): BillingAccessState {
  switch (status) {
    case "trialing":
      return "active_trial";
    case "active":
    case "past_due":
      return "active_paid";
    case "paused":
      return "paused_missing_payment_method";
    case "canceled":
    case "incomplete_expired":
    case "incomplete":
    case "unpaid":
      return "canceled";
    default:
      return "pending_setup";
  }
}

export function hasFullBillingAccess(state: BillingAccessState | string | null | undefined): boolean {
  return (
    state === "active_trial" ||
    state === "active_paid" ||
    state === "pending_setup" ||
    state === "pending_setup_failure"
  );
}

export function isRestrictedBillingAccess(state: BillingAccessState | string | null | undefined): boolean {
  return state === "paused_missing_payment_method" || state === "canceled";
}

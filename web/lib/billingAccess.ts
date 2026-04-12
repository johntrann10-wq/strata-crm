export type BillingAccessState =
  | "pending_setup"
  | "pending_setup_failure"
  | "active_trial"
  | "active_paid"
  | "paused_missing_payment_method"
  | "canceled";

export function hasFullBillingAccess(state: BillingAccessState | null | undefined): boolean {
  return (
    state === "active_trial" ||
    state === "active_paid" ||
    state === "pending_setup" ||
    state === "pending_setup_failure"
  );
}

export function isRestrictedBillingAccess(state: BillingAccessState | null | undefined): boolean {
  return state === "paused_missing_payment_method" || state === "canceled";
}

export function getTrialDaysLeft(trialEndsAt: string | null | undefined): number | null {
  if (!trialEndsAt) return null;
  const target = new Date(trialEndsAt);
  if (Number.isNaN(target.getTime())) return null;
  const diff = target.getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function getBillingAccessLabel(state: BillingAccessState | null | undefined): string {
  switch (state) {
    case "active_trial":
      return "Free trial";
    case "active_paid":
      return "Active";
    case "paused_missing_payment_method":
      return "Paused";
    case "canceled":
      return "Canceled";
    case "pending_setup_failure":
      return "Setup issue";
    case "pending_setup":
      return "Setting up";
    default:
      return "Billing";
  }
}

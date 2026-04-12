export type BillingActivationMilestoneType =
  | "appointment_created"
  | "quote_created"
  | "invoice_created"
  | "payment_collected"
  | "clients_3_added";

export type BillingPromptStage =
  | "none"
  | "soft_activation"
  | "trial_7_days"
  | "trial_3_days"
  | "trial_1_day"
  | "paused";

export type BillingPromptState = {
  stage: BillingPromptStage;
  visible: boolean;
  daysLeftInTrial: number | null;
  dismissedUntil: string | null;
  cooldownDays: number;
};

export type BillingActivationMilestone = {
  reached: boolean;
  type: BillingActivationMilestoneType | null;
  occurredAt: string | null;
  detail: string | null;
};

export function getBillingPromptHeadline(stage: BillingPromptStage): string {
  switch (stage) {
    case "soft_activation":
    case "trial_7_days":
    case "trial_3_days":
    case "trial_1_day":
      return "Your trial is active";
    case "paused":
      return "Trial paused - add payment method to resume";
    default:
      return "Billing";
  }
}

export function getBillingPromptBody(params: {
  stage: BillingPromptStage;
  milestone: BillingActivationMilestone | null | undefined;
  daysLeftInTrial: number | null | undefined;
}): string {
  if (params.stage === "paused") {
    return "Add a payment method to resume full access for the workspace.";
  }
  if (params.stage === "trial_1_day") {
    return "1 day left. Add payment method to keep access after trial.";
  }
  if (params.stage === "trial_3_days") {
    return "3 days left. Add payment method to keep access after trial.";
  }
  if (params.stage === "trial_7_days") {
    return "7 days left. Add payment method to keep access after trial.";
  }
  if (params.stage === "soft_activation") {
    if (params.milestone?.detail?.trim()) {
      return `${params.milestone.detail}. Add payment method to keep access after trial.`;
    }
    return "Add payment method to keep access after trial.";
  }
  return "";
}

export function canDismissBillingPrompt(stage: BillingPromptStage): boolean {
  return stage !== "none" && stage !== "paused";
}

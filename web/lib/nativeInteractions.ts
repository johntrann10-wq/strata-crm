export type NativeFeedbackStyle = "light" | "medium" | "success" | "warning";

const FEEDBACK_PATTERNS: Record<NativeFeedbackStyle, number | number[]> = {
  light: 8,
  medium: 14,
  success: [10, 30, 10],
  warning: [16, 35, 16],
};

export function triggerNativeFeedback(style: NativeFeedbackStyle = "light") {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
    return;
  }

  navigator.vibrate(FEEDBACK_PATTERNS[style]);
}

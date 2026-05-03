import { Capacitor, registerPlugin } from "@capacitor/core";
import { isNativeShell } from "./mobileShell";

type HapticStyle = "light" | "medium" | "heavy" | "soft" | "rigid";
type HapticNotificationType = "success" | "warning" | "error";

type NativeFeedbackPlugin = {
  impact(options?: { style?: HapticStyle }): Promise<void>;
  selection(): Promise<void>;
  notify(options: { type: HapticNotificationType }): Promise<void>;
};

type SharePayload = {
  title?: string;
  text?: string;
  url?: string;
};

const NativeFeedback = registerPlugin<NativeFeedbackPlugin>("NativeFeedback");

function supportsNativeFeedback(): boolean {
  return isNativeShell() && Capacitor.getPlatform() === "ios";
}

export async function triggerSelectionFeedback(): Promise<void> {
  if (!supportsNativeFeedback()) return;
  try {
    await NativeFeedback.selection();
  } catch {
    // Ignore missing-plugin failures in older builds.
  }
}

export async function triggerImpactFeedback(style: HapticStyle = "medium"): Promise<void> {
  if (!supportsNativeFeedback()) return;
  try {
    await NativeFeedback.impact({ style });
  } catch {
    // Ignore missing-plugin failures in older builds.
  }
}

export async function triggerNotificationFeedback(type: HapticNotificationType): Promise<void> {
  if (!supportsNativeFeedback()) return;
  try {
    await NativeFeedback.notify({ type });
  } catch {
    // Ignore missing-plugin failures in older builds.
  }
}

function buildShareFallback(payload: SharePayload): string {
  return [payload.title, payload.text, payload.url].filter(Boolean).join("\n\n").trim();
}

export async function shareNativeContent(payload: SharePayload): Promise<"shared" | "copied" | "cancelled" | "unavailable"> {
  const title = payload.title?.trim() || undefined;
  const text = payload.text?.trim() || undefined;
  const url = payload.url?.trim() || undefined;
  const fallback = buildShareFallback({ title, text, url });

  if (typeof navigator !== "undefined" && "share" in navigator) {
    try {
      await navigator.share({ title, text, url });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return "cancelled";
      }
    }
  }

  if (fallback && typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(fallback);
      return "copied";
    } catch {
      // Fall through to unavailable.
    }
  }

  return "unavailable";
}

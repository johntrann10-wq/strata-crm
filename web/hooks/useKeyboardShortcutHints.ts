import { useEffect, useState } from "react";
import { isNativeShell } from "@/lib/mobileShell";

function shouldShowKeyboardShortcutHints() {
  if (typeof window === "undefined") return false;
  if (isNativeShell()) return false;
  return !(window.matchMedia?.("(pointer: coarse)").matches ?? false);
}

export function useKeyboardShortcutHints() {
  const [showKeyboardShortcutHints, setShowKeyboardShortcutHints] = useState(false);

  useEffect(() => {
    const update = () => setShowKeyboardShortcutHints(shouldShowKeyboardShortcutHints());
    const pointerMedia = window.matchMedia?.("(pointer: coarse)");

    update();
    pointerMedia?.addEventListener?.("change", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);

    return () => {
      pointerMedia?.removeEventListener?.("change", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return showKeyboardShortcutHints;
}

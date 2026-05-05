import type { MouseEvent } from "react";
import { isNativeIOSApp, openNativeBrowserUrl } from "@/lib/mobileShell";
import { cn } from "@/lib/utils";

const PRIVACY_URL = "https://stratacrm.app/privacy";
const TERMS_URL = "https://stratacrm.app/terms";

async function openLivePolicy(event: MouseEvent<HTMLAnchorElement>, url: string) {
  try {
    event.preventDefault();
    if (isNativeIOSApp()) {
      await openNativeBrowserUrl(url);
      return;
    }
    if (typeof window !== "undefined") {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  } catch {
    if (typeof window !== "undefined") {
      window.location.href = url;
    }
  }
}

export function AuthSupportLinks(props: {
  className?: string;
  tone?: "default" | "light";
}) {
  const isLight = props.tone === "light";
  const baseClassName = isLight
    ? "flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[13px] text-[#8b929f] sm:text-[12px]"
    : "flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground sm:text-[12px]";
  const linkClassName = isLight ? "hover:text-white" : "hover:text-foreground";

  return (
    <div className={cn(baseClassName, props.className)}>
      <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" className={linkClassName} onClick={(event) => openLivePolicy(event, PRIVACY_URL)}>
        Privacy
      </a>
      <span>•</span>
      <a href={TERMS_URL} target="_blank" rel="noopener noreferrer" className={linkClassName} onClick={(event) => openLivePolicy(event, TERMS_URL)}>
        Terms
      </a>
      <span>•</span>
      <a href="mailto:support@stratacrm.app" className={linkClassName}>
        Support
      </a>
    </div>
  );
}

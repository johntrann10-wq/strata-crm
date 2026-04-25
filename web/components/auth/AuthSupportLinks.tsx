import { Link } from "react-router";
import { cn } from "@/lib/utils";

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
      <Link to="/privacy" className={linkClassName}>
        Privacy
      </Link>
      <span>•</span>
      <Link to="/terms" className={linkClassName}>
        Terms
      </Link>
      <span>•</span>
      <a href="mailto:support@stratacrm.app" className={linkClassName}>
        Support
      </a>
    </div>
  );
}

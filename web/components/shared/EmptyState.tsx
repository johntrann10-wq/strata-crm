import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: React.ElementType;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "surface-panel relative overflow-hidden flex flex-col items-center justify-center px-5 py-10 text-center sm:px-8 sm:py-16",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(249,115,22,0.11),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.24),rgba(255,255,255,0))]" />
      <div className="relative mb-4 rounded-[1.4rem] border border-white/80 bg-white/86 p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_24px_54px_rgba(15,23,42,0.08)]">
        <Icon className="h-8 w-8 text-foreground/75" />
      </div>
      <div className="relative mb-2 rounded-full border border-border/70 bg-background/78 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        Ready when you are
      </div>
      <h3 className="relative text-balance text-lg font-semibold tracking-tight text-foreground">{title}</h3>
      {description && (
        <p className="relative mt-2 max-w-lg text-sm leading-5 text-muted-foreground">{description}</p>
      )}
      {action && <div className="relative mt-6 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

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
        "surface-panel flex flex-col items-center justify-center px-5 py-10 text-center sm:px-8 sm:py-16",
        className,
      )}
    >
      <div className="mb-4 rounded-2xl border border-border/70 bg-background/80 p-3.5 shadow-[0_18px_40px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.78)]">
        <Icon className="h-8 w-8 text-foreground/75" />
      </div>
      <h3 className="text-balance text-lg font-semibold tracking-tight text-foreground">{title}</h3>
      {description && (
        <p className="mt-2 max-w-lg text-sm leading-5 text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-6 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

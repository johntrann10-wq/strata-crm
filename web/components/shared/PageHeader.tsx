import { ReactNode } from "react";
import { Link } from "react-router";
import { ChevronLeft } from "lucide-react";

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: string;
  right?: ReactNode;
  actions?: ReactNode;
  loading?: boolean;
  backTo?: string;
  badge?: ReactNode;
}

export function PageHeader({ title, subtitle, right, actions, loading, backTo, badge }: PageHeaderProps) {
  return (
    <div className="relative mb-4 flex flex-col gap-2.5 border-b border-border/60 pb-3.5 sm:mb-7 sm:gap-4 sm:pb-5 lg:flex-row lg:items-start lg:justify-between">
      <div className={`absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-orange-400/60 to-transparent animate-pulse transition-opacity ${loading ? "opacity-100" : "opacity-0"}`} />
      <div className="min-w-0 flex-1">
        {backTo && (
          <Link
            to={backTo}
            className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/85 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:text-xs"
          >
            <ChevronLeft className="h-3 w-3" />
            Back
          </Link>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-balance text-[20px] font-semibold tracking-tight text-foreground sm:text-[28px]">
            {title}
          </h1>
          {badge && badge}
        </div>
        {subtitle ? <p className="mt-1 max-w-2xl text-[13px] leading-5 text-muted-foreground sm:text-sm">{subtitle}</p> : null}
      </div>
      {(right ?? actions) && (
        <div className="flex w-full shrink-0 flex-col items-stretch gap-2 self-start sm:flex-row sm:flex-wrap sm:items-start lg:w-auto lg:justify-end">
          {right ?? actions}
        </div>
      )}
    </div>
  );
}

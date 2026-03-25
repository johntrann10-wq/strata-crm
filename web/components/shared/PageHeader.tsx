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
    <div className="relative mb-7 flex flex-col gap-4 border-b border-border/70 pb-5 sm:mb-8 sm:pb-6 lg:flex-row lg:items-start lg:justify-between">
      <div className={`absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-orange-400/60 to-transparent animate-pulse transition-opacity ${loading ? "opacity-100" : "opacity-0"}`} />
      <div className="min-w-0 flex-1">
        {backTo && (
          <Link
            to={backTo}
            className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-3 w-3" />
            Back
          </Link>
        )}
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-balance text-[26px] font-semibold tracking-tight text-foreground sm:text-[30px]">
            {title}
          </h1>
          {badge && badge}
        </div>
        {subtitle && <p className="mt-1.5 max-w-3xl text-sm leading-6 text-muted-foreground">{subtitle}</p>}
      </div>
      {(right ?? actions) && <div className="flex w-full shrink-0 flex-wrap items-start gap-2 self-start lg:w-auto lg:justify-end">{right ?? actions}</div>}
    </div>
  );
}

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
    <div className="relative mb-4 overflow-hidden rounded-[1.2rem] border border-white/60 bg-white/72 px-3.5 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_44px_rgba(15,23,42,0.06)] backdrop-blur-md sm:mb-7 sm:rounded-[1.6rem] sm:px-6 sm:py-5 lg:flex lg:items-start lg:justify-between lg:gap-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.09),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.28),rgba(255,255,255,0))]" />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-orange-400/8 to-transparent" />
      <div className={`absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-orange-400/65 to-transparent animate-pulse transition-opacity ${loading ? "opacity-100" : "opacity-0"}`} />
      <div className="relative min-w-0 flex-1">
        {backTo && (
          <Link
            to={backTo}
            className="mb-2.5 inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-white/72 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground sm:mb-4 sm:px-3 sm:text-[10px]"
          >
            <ChevronLeft className="h-3 w-3" />
            Back
          </Link>
        )}
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-balance text-[20px] font-semibold tracking-[-0.03em] text-foreground sm:text-[31px]">
            {title}
          </h1>
          {badge && badge}
        </div>
        {subtitle ? <p className="mt-1.5 max-w-2xl text-[12px] leading-5 text-muted-foreground sm:mt-2 sm:text-[15px] sm:leading-6">{subtitle}</p> : null}
      </div>
      {(right ?? actions) && (
        <div className="relative mt-3 flex w-full shrink-0 flex-col items-stretch gap-2 self-start sm:mt-4 sm:flex-row sm:flex-wrap sm:items-start lg:mt-0 lg:w-auto lg:justify-end">
          {right ?? actions}
        </div>
      )}
    </div>
  );
}

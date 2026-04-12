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

export function PageHeader({ title, right, actions, loading, backTo }: PageHeaderProps) {
  return (
    <div className="surface-panel relative mb-4 overflow-hidden rounded-[1.7rem] sm:mb-7">
      <div className="border-b border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] px-4 py-3 sm:px-5 sm:py-4">
      <div className={`absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-orange-400/65 to-transparent transition-opacity ${loading ? "opacity-100" : "opacity-0"}`} />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="relative min-w-0 flex-1">
        {backTo && (
          <Link
            to={backTo}
            className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-3 w-3" />
            Back
          </Link>
        )}
        <div className="flex flex-col gap-2">
          <h1 className="text-balance text-xl font-semibold tracking-[-0.03em] text-foreground sm:text-[31px]">
            {title}
          </h1>
        </div>
      </div>
      {(right ?? actions) && (
        <div className="relative flex w-full shrink-0 flex-col gap-2 sm:flex-row lg:w-auto lg:justify-end xl:shrink-0">
          {right ?? actions}
        </div>
      )}
      </div>
      </div>
    </div>
  );
}

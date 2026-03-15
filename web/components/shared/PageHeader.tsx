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
    <div className="relative flex items-start justify-between mb-8">
      <div className={`absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-orange-400/60 to-transparent animate-pulse transition-opacity ${loading ? "opacity-100" : "opacity-0"}`} />
      <div className="flex flex-col">
        {backTo && (
          <Link
            to={backTo}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1 transition-colors"
          >
            <ChevronLeft className="h-3 w-3" />
            Back
          </Link>
        )}
        <div className="flex flex-row items-center gap-2">
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          {badge && badge}
        </div>
        {subtitle && <p className="text-[13px] text-muted-foreground mt-0.5 leading-relaxed">{subtitle}</p>}
      </div>
      {(right ?? actions) && <div className="shrink-0">{right ?? actions}</div>}
    </div>
  );
}
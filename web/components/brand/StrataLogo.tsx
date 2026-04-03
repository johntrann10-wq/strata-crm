import { cn } from "@/lib/utils";

type StrataMarkProps = {
  className?: string;
};

type StrataLogoLockupProps = {
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
  sublabel?: string | null;
  sublabelClassName?: string;
};

export function StrataMark({ className }: StrataMarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("h-8 w-8 shrink-0", className)}
      aria-hidden="true"
      fill="none"
    >
      <defs>
        <linearGradient id="strata-mark-fill" x1="10" y1="8" x2="54" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FB923C" />
          <stop offset="1" stopColor="#EA580C" />
        </linearGradient>
      </defs>
      <rect x="6" y="6" width="52" height="52" rx="16" fill="#111827" />
      <rect x="10" y="10" width="44" height="44" rx="13" fill="url(#strata-mark-fill)" />
      <path
        d="M42.6 20.4H24.7c-2.7 0-4.8 1.9-4.8 4.4 0 2.1 1.2 3.4 3.6 4.1l12.5 3.5c1.1.3 1.7.8 1.7 1.6 0 1-.9 1.6-2.3 1.6H18.9v8h17.9c6.2 0 10-3.1 10-8.4 0-3.9-2.2-6.2-6.9-7.5l-11.2-3.1c-.9-.3-1.4-.7-1.4-1.3 0-.8.7-1.3 1.8-1.3h13.5v-7.6Z"
        fill="white"
      />
    </svg>
  );
}

export function StrataLogoLockup({
  className,
  markClassName,
  wordmarkClassName,
  sublabel,
  sublabelClassName,
}: StrataLogoLockupProps) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <StrataMark className={markClassName} />
      <div className="min-w-0">
        <div className={cn("text-[15px] font-semibold tracking-tight", wordmarkClassName)}>Strata</div>
        {sublabel ? (
          <div
            className={cn(
              "text-[11px] uppercase tracking-[0.12em] text-muted-foreground/80",
              sublabelClassName
            )}
          >
            {sublabel}
          </div>
        ) : null}
      </div>
    </div>
  );
}

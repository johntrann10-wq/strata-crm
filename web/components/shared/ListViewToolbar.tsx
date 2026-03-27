import { ReactNode } from "react";
import { Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = {
  search: string;
  onSearchChange: (value: string) => void;
  placeholder: string;
  loading?: boolean;
  resultCount?: number | null;
  noun?: string;
  filtersLabel?: string | null;
  onClear?: () => void;
  actions?: ReactNode;
  className?: string;
};

export function ListViewToolbar({
  search,
  onSearchChange,
  placeholder,
  loading = false,
  resultCount = null,
  noun = "results",
  filtersLabel,
  onClear,
  actions,
  className,
}: Props) {
  const hasActiveState = Boolean(search.trim()) || Boolean(filtersLabel);
  const trimmedSearch = search.trim();
  const resultLabel =
    resultCount != null
      ? `${resultCount} ${resultCount === 1 ? noun.replace(/s$/, "") : noun}`
      : null;
  const activeStateLabel = filtersLabel
    ? `Filtered: ${filtersLabel}`
    : trimmedSearch
      ? `Searching for "${trimmedSearch}"`
      : null;
  const toolbarStateLabel = hasActiveState ? "Focused view" : "All records";

  return (
    <div className={cn("surface-panel overflow-hidden px-3 py-3 sm:px-5 sm:py-4", className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {toolbarStateLabel}
            </span>
            {resultLabel ? (
              <span className="rounded-full bg-foreground px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-background">
                {resultLabel}
              </span>
            ) : null}
          </div>
          {activeStateLabel ? <p className="text-xs text-muted-foreground">{activeStateLabel}</p> : null}
        </div>
        {hasActiveState && onClear ? (
          <Button type="button" variant="ghost" size="sm" className="h-8 rounded-full px-3 text-xs" onClick={onClear}>
            Clear filters
          </Button>
        ) : null}
      </div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <div className="absolute inset-0 rounded-[1.1rem] bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.08),transparent_42%)]" />
          {loading ? (
            <Loader2 className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : (
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          )}
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={placeholder}
            className="relative h-11 rounded-[1.1rem] border-white/70 bg-white/80 pl-10 pr-10 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_34px_rgba(15,23,42,0.04)]"
          />
          {search ? (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-border/70 bg-background/85 p-1 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:flex-wrap">{actions}</div> : null}
      </div>
      <div className="mt-3 flex flex-col gap-1.5 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {filtersLabel ? (
            <span className="rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-xs">
              {filtersLabel}
            </span>
          ) : null}
          {!activeStateLabel ? <span className="text-[11px] text-muted-foreground/80 sm:inline">Everything is visible and ready to work.</span> : null}
        </div>
        {loading ? <span className="text-[11px] text-muted-foreground/80">Refreshing view...</span> : null}
      </div>
    </div>
  );
}

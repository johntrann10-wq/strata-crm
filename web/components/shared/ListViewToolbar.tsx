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

  return (
    <div className={cn("surface-panel flex flex-col gap-2.5 px-4 py-3 sm:px-5", className)}>
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          {loading ? (
            <Loader2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : (
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          )}
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={placeholder}
            className="h-10 pl-9 pr-10"
          />
          {search ? (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
      <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {resultLabel ? <span className="font-medium text-foreground">{resultLabel}</span> : null}
          {filtersLabel ? (
            <span className="rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-xs">
              {filtersLabel}
            </span>
          ) : null}
          {activeStateLabel ? <span className="text-xs text-muted-foreground/80 sm:inline">{activeStateLabel}</span> : null}
        </div>
        {hasActiveState && onClear ? (
          <Button type="button" variant="ghost" size="sm" className="h-8 justify-start px-2 text-xs sm:justify-center" onClick={onClear}>
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  );
}

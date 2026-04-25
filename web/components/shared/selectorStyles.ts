import { cn } from "@/lib/utils";

export function selectorGroupClassName(className?: string) {
  return cn("flex flex-wrap gap-2", className);
}

export function selectorShellClassName(className?: string) {
  return cn(
    "inline-flex flex-wrap items-center gap-1.5 rounded-[1.35rem] border border-white/70 bg-white/82 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_8px_20px_rgba(15,23,42,0.05)]",
    className
  );
}

export function selectorPillButtonClassName(active: boolean, className?: string) {
  return cn(
    "rounded-full border px-3 py-1.5 text-xs font-medium leading-none transition-colors",
    active
      ? "border-orange-300 bg-orange-50 text-orange-900 shadow-sm"
      : "border-slate-200 bg-white/88 text-slate-600 hover:border-slate-300 hover:text-slate-950",
    className
  );
}

export function selectorTabsListClassName(className?: string) {
  return selectorShellClassName(cn("w-full justify-start", className));
}

export function selectorTabsTriggerClassName(className?: string) {
  return cn(
    "min-h-9 flex-none shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white/88 px-3.5 py-2 text-xs font-medium leading-none text-slate-600 shadow-none transition-colors hover:border-slate-300 hover:text-slate-950 data-[state=active]:border-orange-300 data-[state=active]:bg-orange-50 data-[state=active]:text-orange-900 data-[state=active]:shadow-sm",
    className
  );
}

export function selectorSelectTriggerClassName(className?: string) {
  return cn(
    "h-10 rounded-full border-white/70 bg-white/88 px-4 text-sm font-medium leading-none shadow-[0_8px_20px_rgba(15,23,42,0.05)] hover:border-slate-300 focus-visible:bg-white [&_svg]:ml-1 [&_svg]:opacity-60",
    className
  );
}

export function selectorSelectContentClassName(className?: string) {
  return cn("rounded-[1.2rem] border-white/70 bg-white/98 shadow-[0_20px_48px_rgba(15,23,42,0.14)]", className);
}

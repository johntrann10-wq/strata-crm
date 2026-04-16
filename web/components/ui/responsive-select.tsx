import * as React from "react";
import { ChevronDownIcon } from "lucide-react";

import { useSmallViewport } from "@/lib/useSmallViewport";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type ResponsiveSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type ResponsiveSelectProps = {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: ResponsiveSelectOption[];
  placeholder: string;
  allowEmpty?: boolean;
  disabled?: boolean;
  triggerClassName?: string;
  nativeClassName?: string;
  contentClassName?: string;
};

export function ResponsiveSelect({
  id,
  value,
  onValueChange,
  options,
  placeholder,
  allowEmpty = false,
  disabled = false,
  triggerClassName,
  nativeClassName,
  contentClassName,
}: ResponsiveSelectProps) {
  const isSmallViewport = useSmallViewport();
  const emptyValue = "__empty__";

  if (isSmallViewport) {
    return (
      <div className="relative">
        <select
          id={id}
          value={value}
          disabled={disabled}
          className={cn(
            "border-input/90 h-11 w-full appearance-none rounded-xl border bg-background/85 px-3.5 py-2 pr-10 text-base shadow-[0_1px_2px_rgba(15,23,42,0.03)] outline-none transition-[color,box-shadow,border-color,background-color] hover:border-border focus-visible:border-ring focus-visible:bg-background focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50",
            nativeClassName
          )}
          onChange={(event) => onValueChange(event.target.value)}
        >
          <option value="" disabled={!allowEmpty}>
            {placeholder}
          </option>
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      </div>
    );
  }

  return (
    <Select
      value={allowEmpty ? (value === "" ? emptyValue : value) : value || undefined}
      onValueChange={(nextValue) => onValueChange(allowEmpty && nextValue === emptyValue ? "" : nextValue)}
      disabled={disabled}
    >
      <SelectTrigger id={id} className={cn("w-full", triggerClassName)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className={contentClassName}>
        {allowEmpty ? <SelectItem value={emptyValue}>{placeholder}</SelectItem> : null}
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

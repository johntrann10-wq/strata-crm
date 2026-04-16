import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, ChevronDown, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ResponsiveSelect } from "@/components/ui/responsive-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSmallViewport } from "@/lib/useSmallViewport";
import { cn } from "@/lib/utils";

export function toDateInputValue(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatPickerDate(value: string): string {
  if (!value) return "Pick a date";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "Pick a date";
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function buildQuarterHourOptions() {
  return Array.from({ length: 96 }, (_, index) => {
    const hours = Math.floor(index / 4);
    const minutes = (index % 4) * 15;
    const value = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return {
      value,
      label: format(date, "h:mm a"),
    };
  });
}

export function formatDurationMinutes(minutes: number): string {
  if (minutes <= 0) return "0 min";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours > 0 && remainder > 0) return `${hours} hr ${remainder} min`;
  if (hours > 0) return `${hours} hr${hours === 1 ? "" : "s"}`;
  return `${remainder} min`;
}

export function buildQuarterHourDurationOptions(maxMinutes = 12 * 60) {
  const safeMaxMinutes = Math.max(15, maxMinutes - (maxMinutes % 15));
  return Array.from({ length: safeMaxMinutes / 15 }, (_, index) => {
    const minutes = (index + 1) * 15;
    return {
      value: String(minutes),
      label: formatDurationMinutes(minutes),
    };
  });
}

type ResponsiveTimeSelectProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
  useNative?: boolean;
  allowEmpty?: boolean;
  desktopClassName?: string;
  mobileClassName?: string;
  mobileIcon?: "left" | "down";
};

export function ResponsiveTimeSelect({
  id,
  value,
  onChange,
  options,
  placeholder,
  useNative,
  allowEmpty = false,
  desktopClassName,
  mobileClassName,
  mobileIcon = "left",
}: ResponsiveTimeSelectProps) {
  const isSmallViewport = useSmallViewport();
  const shouldUseNative = useNative ?? isSmallViewport;
  const resolvedDesktopClassName =
    desktopClassName ??
    "h-11 w-full rounded-xl border-input/90 bg-background/85 px-3 text-sm font-medium [font-variant-numeric:tabular-nums] shadow-[0_1px_2px_rgba(15,23,42,0.03)]";
  const resolvedMobileClassName =
    mobileClassName ??
    "border-input/90 h-11 w-full appearance-none rounded-xl border bg-background/85 px-3.5 py-2 pr-10 text-base font-normal shadow-[0_1px_2px_rgba(15,23,42,0.03)] outline-none transition-[color,box-shadow,border-color,background-color] hover:border-border focus-visible:border-ring focus-visible:bg-background focus-visible:ring-[3px] focus-visible:ring-ring/40";

  if (shouldUseNative) {
    return (
      <div className="relative">
        <select
          id={id}
          className={resolvedMobileClassName}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {allowEmpty ? <option value="">{placeholder}</option> : null}
          {!allowEmpty ? (
            <option value="" disabled>
              {placeholder}
            </option>
          ) : null}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {mobileIcon === "left" ? (
          <ChevronLeft className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 rotate-180 text-muted-foreground" />
        ) : (
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        )}
      </div>
    );
  }

  return (
    <Select
      value={allowEmpty && value === "" ? "__empty__" : value}
      onValueChange={(nextValue) => onChange(allowEmpty && nextValue === "__empty__" ? "" : nextValue)}
    >
      <SelectTrigger id={id} className={resolvedDesktopClassName}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {allowEmpty ? <SelectItem value="__empty__">{placeholder}</SelectItem> : null}
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type QuarterHourDurationGridProps = {
  value: string;
  onChange: (value: string) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
  maxMinutes?: number;
  className?: string;
};

export function QuarterHourDurationGrid({
  value,
  onChange,
  allowEmpty = false,
  emptyLabel = "No set duration",
  maxMinutes = 12 * 60,
  className,
}: QuarterHourDurationGridProps) {
  const parsedValue = Number.parseInt(value, 10);
  const safeValue = Number.isFinite(parsedValue) && parsedValue > 0 ? Math.min(parsedValue, maxMinutes) : 0;
  const selectedHours = Math.floor(safeValue / 60);
  const selectedMinutes = safeValue % 60;
  const maxHours = Math.floor(maxMinutes / 60);
  const maxRemainderMinutes = maxMinutes % 60;

  const hourOptions = Array.from({ length: maxHours + 1 }, (_, index) => ({
    value: String(index),
    label: index === 1 ? "1 hour" : `${index} hours`,
  }));

  const minuteOptions = [0, 15, 30, 45]
    .filter((minutes) => (selectedHours < maxHours ? true : minutes <= maxRemainderMinutes))
    .map((minutes) => ({
      value: String(minutes),
      label: minutes === 0 ? "0 min" : `${minutes} min`,
    }));

  const updateDuration = (hoursValue: number, minutesValue: number) => {
    const totalMinutes = hoursValue * 60 + minutesValue;
    if (totalMinutes <= 0) {
      onChange(allowEmpty ? "" : "15");
      return;
    }

    onChange(String(Math.min(totalMinutes, maxMinutes)));
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          {safeValue > 0 ? `Estimated duration: ${formatDurationMinutes(safeValue)}` : emptyLabel}
        </p>
        {allowEmpty && safeValue > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto px-0 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => onChange("")}
          >
            Clear duration
          </Button>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Hours</p>
          <ResponsiveSelect
            value={String(selectedHours)}
            onValueChange={(nextValue) => updateDuration(Number(nextValue), selectedMinutes)}
            options={hourOptions}
            placeholder="Hours"
            triggerClassName="h-10 w-full rounded-xl border-input/90 bg-background/85 px-3 text-sm font-medium shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
            nativeClassName="border-input/90 h-11 w-full appearance-none rounded-xl border bg-background/85 px-3.5 py-2 pr-10 text-base font-normal shadow-[0_1px_2px_rgba(15,23,42,0.03)] outline-none transition-[color,box-shadow,border-color,background-color] hover:border-border focus-visible:border-ring focus-visible:bg-background focus-visible:ring-[3px] focus-visible:ring-ring/40"
          />
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Minutes</p>
          <ResponsiveSelect
            value={String(selectedMinutes)}
            onValueChange={(nextValue) => updateDuration(selectedHours, Number(nextValue))}
            options={minuteOptions}
            placeholder="Minutes"
            triggerClassName="h-10 w-full rounded-xl border-input/90 bg-background/85 px-3 text-sm font-medium shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
            nativeClassName="border-input/90 h-11 w-full appearance-none rounded-xl border bg-background/85 px-3.5 py-2 pr-10 text-base font-normal shadow-[0_1px_2px_rgba(15,23,42,0.03)] outline-none transition-[color,box-shadow,border-color,background-color] hover:border-border focus-visible:border-ring focus-visible:bg-background focus-visible:ring-[3px] focus-visible:ring-ring/40"
          />
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Set the service length in clean 15-minute increments.</p>
        {allowEmpty ? (
          <p className="text-xs text-muted-foreground">Leave both fields at zero if this service should not have a preset duration.</p>
        ) : null}
      </div>
    </div>
  );
}

type FormDatePickerProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  allowClear?: boolean;
  buttonClassName?: string;
  iconClassName?: string;
  calendarIcon?: "calendar" | "days";
};

export function FormDatePicker({
  id,
  value,
  onChange,
  placeholder,
  allowClear = false,
  buttonClassName,
  iconClassName,
  calendarIcon = "days",
}: FormDatePickerProps) {
  const [open, setOpen] = useState(false);
  const selectedDate = value ? new Date(`${value}T12:00:00`) : undefined;

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            className={cn(
              "h-11 w-full justify-start rounded-xl border-input/90 bg-background/85 px-3.5 text-left text-sm font-medium [font-variant-numeric:tabular-nums] shadow-[0_1px_2px_rgba(15,23,42,0.03)]",
              !value && "text-muted-foreground",
              buttonClassName
            )}
          >
            {calendarIcon === "calendar" ? (
              <CalendarIcon className={cn("mr-2 h-4 w-4", iconClassName)} />
            ) : (
              <CalendarIcon className={cn("mr-2 h-4 w-4", iconClassName)} />
            )}
            {value ? formatPickerDate(value) : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto p-0"
          align="start"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(date) => {
              onChange(date ? toDateInputValue(date) : "");
              setOpen(false);
            }}
            initialFocus
          />
        </PopoverContent>
      </Popover>
      {allowClear && value ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-auto px-0 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => onChange("")}
        >
          Clear date
        </Button>
      ) : null}
    </div>
  );
}

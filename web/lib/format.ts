import { format } from "date-fns";

export function formatCurrency(amount: number | null | undefined, currency: string = "USD"): string {
  if (amount === null || amount === undefined) {
    return "$0.00";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(date: string | Date | null | undefined): string {
  if (date === null || date === undefined) {
    return "—";
  }
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (date === null || date === undefined) {
    return "—";
  }
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, "EEE MMM d, h:mm a");
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0 && mins > 0) {
    return `${hours}h ${mins}m`;
  } else if (hours > 0) {
    return `${hours}h`;
  } else {
    return `${mins}m`;
  }
}

export function formatRelativeDay(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 1) {
    return "1 day ago";
  }
  return `${diffDays} days ago`;
}
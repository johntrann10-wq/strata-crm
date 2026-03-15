import { cn } from "@/lib/utils";

export function getAppointmentStatusClass(status: string): string {
  switch (status) {
    case "scheduled":
    case "pending":
      return "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200/60";
    case "confirmed":
      return "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium bg-sky-50 text-sky-700 border border-sky-200/60";
    case "in_progress":
    case "in-progress":
      return "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium bg-violet-50 text-violet-700 border border-violet-200/60";
    case "completed":
      return "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60";
    case "cancelled":
      return "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium bg-rose-50 text-rose-600 border border-rose-200/60";
    case "no-show":
      return "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium bg-zinc-100 text-zinc-500 border border-zinc-200/60";
    default:
      return "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium bg-zinc-100 text-zinc-500 border border-zinc-200/60";
  }
}

export function getAppointmentStatusLabel(status: string): string {
  switch (status) {
    case "scheduled":
      return "Scheduled";
    case "pending":
      return "Pending";
    case "confirmed":
      return "Confirmed";
    case "in_progress":
    case "in-progress":
      return "In Progress";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    case "no-show":
      return "No Show";
    default:
      return status;
  }
}

export function getInvoiceStatusClass(status: string): string {
  switch (status) {
    case "draft":
      return "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium bg-zinc-100 text-zinc-500 border border-zinc-200/60";
    case "sent":
      return "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium bg-sky-50 text-sky-700 border border-sky-200/60";
    case "paid":
      return "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60";
    case "partial":
      return "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200/60";
    case "void":
      return "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium bg-zinc-100 text-zinc-400 border border-zinc-200/60 line-through";
    default:
      return "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium bg-zinc-100 text-zinc-500 border border-zinc-200/60";
  }
}

export function getInvoiceStatusLabel(status: string): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "sent":
      return "Sent";
    case "paid":
      return "Paid";
    case "partial":
      return "Partial";
    case "void":
      return "Void";
    default:
      return status;
  }
}

export function getQuoteStatusClass(status: string): string {
  switch (status) {
    case "draft":
      return "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium bg-zinc-100 text-zinc-500 border border-zinc-200/60";
    case "sent":
      return "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium bg-sky-50 text-sky-700 border border-sky-200/60";
    case "accepted":
      return "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60";
    case "declined":
      return "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium bg-rose-50 text-rose-600 border border-rose-200/60";
    case "expired":
      return "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium bg-orange-50 text-orange-600 border border-orange-200/60";
    default:
      return "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium bg-zinc-100 text-zinc-500 border border-zinc-200/60";
  }
}

export function getQuoteStatusLabel(status: string): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "sent":
      return "Sent";
    case "accepted":
      return "Accepted";
    case "declined":
      return "Declined";
    case "expired":
      return "Expired";
    default:
      return status;
  }
}

interface StatusBadgeProps {
  status: string;
  type: "appointment" | "invoice" | "quote";
  className?: string;
}

export function StatusBadge({ status, type, className }: StatusBadgeProps) {
  let colorClass: string;
  let label: string;

  if (type === "appointment") {
    colorClass = getAppointmentStatusClass(status);
    label = getAppointmentStatusLabel(status);
  } else if (type === "invoice") {
    colorClass = getInvoiceStatusClass(status);
    label = getInvoiceStatusLabel(status);
  } else {
    colorClass = getQuoteStatusClass(status);
    label = getQuoteStatusLabel(status);
  }

  return (
    <span className={cn(colorClass, className)}>
      {label}
    </span>
  );
}
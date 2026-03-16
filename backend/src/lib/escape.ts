/**
 * Escape user input for safe inclusion in HTML to prevent XSS.
 * Use for all dynamic content in invoice and email templates.
 */
export function escapeHtml(str: string | number | null | undefined): string {
  if (str === null || str === undefined) return "";
  const s = String(str);
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Format number as currency (USD) for display; input is already safe. */
export function formatCurrency(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined) return "$0.00";
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  if (!Number.isFinite(n)) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

/** Format date in business timezone for display (ISO date string or Date). */
export function formatDate(
  value: string | Date | null | undefined,
  timezone: string = "America/New_York",
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }
): string {
  if (value === null || value === undefined) return "";
  try {
    const d = typeof value === "string" ? new Date(value) : value;
    if (isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone: timezone }).format(d);
  } catch {
    return "";
  }
}

/** Format date and time in business timezone. */
export function formatDateTime(
  value: string | Date | null | undefined,
  timezone: string = "America/New_York"
): string {
  return formatDate(value, timezone, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

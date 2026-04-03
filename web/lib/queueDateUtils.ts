export function safeDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatShortDate(value: string | Date | null | undefined): string | null {
  const parsed = safeDate(value);
  return parsed
    ? parsed.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;
}

export function formatFreshness(
  value: string | Date | null | undefined,
  label: string,
  formatter: (value: string | Date | null | undefined) => string | null = (nextValue) => {
    const parsed = safeDate(nextValue);
    return parsed ? parsed.toLocaleDateString() : null;
  }
): string | null {
  const formatted = formatter(value);
  return formatted ? `${label} ${formatted}` : null;
}

export function isOlderThanDays(value: string | Date | null | undefined, days: number): boolean {
  const parsed = safeDate(value);
  if (!parsed) return false;
  return Date.now() - parsed.getTime() >= days * 24 * 60 * 60 * 1000;
}

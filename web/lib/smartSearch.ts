export type SmartSearchIndex = {
  text: string;
  compact: string;
};

export function normalizeSmartSearchValue(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function compactSmartSearchValue(value: unknown): string {
  return normalizeSmartSearchValue(value).replace(/[^a-z0-9]/g, "");
}

export function getSmartSearchTokens(query: string): string[] {
  return normalizeSmartSearchValue(query)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

export function buildSmartSearchIndex(parts: unknown[]): SmartSearchIndex {
  const text = parts
    .map((part) => normalizeSmartSearchValue(part))
    .filter(Boolean)
    .join(" ");
  return {
    text,
    compact: compactSmartSearchValue(text),
  };
}

export function smartSearchMatches(parts: unknown[], query: string): boolean {
  const tokens = getSmartSearchTokens(query);
  if (tokens.length === 0) return true;

  const index = buildSmartSearchIndex(parts);
  return tokens.every((token) => {
    if (index.text.includes(token)) return true;
    const compactToken = compactSmartSearchValue(token);
    return compactToken.length >= 2 && index.compact.includes(compactToken);
  });
}

export function getDateSearchAliases(value: string | number | Date | null | undefined): string[] {
  if (!value) return [];
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return [];

  const hours = date.getHours();
  const minutes = date.getMinutes();
  const hour12 = hours % 12 || 12;
  const minuteLabel = minutes.toString().padStart(2, "0");
  const ampm = hours >= 12 ? "pm" : "am";
  const weekday = date.toLocaleDateString("en-US", { weekday: "long" });
  const weekdayShort = date.toLocaleDateString("en-US", { weekday: "short" });
  const month = date.toLocaleDateString("en-US", { month: "long" });
  const monthShort = date.toLocaleDateString("en-US", { month: "short" });
  const day = date.getDate();
  const timeOfDay = hours < 12 ? "morning" : hours < 17 ? "afternoon" : "evening";
  const aliases = [
    `${hour12}:${minuteLabel} ${ampm}`,
    `${hour12}:${minuteLabel}${ampm}`,
    `${hour12}${minuteLabel}${ampm}`,
    `${hour12}:${minuteLabel}`,
    `${weekday}`,
    `${weekdayShort}`,
    `${month} ${day}`,
    `${monthShort} ${day}`,
    `${timeOfDay}`,
  ];

  if (minutes === 0) {
    aliases.push(`${hour12} ${ampm}`, `${hour12}${ampm}`, `${hour12}`);
  }

  return aliases;
}

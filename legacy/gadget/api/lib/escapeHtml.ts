export function escapeHtml(str: string): string {
  if (typeof str !== "string" || !str) {
    return "";
  }
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

export function esc(value: unknown): string {
  return escapeHtml(String(value ?? ""));
}
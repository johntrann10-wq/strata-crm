import { logger } from "./logger.js";

const seenWarnings = new Set<string>();

export function warnOnce(key: string, message: string, meta?: Record<string, unknown>) {
  if (seenWarnings.has(key)) return;
  seenWarnings.add(key);
  logger.warn(message, meta);
}

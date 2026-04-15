/**
 * Structured logging. Use for all backend logs; never log secrets.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  requestId?: string;
  userId?: string;
  businessId?: string;
  action?: string;
  [key: string]: unknown;
}

const REDACTED = "[REDACTED]";
const sensitiveStringPatterns = [
  {
    pattern: /\b(Bearer\s+)([A-Za-z0-9\-._~+/]+=*)/gi,
    replace: (_match: string, prefix: string) => `${prefix}${REDACTED}`,
  },
  {
    pattern:
      /([?&](?:auth(?:_|-)?token|invite(?:_|-)?token|reset(?:_|-)?token|token|session_id|client_secret|secret|signature)=)([^&#\s]+)/gi,
    replace: (_match: string, prefix: string) => `${prefix}${REDACTED}`,
  },
  {
    pattern:
      /((?:^|\s|\(|\{|\[|,|;)(?:token|auth(?:_|-)?token|invite(?:_|-)?token|reset(?:_|-)?token|password|secret|signature)\s*[:=]\s*)(["']?)([^\s"',}&]+)(\2)/gi,
    replace: (_match: string, prefix: string, quote: string) => `${prefix}${REDACTED}${quote}`,
  },
  {
    pattern: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
    replace: () => REDACTED,
  },
];
const sensitiveKeyMatchers = [
  /authorization/i,
  /token/i,
  /password/i,
  /secret/i,
  /cookie/i,
  /stripe[-_]?signature/i,
];
const emailKeyMatchers = [/email/i, /^to$/i, /^from$/i, /^recipient$/i];
const phoneKeyMatchers = [/phone/i];
const addressKeyMatchers = [/address/i];

const levelOrder: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const rawLevel = process.env.LOG_LEVEL?.trim();
const minLevel: LogLevel = (rawLevel && rawLevel !== "" ? rawLevel : "info") as LogLevel;

function shouldLog(level: LogLevel): boolean {
  return levelOrder[level] >= levelOrder[minLevel];
}

function maskEmail(value: string): string {
  const trimmed = value.trim();
  const atIndex = trimmed.indexOf("@");
  if (atIndex <= 1) return REDACTED;
  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);
  if (!domain) return REDACTED;
  return `${local[0]}***@${domain}`;
}

function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return REDACTED;
  return `***-***-${digits.slice(-4)}`;
}

function maskContactValue(value: string): string {
  if (value.includes("@")) return maskEmail(value);
  const digits = value.replace(/\D/g, "");
  if (digits.length >= 4) return maskPhone(value);
  return REDACTED;
}

function isSensitiveKey(key: string): boolean {
  return sensitiveKeyMatchers.some((matcher) => matcher.test(key));
}

function isEmailKey(key: string): boolean {
  return emailKeyMatchers.some((matcher) => matcher.test(key));
}

function isPhoneKey(key: string): boolean {
  return phoneKeyMatchers.some((matcher) => matcher.test(key));
}

function isAddressKey(key: string): boolean {
  return addressKeyMatchers.some((matcher) => matcher.test(key));
}

export function sanitizeStringValue(value: string): string {
  return sensitiveStringPatterns.reduce(
    (current, { pattern, replace }) => current.replace(pattern, replace as Parameters<string["replace"]>[1]),
    value
  );
}

export function sanitizeValue(key: string, value: unknown): unknown {
  if (value == null) return value;

  if (isSensitiveKey(key)) return REDACTED;

  if (typeof value === "string") {
    if (isEmailKey(key)) return maskContactValue(value);
    if (isPhoneKey(key)) return maskPhone(value);
    if (isAddressKey(key)) return REDACTED;
    return sanitizeStringValue(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(key, entry));
  }

  if (typeof value === "object") {
    return sanitizeContext(value as Record<string, unknown>);
  }

  return value;
}

export function sanitizeContext(context?: LogContext | Record<string, unknown>): Record<string, unknown> | undefined {
  if (!context) return undefined;
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    sanitized[key] = sanitizeValue(key, value);
  }
  return sanitized;
}

function formatMessage(level: LogLevel, message: string, context?: LogContext): string {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message: sanitizeStringValue(message),
    ...sanitizeContext(context),
  };
  return JSON.stringify(payload);
}

export const logger = {
  debug(message: string, context?: LogContext): void {
    if (shouldLog("debug")) console.debug(formatMessage("debug", message, context));
  },
  info(message: string, context?: LogContext): void {
    if (shouldLog("info")) console.info(formatMessage("info", message, context));
  },
  warn(message: string, context?: LogContext): void {
    if (shouldLog("warn")) console.warn(formatMessage("warn", message, context));
  },
  error(message: string, context?: LogContext): void {
    if (shouldLog("error")) console.error(formatMessage("error", message, context));
  },
};

import { eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { logger } from "./logger.js";

function isUserSchemaDriftError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown; cause?: unknown };
  const cause =
    candidate.cause && typeof candidate.cause === "object"
      ? (candidate.cause as { code?: unknown; message?: unknown })
      : candidate;
  const code = String(cause.code ?? "");
  const message = String(cause.message ?? "").toLowerCase();
  return code === "42P01" || code === "42703" || message.includes("does not exist");
}

export async function loadAuthTokenVersion(userId: string): Promise<number | null> {
  try {
    const [row] = await db
      .select({ authTokenVersion: users.authTokenVersion })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!row) return null;
    return Number(row.authTokenVersion ?? 1);
  } catch (error) {
    if (!isUserSchemaDriftError(error)) throw error;
    logger.warn("Auth token version unavailable due to schema drift; skipping version enforcement", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export function normalizeTokenVersion(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 1;
}

export function isAuthTokenVersionMismatch(
  tokenVersion: unknown,
  currentVersion: number | null
): boolean {
  if (currentVersion == null) return false;
  return normalizeTokenVersion(tokenVersion) !== currentVersion;
}


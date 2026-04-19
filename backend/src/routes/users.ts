import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq, sql } from "drizzle-orm";
import { NotFoundError, BadRequestError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { requireAuth } from "../middleware/auth.js";
import { createAccessToken } from "../lib/jwt.js";
import { setAuthCookie } from "../lib/authCookies.js";
import { isUserSchemaDriftError, normalizeTokenVersion } from "../lib/authTokenVersion.js";

export const usersRouter = Router({ mergeParams: true });

type PasswordUserRecord = {
  id: string;
  email: string;
  passwordHash: string | null;
  googleProfileId: string | null;
  authTokenVersion: number | null;
};

type UserProfileRecord = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  googleProfileId: string | null;
  hasPassword: boolean;
  accountDeletionRequestedAt: Date | null;
  accountDeletionRequestNote: string | null;
};

async function loadUserByIdSafe(userId: string): Promise<PasswordUserRecord | null> {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    return user
      ? {
          id: user.id,
          email: user.email,
          passwordHash: user.passwordHash ?? null,
          googleProfileId: user.googleProfileId ?? null,
          authTokenVersion: user.authTokenVersion ?? null,
        }
      : null;
  } catch (error) {
    if (!isUserSchemaDriftError(error)) throw error;
    logger.warn("Users schema drift detected during password-route lookup; falling back to legacy select", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    const result = await db.execute(sql`
      SELECT id, email, password_hash, google_profile_id
      FROM users
      WHERE id = ${userId}
      LIMIT 1
    `);
    const row = (result as { rows?: Array<Record<string, unknown>> }).rows?.[0];
    return row
      ? {
          id: String(row.id),
          email: String(row.email),
          passwordHash: (row.password_hash as string | null | undefined) ?? null,
          googleProfileId: (row.google_profile_id as string | null | undefined) ?? null,
          authTokenVersion: null,
        }
      : null;
  }
}

async function updatePasswordHashSafe(userId: string, passwordHash: string, nextAuthVersion: number): Promise<void> {
  try {
    await db
      .update(users)
      .set({ passwordHash, authTokenVersion: nextAuthVersion, updatedAt: new Date() })
      .where(eq(users.id, userId));
  } catch (error) {
    if (!isUserSchemaDriftError(error)) throw error;
    logger.warn("Users schema drift detected during password-route update; falling back to legacy update", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    await db.execute(sql`
      UPDATE users
      SET password_hash = ${passwordHash}, updated_at = ${new Date()}
      WHERE id = ${userId}
    `);
  }
}

async function loadUserProfileByIdSafe(userId: string): Promise<UserProfileRecord | null> {
  try {
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        googleProfileId: users.googleProfileId,
        hasPassword: users.passwordHash,
        accountDeletionRequestedAt: users.accountDeletionRequestedAt,
        accountDeletionRequestNote: users.accountDeletionRequestNote,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return user
      ? {
          ...user,
          hasPassword: Boolean(user.hasPassword),
        }
      : null;
  } catch (error) {
    if (!isUserSchemaDriftError(error)) throw error;
    logger.warn("Users schema drift detected during profile lookup; falling back to legacy select", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    const result = await db.execute(sql`
      SELECT id, email, first_name, last_name, google_profile_id, password_hash
      FROM users
      WHERE id = ${userId}
      LIMIT 1
    `);
    const row = (result as { rows?: Array<Record<string, unknown>> }).rows?.[0];
    return row
      ? {
          id: String(row.id),
          email: String(row.email),
          firstName: (row.first_name as string | null | undefined) ?? null,
          lastName: (row.last_name as string | null | undefined) ?? null,
          googleProfileId: (row.google_profile_id as string | null | undefined) ?? null,
          hasPassword: Boolean(row.password_hash),
          accountDeletionRequestedAt: null,
          accountDeletionRequestNote: null,
        }
      : null;
  }
}

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});
const setPasswordSchema = z.object({
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});
const requestAccountDeletionSchema = z.object({
  reason: z
    .string()
    .trim()
    .max(1000, "Please keep your request details under 1000 characters.")
    .optional()
    .default(""),
});

/** POST /api/users/change-password — authenticated user updates password. */
usersRouter.post("/change-password", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      const first = parsed.error.issues[0]?.message;
      throw new BadRequestError(first ?? "Invalid input");
    }
    const { currentPassword, newPassword } = parsed.data;
    if (currentPassword === newPassword) {
      throw new BadRequestError("New password must be different from your current password.");
    }
    const userId = req.userId!;
    const user = await loadUserByIdSafe(userId);
    if (!user) throw new NotFoundError("User not found.");
    if (!user.passwordHash) {
      throw new BadRequestError("This account does not have a password. Sign in with Google or use forgot password.");
    }
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw new BadRequestError("Current password is incorrect.");
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const nextAuthVersion = normalizeTokenVersion(user.authTokenVersion) + 1;
    await updatePasswordHashSafe(userId, passwordHash, nextAuthVersion);
    const token = createAccessToken(userId, nextAuthVersion);
    setAuthCookie(res, token, req);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

usersRouter.post("/set-password", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = setPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      const first = parsed.error.issues[0]?.message;
      throw new BadRequestError(first ?? "Invalid input");
    }
    const { newPassword } = parsed.data;
    const userId = req.userId!;
    const user = await loadUserByIdSafe(userId);
    if (!user) throw new NotFoundError("User not found.");
    if (user.passwordHash && !user.googleProfileId) {
      throw new BadRequestError("This account already has a password. Use change password instead.");
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const nextAuthVersion = normalizeTokenVersion(user.authTokenVersion) + 1;
    await updatePasswordHashSafe(userId, passwordHash, nextAuthVersion);
    const token = createAccessToken(userId, nextAuthVersion);
    setAuthCookie(res, token, req);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

usersRouter.post("/request-account-deletion", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = requestAccountDeletionSchema.safeParse(req.body);
    if (!parsed.success) {
      const first = parsed.error.issues[0]?.message;
      throw new BadRequestError(first ?? "Invalid input");
    }

    const userId = req.userId!;
    const [existing] = await db
      .select({
        id: users.id,
        email: users.email,
        accountDeletionRequestedAt: users.accountDeletionRequestedAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!existing) throw new NotFoundError("User not found.");
    if (existing.accountDeletionRequestedAt) {
      res.json({
        ok: true,
        alreadyRequested: true,
        requestedAt: existing.accountDeletionRequestedAt,
      });
      return;
    }

    const requestNote = parsed.data.reason.trim() || null;
    const requestedAt = new Date();
    const [updated] = await db
      .update(users)
      .set({
        accountDeletionRequestedAt: requestedAt,
        accountDeletionRequestNote: requestNote,
        updatedAt: requestedAt,
      })
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        accountDeletionRequestedAt: users.accountDeletionRequestedAt,
      });

    if (!updated?.accountDeletionRequestedAt) {
      throw new BadRequestError("We couldn't save your account deletion request. Please try again.");
    }

    logger.info("Account deletion requested", {
      userId,
      email: existing.email,
      hasReason: Boolean(requestNote),
    });

    res.json({
      ok: true,
      alreadyRequested: false,
      requestedAt: updated.accountDeletionRequestedAt,
    });
  } catch (error) {
    if (isUserSchemaDriftError(error)) {
      logger.warn("Account deletion request unavailable because the user schema is outdated", {
        userId: req.userId,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(503).json({
        message: "Account deletion requests are temporarily unavailable while the latest account schema update is being applied.",
      });
      return;
    }
    next(error);
  }
});

usersRouter.get("/:id", requireAuth, async (req: Request, res: Response) => {
  const id = req.params.id;
  if (req.userId !== id) throw new NotFoundError("User not found.");
  const user = await loadUserProfileByIdSafe(id);
  if (!user) throw new NotFoundError("User not found.");
  res.json({
    ...user,
    googleImageUrl: null,
    profilePicture: null,
  });
});

const updateSchema = z.object({ firstName: z.string().optional(), lastName: z.string().optional() });
usersRouter.patch("/:id/update", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.params.id !== req.userId) throw new NotFoundError("User not found.");
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");
    const [updated] = await db
      .update(users)
      .set({
        firstName: parsed.data.firstName ?? undefined,
        lastName: parsed.data.lastName ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(users.id, req.userId!))
      .returning({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        googleProfileId: users.googleProfileId,
        hasPassword: users.passwordHash,
      });
    if (!updated) throw new NotFoundError("User not found.");
    res.json({
      ...updated,
      hasPassword: Boolean(updated.hasPassword),
      googleImageUrl: null,
      profilePicture: null,
    });
  } catch (error) {
    next(error);
  }
});

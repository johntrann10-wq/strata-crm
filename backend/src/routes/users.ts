import { Router, Request, Response, NextFunction } from "express";
import { createHash } from "crypto";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "../db/index.js";
import {
  accountDeletionAudits,
  activityLogs,
  businesses,
  businessMemberships,
  dashboardPreferences,
  integrationConnections,
  integrationJobs,
  membershipPermissionGrants,
  notifications,
  staff,
  users,
} from "../db/schema.js";
import { and, eq, isNull, sql } from "drizzle-orm";
import { AppError, NotFoundError, BadRequestError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { requireAuth } from "../middleware/auth.js";
import { createAccessToken } from "../lib/jwt.js";
import { clearAuthCookie, setAuthCookie } from "../lib/authCookies.js";
import { isUserSchemaDriftError, normalizeTokenVersion } from "../lib/authTokenVersion.js";

export const usersRouter = Router({ mergeParams: true });

type PasswordUserRecord = {
  id: string;
  email: string;
  passwordHash: string | null;
  googleProfileId: string | null;
  appleSubject: string | null;
  authTokenVersion: number | null;
  deletedAt: Date | null;
};

type UserProfileRecord = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  googleProfileId: string | null;
  appleSubject: string | null;
  appleEmailIsPrivateRelay: boolean;
  hasPassword: boolean;
  accountDeletionRequestedAt: Date | null;
  accountDeletionRequestNote: string | null;
};

type AccountDeletionPreview = {
  ownedBusinessCount: number;
  businessMembershipCount: number;
  linkedStaffProfileCount: number;
  deletedDataSummary: string[];
  retainedDataSummary: string[];
  requiresHistoricalRetention: boolean;
};

const DELETE_ACCOUNT_CONFIRMATION = "DELETE";
const ACCOUNT_DELETION_MODE = "tombstone_anonymized";

export function buildDeletedUserPlaceholderEmail(userId: string): string {
  return `deleted+${userId}@deleted.stratacrm.invalid`;
}

export function hashDeletionAuditEmail(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

export function buildAccountDeletionPreview(input: {
  hasPassword: boolean;
  hasGoogle: boolean;
  hasApple: boolean;
  ownedBusinessCount: number;
  businessMembershipCount: number;
  linkedStaffProfileCount: number;
}): AccountDeletionPreview {
  const linkedProviders = [
    input.hasApple ? "Apple" : null,
    input.hasGoogle ? "Google" : null,
  ].filter(Boolean) as string[];

  const deletedDataSummary = [
    "Your profile details, saved notifications, and device sessions",
    input.hasPassword ? "Email and password sign-in for this account" : null,
    linkedProviders.length > 0
      ? `Linked ${linkedProviders.join(linkedProviders.length === 2 ? " and " : ", ")} sign-in ${linkedProviders.length === 1 ? "identity" : "identities"}`
      : null,
    input.businessMembershipCount > 0 || input.ownedBusinessCount > 0
      ? "Business memberships, permissions, and workspace access"
      : null,
  ].filter(Boolean) as string[];

  const retainedDataSummary = [
    input.ownedBusinessCount > 0
      ? "Issued invoices, payments, tax records, and Stripe billing history may be retained where accounting or legal rules require it."
      : null,
    input.linkedStaffProfileCount > 0 || input.businessMembershipCount > 0 || input.ownedBusinessCount > 0
      ? 'Historical activity, scheduling, and staffing records may keep a non-personal "Deleted user" placeholder so existing shop records still make sense.'
      : null,
  ].filter(Boolean) as string[];

  return {
    ownedBusinessCount: input.ownedBusinessCount,
    businessMembershipCount: input.businessMembershipCount,
    linkedStaffProfileCount: input.linkedStaffProfileCount,
    deletedDataSummary,
    retainedDataSummary,
    requiresHistoricalRetention: retainedDataSummary.length > 0,
  };
}

function getDeletionAuditEmailDomain(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  const atIndex = normalized.lastIndexOf("@");
  if (atIndex < 0 || atIndex === normalized.length - 1) return null;
  return normalized.slice(atIndex + 1);
}

async function loadUserByIdSafe(userId: string): Promise<PasswordUserRecord | null> {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    return user
      ? {
          id: user.id,
          email: user.email,
          passwordHash: user.passwordHash ?? null,
          googleProfileId: user.googleProfileId ?? null,
          appleSubject: user.appleSubject ?? null,
          authTokenVersion: user.authTokenVersion ?? null,
          deletedAt: user.deletedAt ?? null,
        }
      : null;
  } catch (error) {
    if (!isUserSchemaDriftError(error)) throw error;
    logger.warn("Users schema drift detected during password-route lookup; falling back to legacy select", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    const result = await db.execute(sql`
      SELECT id, email, password_hash, google_profile_id, apple_subject, deleted_at
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
          appleSubject: (row.apple_subject as string | null | undefined) ?? null,
          authTokenVersion: null,
          deletedAt: (row.deleted_at as Date | null | undefined) ?? null,
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
        appleSubject: users.appleSubject,
        appleEmailIsPrivateRelay: users.appleEmailIsPrivateRelay,
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
      SELECT id, email, first_name, last_name, google_profile_id, apple_subject, apple_email_is_private_relay, password_hash
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
          appleSubject: (row.apple_subject as string | null | undefined) ?? null,
          appleEmailIsPrivateRelay:
            (row.apple_email_is_private_relay as boolean | null | undefined) ?? false,
          hasPassword: Boolean(row.password_hash),
          accountDeletionRequestedAt: null,
          accountDeletionRequestNote: null,
        }
      : null;
  }
}

async function loadAccountDeletionPreviewSafe(
  userId: string,
  authState: {
    hasPassword: boolean;
    hasGoogle: boolean;
    hasApple: boolean;
  }
): Promise<AccountDeletionPreview> {
  try {
    const [ownedBusinessesResult, membershipsResult, linkedStaffResult] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(businesses)
        .where(eq(businesses.ownerId, userId))
        .limit(1),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(businessMemberships)
        .where(eq(businessMemberships.userId, userId))
        .limit(1),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(staff)
        .where(and(eq(staff.userId, userId), isNull(staff.deletedAt)))
        .limit(1),
    ]);

    return buildAccountDeletionPreview({
      ...authState,
      ownedBusinessCount: ownedBusinessesResult[0]?.count ?? 0,
      businessMembershipCount: membershipsResult[0]?.count ?? 0,
      linkedStaffProfileCount: linkedStaffResult[0]?.count ?? 0,
    });
  } catch (error) {
    if (!isUserSchemaDriftError(error)) throw error;
    logger.warn("Account deletion preview unavailable because the latest account schema is not applied", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return buildAccountDeletionPreview({
      ...authState,
      ownedBusinessCount: 0,
      businessMembershipCount: 0,
      linkedStaffProfileCount: 0,
    });
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
const deleteAccountSchema = z.object({
  confirmationText: z.string().trim().min(1, "Type DELETE to confirm account deletion."),
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
      throw new BadRequestError("This account does not have a password. Sign in with Apple or Google, or use forgot password.");
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
    if (user.passwordHash && !user.googleProfileId && !user.appleSubject) {
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

usersRouter.post("/delete-account", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = deleteAccountSchema.safeParse(req.body);
    if (!parsed.success) {
      const first = parsed.error.issues[0]?.message;
      throw new BadRequestError(first ?? "Invalid input");
    }

    if (parsed.data.confirmationText.trim().toUpperCase() !== DELETE_ACCOUNT_CONFIRMATION) {
      throw new AppError("Type DELETE to confirm account deletion.", 400, "DELETE_CONFIRMATION_REQUIRED");
    }

    const userId = req.userId!;
    const now = new Date();
    const deletionResult = await db.transaction(async (tx) => {
      const [existingUser] = await tx
        .select({
          id: users.id,
          email: users.email,
          passwordHash: users.passwordHash,
          googleProfileId: users.googleProfileId,
          appleSubject: users.appleSubject,
          authTokenVersion: users.authTokenVersion,
          deletedAt: users.deletedAt,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!existingUser) throw new NotFoundError("User not found.");

      const preview = await loadAccountDeletionPreviewSafe(userId, {
        hasPassword: Boolean(existingUser.passwordHash),
        hasGoogle: Boolean(existingUser.googleProfileId),
        hasApple: Boolean(existingUser.appleSubject),
      });

      if (existingUser.deletedAt) {
        return {
          alreadyDeleted: true,
          deletedAt: existingUser.deletedAt,
          preview,
        };
      }

      const authProviders = [
        existingUser.appleSubject ? "apple" : null,
        existingUser.googleProfileId ? "google" : null,
        existingUser.passwordHash ? "password" : null,
      ].filter(Boolean) as string[];

      await tx
        .insert(accountDeletionAudits)
        .values({
          userId,
          deletedUserId: userId,
          emailHash: hashDeletionAuditEmail(existingUser.email),
          emailDomain: getDeletionAuditEmailDomain(existingUser.email),
          authProviders: JSON.stringify(authProviders),
          ownedBusinessCount: preview.ownedBusinessCount,
          businessMembershipCount: preview.businessMembershipCount,
          linkedStaffProfileCount: preview.linkedStaffProfileCount,
          retainedDataSummary: JSON.stringify(preview.retainedDataSummary),
          deletionMode: ACCOUNT_DELETION_MODE,
          requestedAt: now,
          completedAt: now,
        })
        .onConflictDoNothing();

      await tx
        .update(activityLogs)
        .set({ userId: null })
        .where(eq(activityLogs.userId, userId));

      await tx
        .update(businessMemberships)
        .set({ invitedByUserId: null, updatedAt: now })
        .where(eq(businessMemberships.invitedByUserId, userId));

      await tx
        .update(integrationJobs)
        .set({ createdByUserId: null, updatedAt: now })
        .where(eq(integrationJobs.createdByUserId, userId));

      await tx
        .update(staff)
        .set({
          userId: null,
          email: null,
          firstName: "Deleted",
          lastName: "User",
          active: false,
          updatedAt: now,
        })
        .where(eq(staff.userId, userId));

      await tx
        .delete(dashboardPreferences)
        .where(eq(dashboardPreferences.userId, userId));

      await tx
        .delete(membershipPermissionGrants)
        .where(eq(membershipPermissionGrants.userId, userId));

      await tx
        .delete(notifications)
        .where(eq(notifications.userId, userId));

      await tx
        .delete(integrationConnections)
        .where(eq(integrationConnections.userId, userId));

      await tx
        .delete(businessMemberships)
        .where(eq(businessMemberships.userId, userId));

      await tx
        .update(users)
        .set({
          email: buildDeletedUserPlaceholderEmail(userId),
          passwordHash: null,
          firstName: null,
          lastName: null,
          emailVerified: false,
          googleProfileId: null,
          appleSubject: null,
          appleEmail: null,
          appleEmailIsPrivateRelay: false,
          authTokenVersion: normalizeTokenVersion(existingUser.authTokenVersion) + 1,
          accountDeletionRequestedAt: now,
          accountDeletionRequestNote: null,
          deletedAt: now,
          updatedAt: now,
        })
        .where(eq(users.id, userId));

      return {
        alreadyDeleted: false,
        deletedAt: now,
        preview,
      };
    });

    clearAuthCookie(res, req);
    logger.info("Account deleted in-app", {
      userId,
      alreadyDeleted: deletionResult.alreadyDeleted,
      deletionMode: ACCOUNT_DELETION_MODE,
      ownedBusinessCount: deletionResult.preview.ownedBusinessCount,
      businessMembershipCount: deletionResult.preview.businessMembershipCount,
      linkedStaffProfileCount: deletionResult.preview.linkedStaffProfileCount,
    });

    res.json({
      ok: true,
      alreadyDeleted: deletionResult.alreadyDeleted,
      deletedAt: deletionResult.deletedAt,
      deletionMode: ACCOUNT_DELETION_MODE,
      deletedDataSummary: deletionResult.preview.deletedDataSummary,
      retainedDataSummary: deletionResult.preview.retainedDataSummary,
      redirectPath: "/sign-in?accountDeleted=1",
    });
  } catch (error) {
    if (isUserSchemaDriftError(error)) {
      logger.warn("Account deletion unavailable because the latest account schema is not applied", {
        userId: req.userId,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(503).json({
        message: "Account deletion is temporarily unavailable while the latest account schema update is being applied.",
      });
      return;
    }
    logger.error("Account deletion failed", {
      userId: req.userId,
      error: error instanceof Error ? error.message : String(error),
      code: error instanceof AppError ? error.code : undefined,
    });
    next(error);
  }
});

usersRouter.get("/:id", requireAuth, async (req: Request, res: Response) => {
  const id = req.params.id;
  if (req.userId !== id) throw new NotFoundError("User not found.");
  const user = await loadUserProfileByIdSafe(id);
  if (!user) throw new NotFoundError("User not found.");
  const accountDeletionPreview = await loadAccountDeletionPreviewSafe(id, {
    hasPassword: user.hasPassword,
    hasGoogle: Boolean(user.googleProfileId),
    hasApple: Boolean(user.appleSubject),
  });
  res.json({
    ...user,
    accountDeletionPreview,
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
        appleSubject: users.appleSubject,
        appleEmailIsPrivateRelay: users.appleEmailIsPrivateRelay,
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

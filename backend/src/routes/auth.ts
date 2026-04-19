import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "../db/index.js";
import { businessMemberships, businesses, membershipPermissionGrants, users } from "../db/schema.js";
import { and, eq, inArray, sql } from "drizzle-orm";
import { BadRequestError, UnauthorizedError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { googleClient } from "../lib/googleAuth.js";
import { wrapAsync } from "../lib/asyncHandler.js";
import { randomUUID } from "crypto";
import { getDefaultPermissionsForRole, resolvePermissionsForRole } from "../lib/permissions.js";
import { createRateLimiter } from "../middleware/security.js";
import { createAccessToken, createPasswordResetToken, verifyAccessToken, verifyPasswordResetToken, verifyTeamInviteToken } from "../lib/jwt.js";
import { clearAuthCookie, getAuthTokenFromCookieHeader, setAuthCookie } from "../lib/authCookies.js";
import { isAuthTokenVersionMismatch, isUserSchemaDriftError, loadAuthTokenVersion, normalizeTokenVersion } from "../lib/authTokenVersion.js";
import { sendTemplatedEmail } from "../lib/email.js";
import { isEmailConfigured } from "../lib/env.js";

const MAX_EMAIL_LENGTH = 320;
const MAX_PASSWORD_LENGTH = 72;
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("strata-dummy-password", 10);

const signInSchema = z.object({
  email: z.string().email().max(MAX_EMAIL_LENGTH),
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
});
const signUpSchema = z.object({
  email: z.string().email().max(MAX_EMAIL_LENGTH),
  password: z.string().min(8).max(MAX_PASSWORD_LENGTH),
  firstName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
  inviteToken: z.string().min(1).optional(),
});
const forgotPasswordSchema = z.object({
  email: z.string().email().max(MAX_EMAIL_LENGTH),
});
const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: z.string().min(8).max(MAX_PASSWORD_LENGTH),
});
export const authRouter = Router();

const signInLimiter = createRateLimiter({
  id: "auth_sign_in",
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: "Too many sign-in attempts. Please wait a few minutes and try again.",
  key: ({ ip, body }) => {
    const email = typeof (body as { email?: unknown })?.email === "string" ? normalizeEmail((body as { email: string }).email) : "";
    return `auth:sign-in:${ip}:${email}`;
  },
});

const signUpLimiter = createRateLimiter({
  id: "auth_sign_up",
  windowMs: 60 * 60 * 1000,
  max: 6,
  message: "Too many sign-up attempts. Please wait a bit before trying again.",
  key: ({ ip, body }) => {
    const email = typeof (body as { email?: unknown })?.email === "string" ? normalizeEmail((body as { email: string }).email) : "";
    return `auth:sign-up:${ip}:${email}`;
  },
});
const forgotPasswordLimiter = createRateLimiter({
  id: "auth_forgot_password",
  windowMs: 30 * 60 * 1000,
  max: 6,
  message: "Too many password reset requests. Please wait a bit before trying again.",
  key: ({ ip, body }) => {
    const email = typeof (body as { email?: unknown })?.email === "string" ? normalizeEmail((body as { email: string }).email) : "";
    return `auth:forgot-password:${ip}:${email}`;
  },
});

const resetPasswordLimiter = createRateLimiter({
  id: "auth_reset_password",
  windowMs: 30 * 60 * 1000,
  max: 12,
  message: "Too many password reset attempts. Please wait a bit before trying again.",
});

const googleOAuthStartLimiter = createRateLimiter({
  id: "auth_google_start",
  windowMs: 10 * 60 * 1000,
  max: 30,
  message: "Too many Google sign-in attempts. Please try again shortly.",
});

const googleOAuthCallbackLimiter = createRateLimiter({
  id: "auth_google_callback",
  windowMs: 10 * 60 * 1000,
  max: 30,
  message: "Too many Google callback attempts. Please try again shortly.",
});

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

type GoogleAuthUserSnapshot = {
  googleProfileId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  emailVerified?: boolean | null;
};

type GoogleAuthProfile = {
  googleProfileId: string;
  firstName: string | null;
  lastName: string | null;
};

export function resolveGoogleAccountUpdates(existingUser: GoogleAuthUserSnapshot, profile: GoogleAuthProfile) {
  if (existingUser.googleProfileId && existingUser.googleProfileId !== profile.googleProfileId) {
    throw new UnauthorizedError("This email is already linked to a different Google account.");
  }

  const updates: {
    googleProfileId?: string;
    firstName?: string | null;
    lastName?: string | null;
    emailVerified?: boolean;
    updatedAt?: Date;
  } = {};

  if (!existingUser.googleProfileId) {
    updates.googleProfileId = profile.googleProfileId;
  }
  if (!existingUser.firstName && profile.firstName) {
    updates.firstName = profile.firstName;
  }
  if (!existingUser.lastName && profile.lastName) {
    updates.lastName = profile.lastName;
  }
  if (!existingUser.emailVerified) {
    updates.emailVerified = true;
  }

  if (Object.keys(updates).length === 0) return null;
  return {
    ...updates,
    updatedAt: new Date(),
  };
}

function serializeAuthUser(user: {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  googleProfileId?: string | null;
  passwordHash?: string | null;
}) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    googleProfileId: user.googleProfileId ?? null,
    hasPassword: Boolean(user.passwordHash),
    googleImageUrl: null,
    profilePicture: null,
  };
}

export function resolveSafeRedirectPath(input: unknown): string {
  if (typeof input !== "string") return "/signed-in";
  const trimmed = input.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return "/signed-in";
  return trimmed || "/signed-in";
}

export function resolveGoogleStateRedirect(input: unknown): string {
  if (typeof input !== "string" || input.trim() === "") return "/signed-in";
  try {
    const parsed = JSON.parse(input) as { redirectPath?: unknown };
    return resolveSafeRedirectPath(parsed.redirectPath);
  } catch {
    return "/signed-in";
  }
}

export function buildPostAuthRedirectUrl(frontendUrl: string, redirectPath: string, token: string): string {
  const target = new URL(redirectPath, `${frontendUrl}/`);
  if (target.origin !== frontendUrl) {
    throw new BadRequestError("Google auth redirect path must stay within the app.");
  }
  if (target.pathname === "/app-return") {
    target.searchParams.set("authToken", token);
    return target.toString();
  }
  const baseRedirect = target.toString();
  const separator = baseRedirect.includes("#") ? "&" : "#";
  return `${baseRedirect}${separator}authToken=${encodeURIComponent(token)}`;
}

export function resolveFrontendBaseUrl(_req: Request): string {
  const configured = process.env.FRONTEND_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  throw new BadRequestError("Password reset is not configured.");
}

type AuthUserRecord = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  googleProfileId: string | null;
  passwordHash: string | null;
  authTokenVersion: number | null;
  emailVerified: boolean | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

function mapLegacyUserRow(row: Record<string, unknown>): AuthUserRecord {
  return {
    id: String(row.id),
    email: String(row.email),
    firstName: (row.first_name as string | null | undefined) ?? (row.firstName as string | null | undefined) ?? null,
    lastName: (row.last_name as string | null | undefined) ?? (row.lastName as string | null | undefined) ?? null,
    googleProfileId:
      (row.google_profile_id as string | null | undefined) ?? (row.googleProfileId as string | null | undefined) ?? null,
    passwordHash:
      (row.password_hash as string | null | undefined) ?? (row.passwordHash as string | null | undefined) ?? null,
    emailVerified:
      (row.email_verified as boolean | null | undefined) ?? (row.emailVerified as boolean | null | undefined) ?? null,
    authTokenVersion:
      (row.auth_token_version as number | null | undefined) ?? (row.authTokenVersion as number | null | undefined) ?? null,
    createdAt: (row.created_at as Date | null | undefined) ?? (row.createdAt as Date | null | undefined) ?? null,
    updatedAt: (row.updated_at as Date | null | undefined) ?? (row.updatedAt as Date | null | undefined) ?? null,
  };
}

function normalizeAuthUser(user: AuthUserRecord): AuthUserRecord {
  return {
    ...user,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    googleProfileId: user.googleProfileId ?? null,
    passwordHash: user.passwordHash ?? null,
    authTokenVersion: user.authTokenVersion ?? null,
    emailVerified: user.emailVerified ?? null,
    createdAt: user.createdAt ?? null,
    updatedAt: user.updatedAt ?? null,
  };
}

async function createUserSafe(params: {
  email: string;
  passwordHash?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  googleProfileId?: string | null;
  emailVerified?: boolean;
}): Promise<AuthUserRecord | null> {
  const id = randomUUID();
  try {
    const [createdUser] = await db
      .insert(users)
      .values({
        id,
        email: params.email,
        passwordHash: params.passwordHash ?? null,
        firstName: params.firstName ?? null,
        lastName: params.lastName ?? null,
        googleProfileId: params.googleProfileId ?? null,
        emailVerified: params.emailVerified ?? false,
      })
      .returning({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        googleProfileId: users.googleProfileId,
        passwordHash: users.passwordHash,
        authTokenVersion: users.authTokenVersion,
        emailVerified: users.emailVerified,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      });
    return createdUser ? normalizeAuthUser(createdUser as AuthUserRecord) : null;
  } catch (error) {
    if (!isUserSchemaDriftError(error)) throw error;
    logger.warn("Users schema drift detected during create; falling back to legacy insert", {
      email: params.email,
      error: error instanceof Error ? error.message : String(error),
    });
    const result = await db.execute(sql`
      INSERT INTO users (
        id,
        email,
        password_hash,
        first_name,
        last_name,
        email_verified,
        google_profile_id
      )
      VALUES (
        ${id},
        ${params.email},
        ${params.passwordHash ?? null},
        ${params.firstName ?? null},
        ${params.lastName ?? null},
        ${params.emailVerified ?? false},
        ${params.googleProfileId ?? null}
      )
      RETURNING id, email, password_hash, first_name, last_name, email_verified, google_profile_id, created_at, updated_at
    `);
    const row = (result as { rows?: Array<Record<string, unknown>> }).rows?.[0];
    return row ? mapLegacyUserRow(row) : null;
  }
}

async function updateUserReturningSafe(
  userId: string,
  updates: {
    passwordHash?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    googleProfileId?: string | null;
    emailVerified?: boolean;
    updatedAt: Date;
  }
): Promise<AuthUserRecord | null> {
  try {
    const [updatedUser] = await db
      .update(users)
      .set({
        passwordHash: updates.passwordHash,
        firstName: updates.firstName,
        lastName: updates.lastName,
        googleProfileId: updates.googleProfileId,
        emailVerified: updates.emailVerified,
        updatedAt: updates.updatedAt,
      })
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        googleProfileId: users.googleProfileId,
        passwordHash: users.passwordHash,
        authTokenVersion: users.authTokenVersion,
        emailVerified: users.emailVerified,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      });
    return updatedUser ? normalizeAuthUser(updatedUser as AuthUserRecord) : null;
  } catch (error) {
    if (!isUserSchemaDriftError(error)) throw error;
    logger.warn("Users schema drift detected during update; falling back to legacy update", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    const result = await db.execute(sql`
      UPDATE users
      SET
        password_hash = COALESCE(${updates.passwordHash ?? null}, password_hash),
        first_name = COALESCE(${updates.firstName ?? null}, first_name),
        last_name = COALESCE(${updates.lastName ?? null}, last_name),
        google_profile_id = COALESCE(${updates.googleProfileId ?? null}, google_profile_id),
        email_verified = COALESCE(${updates.emailVerified ?? null}, email_verified),
        updated_at = ${updates.updatedAt}
      WHERE id = ${userId}
      RETURNING id, email, password_hash, first_name, last_name, email_verified, google_profile_id, created_at, updated_at
    `);
    const row = (result as { rows?: Array<Record<string, unknown>> }).rows?.[0];
    return row ? mapLegacyUserRow(row) : null;
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
    logger.warn("Users schema drift detected during password update; falling back to legacy update", {
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

async function loadUserByEmailSafe(email: string): Promise<AuthUserRecord | null> {
  try {
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return user ? normalizeAuthUser(user as AuthUserRecord) : null;
  } catch (error) {
    if (!isUserSchemaDriftError(error)) throw error;
    logger.warn("Users schema drift detected during email lookup; falling back to legacy select", {
      email,
      error: error instanceof Error ? error.message : String(error),
    });
    const result = await db.execute(sql`
      SELECT id, email, password_hash, first_name, last_name, email_verified, google_profile_id, created_at, updated_at
      FROM users
      WHERE email = ${email}
      LIMIT 1
    `);
    const row = (result as { rows?: Array<Record<string, unknown>> }).rows?.[0];
    return row ? mapLegacyUserRow(row) : null;
  }
}

async function loadUserByIdSafe(userId: string): Promise<AuthUserRecord | null> {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    return user ? normalizeAuthUser(user as AuthUserRecord) : null;
  } catch (error) {
    if (!isUserSchemaDriftError(error)) throw error;
    logger.warn("Users schema drift detected during ID lookup; falling back to legacy select", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    const result = await db.execute(sql`
      SELECT id, email, password_hash, first_name, last_name, email_verified, google_profile_id, created_at, updated_at
      FROM users
      WHERE id = ${userId}
      LIMIT 1
    `);
    const row = (result as { rows?: Array<Record<string, unknown>> }).rows?.[0];
    return row ? mapLegacyUserRow(row) : null;
  }
}

async function getAuthContextFromRequest(req: Request): Promise<{ userId: string; tokenVersion?: number } | null> {
  const authHeader = req.headers.authorization ?? "";
  const bearerPrefix = "Bearer ";
  let rawToken = authHeader.startsWith(bearerPrefix) ? authHeader.slice(bearerPrefix.length).trim() : "";
  if (!rawToken) {
    rawToken = getAuthTokenFromCookieHeader(req.headers.cookie) ?? "";
  }
  if (!rawToken) return null;
  const payload = verifyAccessToken(rawToken);
  if (!payload?.userId) return null;
  const currentVersion = await loadAuthTokenVersion(payload.userId);
  if (isAuthTokenVersionMismatch(payload.ver, currentVersion)) return null;
  return { userId: payload.userId, tokenVersion: normalizeTokenVersion(payload.ver) };
}

function isTenantSchemaDriftError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: string }).code;
  const message = String((error as { message?: string }).message ?? "").toLowerCase();
  return (
    code === "42P01" ||
    code === "42703" ||
    message.includes("does not exist")
  );
}

async function buildSafeAuthContext(userId: string) {
  try {
    const ownedBusinesses = await db
      .select({
        id: businesses.id,
        name: businesses.name,
        type: businesses.type,
        onboardingComplete: businesses.onboardingComplete,
      })
      .from(businesses)
      .where(eq(businesses.ownerId, userId));

    return {
      businesses: ownedBusinesses.map((ownedBusiness, index) => ({
        id: ownedBusiness.id,
        name: ownedBusiness.name,
        type: ownedBusiness.type,
        role: "owner",
        status: "active",
        isDefault: index === 0,
        onboardingComplete: ownedBusiness.onboardingComplete ?? null,
        permissions: Array.from(getDefaultPermissionsForRole("owner")),
      })),
      currentBusinessId: ownedBusinesses[0]?.id ?? null,
    };
  } catch (error) {
    logger.error("Failed to build fallback auth context", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { businesses: [], currentBusinessId: null };
  }
}

async function activateInvitedMemberships(userId: string) {
  const invitedMemberships = await db
    .select({
      businessId: businessMemberships.businessId,
      role: businessMemberships.role,
      businessName: businesses.name,
    })
    .from(businessMemberships)
    .leftJoin(businesses, eq(businessMemberships.businessId, businesses.id))
    .where(and(eq(businessMemberships.userId, userId), eq(businessMemberships.status, "invited")))
    .catch((error) => {
      if (!isTenantSchemaDriftError(error)) throw error;
      logger.warn("business membership schema unavailable during invite activation lookup", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    });

  if (invitedMemberships.length === 0) return [];

  try {
    await db
      .update(businessMemberships)
      .set({
        status: "active",
        joinedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(businessMemberships.userId, userId), eq(businessMemberships.status, "invited")));
  } catch (error) {
    if (!isTenantSchemaDriftError(error)) throw error;
    logger.warn("business membership schema unavailable during invite activation", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return invitedMemberships;
}

async function getMembershipPermissionMap(userId: string, businessIds: string[]) {
  if (businessIds.length === 0) return new Map<string, Array<{ permission: (typeof membershipPermissionGrants.$inferSelect)["permission"]; enabled: boolean }>>();

  const overrides = await db
    .select({
      businessId: membershipPermissionGrants.businessId,
      permission: membershipPermissionGrants.permission,
      enabled: membershipPermissionGrants.enabled,
    })
    .from(membershipPermissionGrants)
    .where(and(eq(membershipPermissionGrants.userId, userId), inArray(membershipPermissionGrants.businessId, businessIds)))
    .catch((error) => {
      if (!isTenantSchemaDriftError(error)) throw error;
      logger.warn("membership permission grants unavailable during auth context load", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    });

  const byBusiness = new Map<string, Array<{ permission: (typeof membershipPermissionGrants.$inferSelect)["permission"]; enabled: boolean }>>();
  for (const override of overrides) {
    const list = byBusiness.get(override.businessId) ?? [];
    list.push({ permission: override.permission, enabled: override.enabled });
    byBusiness.set(override.businessId, list);
  }
  return byBusiness;
}

function formatRoleLabel(role: string): string {
  return role.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

async function sendActivatedMembershipEmails(
  req: Request,
  user: { email: string; firstName: string | null },
  memberships: Array<{ businessId: string; role: string; businessName: string | null }>
) {
  if (!isEmailConfigured() || memberships.length === 0) return;
  const frontendBaseUrl = resolveFrontendBaseUrl(req);

  for (const membership of memberships) {
    const params = new URLSearchParams({
      email: user.email,
      redirectPath: "/signed-in",
    });
    const signInUrl = `${frontendBaseUrl}/sign-in?${params.toString()}`;
    await sendTemplatedEmail({
      to: user.email,
      businessId: membership.businessId,
      templateSlug: "team_access_ready",
      vars: {
        userName: user.firstName?.trim() || user.email,
        businessName: membership.businessName?.trim() || "your shop",
        roleLabel: formatRoleLabel(membership.role),
        signInUrl,
      },
    });
  }
}
/** GET /api/auth/me — current user from JWT. Returns 401 if not signed in. */
authRouter.get(
  "/me",
  wrapAsync(async (req: Request, res: Response) => {
    const auth = await getAuthContextFromRequest(req);
    if (!auth?.userId) {
      res.status(401).json({ message: "Not signed in" });
      return;
    }
    const user = await loadUserByIdSafe(auth.userId);
    if (!user) {
      res.status(401).json({ message: "Not signed in" });
      return;
    }
    const token = createAccessToken(user.id, normalizeTokenVersion(user.authTokenVersion));
    setAuthCookie(res, token, req);
    res.json({
      data: {
        ...serializeAuthUser(user),
        token,
      },
    });
  })
);
authRouter.get(
  "/context",
  wrapAsync(async (req: Request, res: Response) => {
    const auth = await getAuthContextFromRequest(req);
    if (!auth?.userId) {
      res.status(401).json({ message: "Not signed in" });
      return;
    }

    try {
      const ownedBusinesses = await db
        .select({
          id: businesses.id,
          name: businesses.name,
          type: businesses.type,
          onboardingComplete: businesses.onboardingComplete,
        })
        .from(businesses)
        .where(eq(businesses.ownerId, auth.userId));
      let memberships: Array<{
        businessId: string;
        role: "owner" | "admin" | "manager" | "service_advisor" | "technician";
        status: "invited" | "active" | "suspended";
        isDefault: boolean;
      }> = [];

      try {
        memberships = await db
          .select({
            businessId: businessMemberships.businessId,
            role: businessMemberships.role,
            status: businessMemberships.status,
            isDefault: businessMemberships.isDefault,
          })
          .from(businessMemberships)
          .where(eq(businessMemberships.userId, auth.userId));
      } catch (error) {
        if (!isTenantSchemaDriftError(error)) throw error;
        logger.warn("business membership schema unavailable; falling back to owner-only auth context", {
          userId: auth.userId,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      const byBusiness = new Map<
        string,
        {
          id: string;
          name: string | null;
          type: string | null;
          role: string;
          status: string;
          isDefault: boolean;
          onboardingComplete: boolean | null;
          permissions: string[];
        }
      >();

      for (const ownedBusiness of ownedBusinesses) {
        byBusiness.set(ownedBusiness.id, {
          id: ownedBusiness.id,
          name: ownedBusiness.name,
          type: ownedBusiness.type,
          role: "owner",
          status: "active",
          isDefault: memberships.length === 0,
          onboardingComplete: ownedBusiness.onboardingComplete ?? null,
          permissions: Array.from(getDefaultPermissionsForRole("owner")),
        });
      }

      if (memberships.length > 0) {
        const membershipBusinessIds = memberships.map((membership) => membership.businessId).filter((id) => !byBusiness.has(id));
        const membershipBusinesses = membershipBusinessIds.length === 0
          ? []
          : await db
              .select({
                id: businesses.id,
                name: businesses.name,
                type: businesses.type,
                onboardingComplete: businesses.onboardingComplete,
              })
              .from(businesses)
              .where(inArray(businesses.id, membershipBusinessIds));

        const membershipBusinessMap = new Map(membershipBusinesses.map((business) => [business.id, business]));
        const permissionOverridesByBusiness = await getMembershipPermissionMap(
          auth.userId,
          memberships.map((membership) => membership.businessId)
        );
        for (const membership of memberships) {
          if (byBusiness.has(membership.businessId)) continue;
          const membershipBusiness = membershipBusinessMap.get(membership.businessId);
          byBusiness.set(membership.businessId, {
            id: membership.businessId,
            name: membershipBusiness?.name ?? null,
            type: membershipBusiness?.type ?? null,
            role: membership.role,
            status: membership.status,
            isDefault: membership.isDefault,
            onboardingComplete: membershipBusiness?.onboardingComplete ?? null,
            permissions: Array.from(resolvePermissionsForRole(membership.role, permissionOverridesByBusiness.get(membership.businessId))),
          });
        }
      }

      const orderedBusinesses = Array.from(byBusiness.values()).sort((a, b) => {
        if (a.isDefault === b.isDefault) return a.name?.localeCompare(b.name ?? "") ?? 0;
        return a.isDefault ? -1 : 1;
      });

      res.json({
        data: {
          businesses: orderedBusinesses,
          currentBusinessId: orderedBusinesses.find((business) => business.isDefault)?.id ?? orderedBusinesses[0]?.id ?? null,
        },
      });
    } catch (error) {
      logger.error("Auth context failed; returning safe fallback", {
        userId: auth.userId,
        error: error instanceof Error ? error.message : String(error),
      });
      res.json({ data: await buildSafeAuthContext(auth.userId) });
    }
  })
);
authRouter.post(
  "/sign-in",
  signInLimiter.middleware,
  wrapAsync(async (req: Request, res: Response, _next: NextFunction) => {
    const parsed = signInSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");
    const email = normalizeEmail(parsed.data.email);
    const { password } = parsed.data;
    const user = await loadUserByEmailSafe(email);
    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user || !user.passwordHash) throw new UnauthorizedError("Invalid email or password.");
    if (!ok) throw new UnauthorizedError("Invalid email or password.");
    const activatedMemberships = await activateInvitedMemberships(user.id);
    await sendActivatedMembershipEmails(req, { email: user.email, firstName: user.firstName }, activatedMemberships);
    const token = createAccessToken(user.id, normalizeTokenVersion(user.authTokenVersion));
    setAuthCookie(res, token, req);
    logger.info("User signed in", { userId: user.id, email: user.email });
    res.json({
      data: {
        ...serializeAuthUser(user),
        token,
      },
    });
  })
);
authRouter.post(
  "/sign-up",
  signUpLimiter.middleware,
  wrapAsync(async (req: Request, res: Response, _next: NextFunction) => {
    const parsed = signUpSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");
    const email = normalizeEmail(parsed.data.email);
    const { password, firstName, lastName, inviteToken } = parsed.data;
    const existing = await loadUserByEmailSafe(email);
    const passwordHash = await bcrypt.hash(password, 10);
    let user:
      | {
          id: string;
          email: string;
          firstName: string | null;
          lastName: string | null;
          authTokenVersion?: number | null;
          googleProfileId?: string | null;
          passwordHash?: string | null;
        }
      | undefined;

    if (existing) {
      if (existing.passwordHash) {
        if (inviteToken) {
          throw new BadRequestError("This email already has a Strata account. Sign in to accept your invite.");
        }
        throw new BadRequestError("An account with this email already exists.");
      }

      const verifiedInvite = inviteToken ? verifyTeamInviteToken(inviteToken) : null;
      const needsInviteToken = await db
        .select({ businessId: businessMemberships.businessId })
        .from(businessMemberships)
        .where(and(eq(businessMemberships.userId, existing.id), eq(businessMemberships.status, "invited")))
        .limit(1)
        .then((rows) => rows.length > 0)
        .catch((error) => {
          if (!isTenantSchemaDriftError(error)) throw error;
          logger.warn("business membership schema unavailable during invite token validation", {
            userId: existing.id,
            error: error instanceof Error ? error.message : String(error),
          });
          return false;
        });

      if (needsInviteToken) {
        if (
          !verifiedInvite?.userId ||
          !verifiedInvite?.email ||
          verifiedInvite.userId !== existing.id ||
          normalizeEmail(verifiedInvite.email) !== email
        ) {
          throw new BadRequestError("This invite link is missing, invalid, or expired. Ask your shop admin to resend it.");
        }
      }

      const invitedMemberships = await db
        .select({
          businessId: businessMemberships.businessId,
          role: businessMemberships.role,
          businessName: businesses.name,
        })
        .from(businessMemberships)
        .leftJoin(businesses, eq(businessMemberships.businessId, businesses.id))
        .where(and(eq(businessMemberships.userId, existing.id), eq(businessMemberships.status, "invited")))
        .catch((error) => {
          if (!isTenantSchemaDriftError(error)) throw error;
          logger.warn("business membership schema unavailable during invited account claim lookup", {
            userId: existing.id,
            error: error instanceof Error ? error.message : String(error),
          });
          return [];
        });

      const updatedAt = new Date();
      const claimedUser = await updateUserReturningSafe(existing.id, {
        passwordHash,
        firstName: firstName ?? existing.firstName ?? null,
        lastName: lastName ?? existing.lastName ?? null,
        updatedAt,
      });

      try {
        await db
          .update(businessMemberships)
          .set({
            status: "active",
            joinedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(and(eq(businessMemberships.userId, existing.id), eq(businessMemberships.status, "invited")));
      } catch (error) {
        if (!isTenantSchemaDriftError(error)) throw error;
        logger.warn("business membership schema unavailable during invited account claim", {
          userId: existing.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      if (!claimedUser) throw new BadRequestError("Failed to claim invited account.");
      user = claimedUser;
      await sendActivatedMembershipEmails(req, { email: claimedUser.email, firstName: claimedUser.firstName }, invitedMemberships);
      logger.info("Invited user claimed account", { userId: existing.id, email });
    } else {
      user = await createUserSafe({
        email,
        passwordHash,
        firstName: firstName ?? null,
        lastName: lastName ?? null,
      }) ?? undefined;
      logger.info("User signed up", { userId: user?.id, email: user?.email });
    }

    if (!user) throw new BadRequestError("Failed to create account.");
    const token = createAccessToken(user.id, normalizeTokenVersion(user.authTokenVersion));
    setAuthCookie(res, token, req);
    res.status(201).json({
      data: {
        ...serializeAuthUser(user),
        token,
      },
    });
  })
);
authRouter.post(
  "/forgot-password",
  forgotPasswordLimiter.middleware,
  wrapAsync(async (req: Request, res: Response) => {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? "Invalid input");
    const email = normalizeEmail(parsed.data.email);
    const user = await loadUserByEmailSafe(email);

    if (user) {
      if (!isEmailConfigured()) {
        throw new BadRequestError("Transactional email is not configured.");
      }
      const frontendBaseUrl = resolveFrontendBaseUrl(req);
      const token = createPasswordResetToken(user.id, user.email);
      const resetUrl = `${frontendBaseUrl}/reset-password?token=${encodeURIComponent(token)}`;
      await sendTemplatedEmail({
        to: user.email,
        templateSlug: "password_reset",
        vars: {
          userName: user.firstName?.trim() || user.email,
          resetUrl,
        },
      });
      logger.info("Password reset email sent", { userId: user.id, email: user.email });
    }

    res.json({
      ok: true,
      message: "If an account exists for that email, a password reset link has been sent.",
    });
  })
);
authRouter.post(
  "/reset-password",
  resetPasswordLimiter.middleware,
  wrapAsync(async (req: Request, res: Response) => {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? "Invalid input");
    const verified = verifyPasswordResetToken(parsed.data.token);
    if (!verified?.userId || !verified?.email) {
      throw new BadRequestError("This password reset link is invalid or has expired.");
    }
    const user = await loadUserByIdSafe(verified.userId);
    if (!user || normalizeEmail(user.email) !== normalizeEmail(verified.email)) {
      throw new BadRequestError("This password reset link is invalid or has expired.");
    }
    if (user.passwordHash) {
      const matchesCurrent = await bcrypt.compare(parsed.data.password, user.passwordHash);
      if (matchesCurrent) {
        throw new BadRequestError("Choose a different password from your current one.");
      }
    }
    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    const nextAuthVersion = normalizeTokenVersion(user.authTokenVersion) + 1;
    await updatePasswordHashSafe(user.id, passwordHash, nextAuthVersion);
    clearAuthCookie(res);
    logger.info("Password reset completed", { userId: user.id, email: user.email });
    res.json({ ok: true });
  })
);
authRouter.post("/sign-out", (_req: Request, res: Response) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});
// ---------------------------------------------------------------------------
// Google OAuth (sign in / sign up with Google)
// ---------------------------------------------------------------------------
authRouter.get(
  "/google/start",
  googleOAuthStartLimiter.middleware,
  wrapAsync(async (req: Request, res: Response) => {
    if (!googleClient) {
      throw new BadRequestError("Google sign-in is not configured.");
    }
    const redirectPath = resolveSafeRedirectPath(req.query.redirectPath);
    const url = googleClient.generateAuthUrl({
      access_type: "offline",
      scope: ["openid", "email", "profile"],
      state: JSON.stringify({ redirectPath }),
    });
    res.redirect(url);
  })
);
authRouter.get(
  "/google/callback",
  googleOAuthCallbackLimiter.middleware,
  wrapAsync(async (req: Request, res: Response) => {
    if (!googleClient) {
      throw new BadRequestError("Google sign-in is not configured.");
    }
    const code = req.query.code as string | undefined;
    if (!code) {
      throw new BadRequestError("Missing authorization code from Google.");
    }
    const { tokens } = await googleClient.getToken(code);
    const idToken = tokens.id_token;
    if (!idToken) {
      throw new BadRequestError("Failed to obtain ID token from Google.");
    }
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.email) {
      throw new BadRequestError("Google account did not return an email.");
    }
    if (!payload.sub) {
      throw new BadRequestError("Google account did not return a profile identifier.");
    }
    const email = normalizeEmail(payload.email);
    const googleProfileId = payload.sub;
    const firstName = payload.given_name ?? null;
    const lastName = payload.family_name ?? null;
    // Find or create user
    const existing = await loadUserByEmailSafe(email);
    let user: AuthUserRecord | null = existing;
    if (!user) {
      const created = await createUserSafe({
        email,
        googleProfileId,
        firstName,
        lastName,
        emailVerified: true,
      });
      if (!created) throw new BadRequestError("Failed to create account from Google profile.");
      user = created;
      logger.info("User signed up via Google", { userId: user.id, email: user.email });
    } else {
      const accountUpdates = resolveGoogleAccountUpdates(user, {
        googleProfileId,
        firstName,
        lastName,
      });
      if (accountUpdates) {
        const updatedUser = await updateUserReturningSafe(user.id, {
          googleProfileId: accountUpdates.googleProfileId,
          firstName: accountUpdates.firstName,
          lastName: accountUpdates.lastName,
          emailVerified: accountUpdates.emailVerified,
          updatedAt: accountUpdates.updatedAt ?? new Date(),
        });
        if (updatedUser) user = updatedUser;
      }
      if (!user) throw new BadRequestError("Failed to load Google account.");
      const activatedMemberships = await activateInvitedMemberships(user.id);
      await sendActivatedMembershipEmails(req, { email: user.email, firstName: user.firstName }, activatedMemberships);
      logger.info("User signed in via Google", { userId: user.id, email: user.email });
    }
    if (!user) throw new BadRequestError("Failed to complete Google sign-in.");
    const token = createAccessToken(user.id, normalizeTokenVersion(user.authTokenVersion));
    setAuthCookie(res, token, req);
    const redirectPath = resolveGoogleStateRedirect(req.query.state);
    const frontendUrl = resolveFrontendBaseUrl(req);
    res.redirect(buildPostAuthRedirectUrl(frontendUrl, redirectPath, token));
  })
);

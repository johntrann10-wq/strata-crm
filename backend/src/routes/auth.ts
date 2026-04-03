import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "../db/index.js";
import { businessMemberships, businesses, membershipPermissionGrants, users } from "../db/schema.js";
import { and, eq, inArray } from "drizzle-orm";
import { BadRequestError, UnauthorizedError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { googleClient } from "../lib/googleAuth.js";
import { wrapAsync } from "../lib/asyncHandler.js";
import { randomUUID } from "crypto";
import { getDefaultPermissionsForRole, resolvePermissionsForRole } from "../lib/permissions.js";
import { createInMemoryRateLimiter } from "../middleware/security.js";
import { createAccessToken, createPasswordResetToken, verifyAccessToken, verifyPasswordResetToken, verifyTeamInviteToken } from "../lib/jwt.js";
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

const signInLimiter = createInMemoryRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: "Too many sign-in attempts. Please wait a few minutes and try again.",
  key: ({ ip, body }) => {
    const email = typeof (body as { email?: unknown })?.email === "string" ? normalizeEmail((body as { email: string }).email) : "";
    return `auth:sign-in:${ip}:${email}`;
  },
});

const signUpLimiter = createInMemoryRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 6,
  message: "Too many sign-up attempts. Please wait a bit before trying again.",
  key: ({ ip, body }) => {
    const email = typeof (body as { email?: unknown })?.email === "string" ? normalizeEmail((body as { email: string }).email) : "";
    return `auth:sign-up:${ip}:${email}`;
  },
});
const forgotPasswordLimiter = createInMemoryRateLimiter({
  windowMs: 30 * 60 * 1000,
  max: 6,
  message: "Too many password reset requests. Please wait a bit before trying again.",
  key: ({ ip, body }) => {
    const email = typeof (body as { email?: unknown })?.email === "string" ? normalizeEmail((body as { email: string }).email) : "";
    return `auth:forgot-password:${ip}:${email}`;
  },
});

const resetPasswordLimiter = createInMemoryRateLimiter({
  windowMs: 30 * 60 * 1000,
  max: 12,
  message: "Too many password reset attempts. Please wait a bit before trying again.",
});

const googleOAuthStartLimiter = createInMemoryRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 30,
  message: "Too many Google sign-in attempts. Please try again shortly.",
});

const googleOAuthCallbackLimiter = createInMemoryRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 30,
  message: "Too many Google callback attempts. Please try again shortly.",
});

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
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

function resolveFrontendBaseUrl(req: Request): string {
  const configured = process.env.FRONTEND_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const origin = req.get("origin")?.trim();
  if (origin && /^https?:\/\//i.test(origin)) return origin.replace(/\/+$/, "");
  const host = req.get("host")?.trim();
  if (host) {
    const protocol = req.secure || req.get("x-forwarded-proto") === "https" ? "https" : "http";
    return `${protocol}://${host}`.replace(/\/+$/, "");
  }
  throw new BadRequestError("Password reset is not configured.");
}

function getUserIdFromAuthHeader(req: Request): string | null {
  const authHeader = req.headers.authorization ?? "";
  const bearerPrefix = "Bearer ";
  if (!authHeader.startsWith(bearerPrefix)) return null;
  const rawToken = authHeader.slice(bearerPrefix.length).trim();
  if (!rawToken) return null;
  const payload = verifyAccessToken(rawToken);
  return payload?.userId ?? null;
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
      .select({ id: businesses.id, name: businesses.name, type: businesses.type })
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
    const userId = getUserIdFromAuthHeader(req);
    if (!userId) {
      res.status(401).json({ message: "Not signed in" });
      return;
    }
    const [user] = await db
      .select({ id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName, googleProfileId: users.googleProfileId, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) {
      res.status(401).json({ message: "Not signed in" });
      return;
    }
    const token = createAccessToken(user.id);
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
    const userId = getUserIdFromAuthHeader(req);
    if (!userId) {
      res.status(401).json({ message: "Not signed in" });
      return;
    }

    try {
      const ownedBusinesses = await db
        .select({ id: businesses.id, name: businesses.name, type: businesses.type })
        .from(businesses)
        .where(eq(businesses.ownerId, userId));
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
          .where(eq(businessMemberships.userId, userId));
      } catch (error) {
        if (!isTenantSchemaDriftError(error)) throw error;
        logger.warn("business membership schema unavailable; falling back to owner-only auth context", {
          userId,
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
          permissions: Array.from(getDefaultPermissionsForRole("owner")),
        });
      }

      if (memberships.length > 0) {
        const membershipBusinessIds = memberships.map((membership) => membership.businessId).filter((id) => !byBusiness.has(id));
        const membershipBusinesses = membershipBusinessIds.length === 0
          ? []
          : await db
              .select({ id: businesses.id, name: businesses.name, type: businesses.type })
              .from(businesses)
              .where(inArray(businesses.id, membershipBusinessIds));

        const membershipBusinessMap = new Map(membershipBusinesses.map((business) => [business.id, business]));
        const permissionOverridesByBusiness = await getMembershipPermissionMap(
          userId,
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
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      res.json({ data: await buildSafeAuthContext(userId) });
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
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user || !user.passwordHash) throw new UnauthorizedError("Invalid email or password.");
    if (!ok) throw new UnauthorizedError("Invalid email or password.");
    const activatedMemberships = await activateInvitedMemberships(user.id);
    await sendActivatedMembershipEmails(req, { email: user.email, firstName: user.firstName }, activatedMemberships);
    const token = createAccessToken(user.id);
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
    const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const passwordHash = await bcrypt.hash(password, 10);
    let user:
      | {
          id: string;
          email: string;
          firstName: string | null;
          lastName: string | null;
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

      const [claimedUser] = await db.transaction(async (tx) => {
        const [updatedUser] = await tx
          .update(users)
          .set({
            passwordHash,
            firstName: firstName ?? existing.firstName ?? null,
            lastName: lastName ?? existing.lastName ?? null,
            updatedAt: new Date(),
          })
          .where(eq(users.id, existing.id))
          .returning({
            id: users.id,
            email: users.email,
            firstName: users.firstName,
            lastName: users.lastName,
            googleProfileId: users.googleProfileId,
            passwordHash: users.passwordHash,
          });

        try {
          await tx
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

        return [updatedUser];
      });

      user = claimedUser;
      await sendActivatedMembershipEmails(req, { email: claimedUser.email, firstName: claimedUser.firstName }, invitedMemberships);
      logger.info("Invited user claimed account", { userId: existing.id, email });
    } else {
      const [createdUser] = await db
        .insert(users)
        .values({
          id: randomUUID(),
          email,
          passwordHash,
          firstName: firstName ?? null,
          lastName: lastName ?? null,
        })
        .returning({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          googleProfileId: users.googleProfileId,
          passwordHash: users.passwordHash,
        });
      user = createdUser;
      logger.info("User signed up", { userId: user?.id, email: user?.email });
    }

    if (!user) throw new BadRequestError("Failed to create account.");
    const token = createAccessToken(user.id);
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
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

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
    const [user] = await db.select().from(users).where(eq(users.id, verified.userId)).limit(1);
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
    await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, user.id));
    logger.info("Password reset completed", { userId: user.id, email: user.email });
    res.json({ ok: true });
  })
);
authRouter.post("/sign-out", (_req: Request, res: Response) => {
  // JWT sign-out is handled client-side by removing the token.
  res.json({});
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
    const email = normalizeEmail(payload.email);
    const firstName = payload.given_name ?? null;
    const lastName = payload.family_name ?? null;
    // Find or create user
    const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    let user = existing as (typeof users.$inferSelect) | undefined;
    if (!user) {
      const [created] = await db
        .insert(users)
        .values({
          id: randomUUID(),
          email,
          firstName,
          lastName,
        })
        .returning();
      if (!created) throw new BadRequestError("Failed to create account from Google profile.");
      user = created;
      logger.info("User signed up via Google", { userId: user.id, email: user.email });
    } else {
      const activatedMemberships = await activateInvitedMemberships(user.id);
      await sendActivatedMembershipEmails(req, { email: user.email, firstName: user.firstName }, activatedMemberships);
      logger.info("User signed in via Google", { userId: user.id, email: user.email });
    }
    const token = createAccessToken(user.id);
    const redirectPath = resolveGoogleStateRedirect(req.query.state);
    const frontendUrl = process.env.FRONTEND_URL ?? "";
    const baseRedirect = frontendUrl ? `${frontendUrl}${redirectPath}` : redirectPath;
    const url = new URL(baseRedirect, frontendUrl || undefined);
    url.searchParams.set("token", token);
    res.redirect(url.toString());
  })
);

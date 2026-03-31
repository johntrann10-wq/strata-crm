import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "../db/index.js";
import { businessMemberships, businesses, users } from "../db/schema.js";
import { and, eq, inArray } from "drizzle-orm";
import { BadRequestError, UnauthorizedError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { googleClient } from "../lib/googleAuth.js";
import { wrapAsync } from "../lib/asyncHandler.js";
import { randomUUID } from "crypto";
import { getDefaultPermissionsForRole } from "../lib/permissions.js";
import { createInMemoryRateLimiter } from "../middleware/security.js";
const signInSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
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

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function serializeAuthUser(user: {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
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

function requireJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.trim() !== "") return secret;
  throw new Error("JWT_SECRET is required");
}
function createToken(userId: string): string {
  const secret = requireJwtSecret();
  return jwt.sign({ userId }, secret, { expiresIn: "7d" });
}
function getUserIdFromAuthHeader(req: Request): string | null {
  const authHeader = req.headers.authorization ?? "";
  const bearerPrefix = "Bearer ";
  if (!authHeader.startsWith(bearerPrefix)) return null;
  const rawToken = authHeader.slice(bearerPrefix.length).trim();
  if (!rawToken) return null;
  try {
    const payload = jwt.verify(rawToken, requireJwtSecret()) as { userId?: string };
    return payload.userId ?? null;
  } catch {
    return null;
  }
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
      .select({ id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) {
      res.status(401).json({ message: "Not signed in" });
      return;
    }
    const token = createToken(user.id);
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
            permissions: Array.from(getDefaultPermissionsForRole(membership.role)),
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
    if (!user || !user.passwordHash) throw new UnauthorizedError("Invalid email or password.");
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedError("Invalid email or password.");
    const token = createToken(user.id);
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
    const { password, firstName, lastName } = parsed.data;
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
        throw new BadRequestError("An account with this email already exists.");
      }

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
          .returning({ id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName });

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
        .returning({ id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName });
      user = createdUser;
      logger.info("User signed up", { userId: user?.id, email: user?.email });
    }

    if (!user) throw new BadRequestError("Failed to create account.");
    const token = createToken(user.id);
    res.status(201).json({
      data: {
        ...serializeAuthUser(user),
        token,
      },
    });
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
      logger.info("User signed in via Google", { userId: user.id, email: user.email });
    }
    const token = createToken(user.id);
    const redirectPath = resolveGoogleStateRedirect(req.query.state);
    const frontendUrl = process.env.FRONTEND_URL ?? "";
    const baseRedirect = frontendUrl ? `${frontendUrl}${redirectPath}` : redirectPath;
    const url = new URL(baseRedirect, frontendUrl || undefined);
    url.searchParams.set("token", token);
    res.redirect(url.toString());
  })
);

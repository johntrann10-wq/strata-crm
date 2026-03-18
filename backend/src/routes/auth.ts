import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { BadRequestError, UnauthorizedError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { googleClient } from "../lib/googleAuth.js";
import { wrapAsync } from "../lib/asyncHandler.js";
import { randomUUID } from "crypto";
const signInSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});
export const authRouter = Router();
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
    res.json(user);
  })
);
authRouter.post(
  "/sign-in",
  wrapAsync(async (req: Request, res: Response, _next: NextFunction) => {
    const parsed = signInSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");
    const { email, password } = parsed.data;
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user || !user.passwordHash) throw new UnauthorizedError("Invalid email or password.");
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedError("Invalid email or password.");
    const token = createToken(user.id);
    logger.info("User signed in", { userId: user.id, email: user.email });
    res.json({
      data: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        token,
      },
    });
  })
);
authRouter.post(
  "/sign-up",
  wrapAsync(async (req: Request, res: Response, _next: NextFunction) => {
    const parsed = signUpSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");
    const { email, password, firstName, lastName } = parsed.data;
    const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing) throw new BadRequestError("An account with this email already exists.");
    const passwordHash = await bcrypt.hash(password, 10);
    const [user] = await db
      .insert(users)
      .values({
        id: randomUUID(),
        email,
        passwordHash,
        firstName: firstName ?? null,
        lastName: lastName ?? null,
      })
      .returning({ id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName });
    if (!user) throw new BadRequestError("Failed to create account.");
    const token = createToken(user.id);
    logger.info("User signed up", { userId: user.id, email: user.email });
    res.status(201).json({
      data: {
        ...user,
        token,
      },
    });
  })
);
authRouter.post("/sign-out", (_req: Request, res: Response) => {
  // JWT sign-out is handled client-side by removing the token.
  res.json({});
});
authRouter.post("/verify-email", async (_req: Request, res: Response) => {
  const code = _req.query.code as string | undefined;
  if (!code) {
    res.status(400).json({ message: "Missing code" });
    return;
  }
  // TODO: verify code against user emailVerificationToken and set emailVerified
  res.json({ verified: true });
});
authRouter.post(
  "/forgot-password",
  wrapAsync(async (req: Request, res: Response) => {
    const parsed = z.object({ email: z.string().email() }).safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");
    // TODO: generate reset token, store, send email. For launch we always return 200 to avoid leaking account existence.
    logger.info("Forgot password requested", { email: parsed.data.email });
    res.json({ message: "If an account exists with this email, you will receive a reset link." });
  })
);
authRouter.post(
  "/reset-password",
  wrapAsync(async (req: Request, res: Response) => {
    const parsed = z
      .object({
        code: z.string().min(1),
        password: z.string().min(8),
        confirmPassword: z.string().min(1),
      })
      .refine((d) => d.password === d.confirmPassword, { message: "Passwords must match", path: ["confirmPassword"] })
      .safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");
    // TODO: verify code, find user, update password. For launch stub: return 200 (real impl would need reset tokens in DB).
    logger.info("Reset password requested", { code: parsed.data.code });
    res.json({ message: "Password has been reset. You can sign in now." });
  })
);
// ---------------------------------------------------------------------------
// Google OAuth (sign in / sign up with Google)
// ---------------------------------------------------------------------------
authRouter.get(
  "/google/start",
  wrapAsync(async (req: Request, res: Response) => {
    if (!googleClient) {
      throw new BadRequestError("Google sign-in is not configured.");
    }
    const frontendUrl = process.env.FRONTEND_URL;
    const redirectPath = frontendUrl ?? "/";
    const url = googleClient.generateAuthUrl({
      access_type: "offline",
      scope: ["openid", "email", "profile"],
      // We can pass state if we want to redirect to a specific page later.
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
    const email = payload.email;
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
    const redirectPath = (() => {
      try {
        const raw = (req.query.state as string | undefined) ?? "";
        if (!raw) return "/";
        const parsed = JSON.parse(raw) as { redirectPath?: string };
        return parsed.redirectPath ?? "/";
      } catch {
        return "/";
      }
    })();
    const frontendUrl = process.env.FRONTEND_URL ?? "";
    const baseRedirect = frontendUrl ? `${frontendUrl}${redirectPath}` : redirectPath;
    const url = new URL(baseRedirect, frontendUrl || undefined);
    url.searchParams.set("token", token);
    res.redirect(url.toString());
  })
);

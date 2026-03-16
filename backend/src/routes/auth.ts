import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { BadRequestError, UnauthorizedError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { wrapAsync } from "../lib/asyncHandler.js";

const signInSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

export const authRouter = Router();

/** GET /api/auth/me — current user from session (for frontend auth check). Returns 401 if not signed in. */
authRouter.get("/me", wrapAsync(async (req: Request, res: Response) => {
  const userId = (req.session as { userId?: string } | undefined)?.userId;
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
}));

authRouter.post("/sign-in", wrapAsync(async (req: Request, res: Response, _next: NextFunction) => {
  const parsed = signInSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");
  const { email, password } = parsed.data;

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || !user.passwordHash) throw new UnauthorizedError("Invalid email or password.");

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw new UnauthorizedError("Invalid email or password.");

  const s = req.session as { userId?: string };
  if (!s) throw new Error("Session not configured");
  s.userId = user.id;

  logger.info("User signed in", { userId: user.id, email: user.email });
  res.json({ data: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName } });
}));

authRouter.post("/sign-up", wrapAsync(async (req: Request, res: Response, _next: NextFunction) => {
  const parsed = signUpSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");
  const { email, password, firstName, lastName } = parsed.data;

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) throw new BadRequestError("An account with this email already exists.");

  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db
    .insert(users)
    .values({
      email,
      passwordHash,
      firstName: firstName ?? null,
      lastName: lastName ?? null,
    })
    .returning({ id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName });

  if (!user) throw new BadRequestError("Failed to create account.");

  const s = req.session as { userId?: string };
  if (!s) throw new Error("Session not configured");
  s.userId = user.id;

  logger.info("User signed up", { userId: user.id, email: user.email });
  res.status(201).json({ data: user });
}));

authRouter.post("/sign-out", (req: Request, res: Response) => {
  req.session?.destroy?.(() => {});
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

authRouter.post("/forgot-password", wrapAsync(async (req: Request, res: Response) => {
  const parsed = z.object({ email: z.string().email() }).safeParse(req.body);
  if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");
  // TODO: generate reset token, store, send email. For launch we always return 200 to avoid leaking account existence.
  logger.info("Forgot password requested", { email: parsed.data.email });
  res.json({ message: "If an account exists with this email, you will receive a reset link." });
}));

authRouter.post("/reset-password", wrapAsync(async (req: Request, res: Response) => {
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
}));

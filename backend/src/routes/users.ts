import { Router, Request, Response } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { NotFoundError, BadRequestError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";

export const usersRouter = Router({ mergeParams: true });

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

/** POST /api/users/change-password — authenticated user updates password. */
usersRouter.post("/change-password", requireAuth, async (req: Request, res: Response) => {
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
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new NotFoundError("User not found.");
  if (!user.passwordHash) {
    throw new BadRequestError("This account does not have a password. Sign in with Google or use forgot password.");
  }
  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) throw new BadRequestError("Current password is incorrect.");
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId));
  res.json({ ok: true });
});

usersRouter.get("/:id", requireAuth, async (req: Request, res: Response) => {
  const id = req.params.id;
  if (req.userId !== id) throw new NotFoundError("User not found.");
  const [user] = await db
    .select({ id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!user) throw new NotFoundError("User not found.");
  res.json({ ...user, googleImageUrl: null, profilePicture: null });
});

const updateSchema = z.object({ firstName: z.string().optional(), lastName: z.string().optional() });
usersRouter.patch("/:id/update", requireAuth, async (req: Request, res: Response) => {
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
    .returning({ id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName });
  if (!updated) throw new NotFoundError("User not found.");
  res.json({ ...updated, googleImageUrl: null, profilePicture: null });
});

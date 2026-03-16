import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { NotFoundError, BadRequestError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";

export const usersRouter = Router({ mergeParams: true });

usersRouter.get("/:id", requireAuth, async (req: Request, res: Response) => {
  const id = req.params.id;
  if (req.userId !== id) throw new NotFoundError("User not found.");
  const [user] = await db
    .select({ id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!user) throw new NotFoundError("User not found.");
  res.json(user);
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
  res.json(updated);
});

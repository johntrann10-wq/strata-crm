import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { businesses } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { NotFoundError, ForbiddenError, BadRequestError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";

export const businessesRouter = Router({ mergeParams: true });

const createSchema = z.object({
  name: z.string().min(1),
  type: z.enum([
    "auto_detailing", "mobile_detailing", "ppf_ceramic", "tint_shop", "mechanic",
    "tire_shop", "car_wash", "wrap_shop", "dealership_service", "body_shop", "other_auto_service",
  ]),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  staffCount: z.number().int().min(0).max(500).optional(),
  operatingHours: z.string().max(1000).optional(),
});

businessesRouter.get("/", requireAuth, async (req: Request, res: Response) => {
  if (!req.userId) throw new ForbiddenError("Not signed in.");
  let ownerId = req.userId;
  if (req.query.filter) {
    try {
      const filter = JSON.parse(String(req.query.filter)) as { owner?: { id?: { equals?: string } } };
      if (filter?.owner?.id?.equals) ownerId = filter.owner.id.equals;
    } catch {
      // ignore invalid filter
    }
  }
  if (ownerId !== req.userId) throw new ForbiddenError("Access denied.");
  const [business] = await db.select().from(businesses).where(eq(businesses.ownerId, ownerId)).limit(1);
  if (!business) {
    res.json({ records: [] });
    return;
  }
  res.json({ records: [business] });
});

businessesRouter.post("/", requireAuth, async (req: Request, res: Response) => {
  if (!req.userId) throw new ForbiddenError("Not signed in.");
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");
  const [created] = await db
    .insert(businesses)
    .values({
      ownerId: req.userId,
      name: parsed.data.name,
      type: parsed.data.type,
      email: parsed.data.email ?? null,
      phone: parsed.data.phone ?? null,
      address: parsed.data.address ?? null,
      city: parsed.data.city ?? null,
      state: parsed.data.state ?? null,
      zip: parsed.data.zip ?? null,
      staffCount: parsed.data.staffCount ?? null,
      operatingHours: parsed.data.operatingHours ?? null,
    })
    .returning();
  if (!created) throw new BadRequestError("Failed to create business.");
  res.status(201).json(created);
});

businessesRouter.post("/:id/completeOnboarding", requireAuth, async (req: Request, res: Response) => {
  const id = req.params.id;
  const [b] = await db.select().from(businesses).where(and(eq(businesses.id, id), eq(businesses.ownerId, req.userId!))).limit(1);
  if (!b) throw new NotFoundError("Business not found.");
  const [updated] = await db
    .update(businesses)
    .set({ onboardingComplete: true, updatedAt: new Date() })
    .where(eq(businesses.id, id))
    .returning();
  res.json(updated);
});

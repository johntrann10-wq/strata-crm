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
  timezone: z.string().optional(),
  currency: z.string().length(3).optional(),
  defaultTaxRate: z.coerce.number().min(0).max(100).optional(),
  appointmentBufferMinutes: z.number().int().min(0).max(1440).optional(),
});

const updateSchema = createSchema
  .partial()
  .extend({
    website: z.string().nullable().optional(),
    bio: z.string().nullable().optional(),
    instagram: z.string().nullable().optional(),
    facebook: z.string().nullable().optional(),
    googleReviewLink: z.string().nullable().optional(),
    yelpReviewLink: z.string().nullable().optional(),
    facebookReviewLink: z.string().nullable().optional(),
  })
  .strict();

function serializeBusiness(record: typeof businesses.$inferSelect) {
  return {
    ...record,
    website: null,
    bio: null,
    instagram: null,
    facebook: null,
    googleReviewLink: null,
    yelpReviewLink: null,
    facebookReviewLink: null,
    logoUrl: null,
  };
}

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
  res.json({ records: [serializeBusiness(business)] });
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
      timezone: parsed.data.timezone ?? "America/Los_Angeles",
      currency: parsed.data.currency ?? "USD",
      defaultTaxRate: parsed.data.defaultTaxRate != null ? String(parsed.data.defaultTaxRate) : "0",
      appointmentBufferMinutes: parsed.data.appointmentBufferMinutes ?? 15,
    })
    .returning();
  if (!created) throw new BadRequestError("Failed to create business.");
  res.status(201).json(serializeBusiness(created));
});

businessesRouter.get("/:id", requireAuth, async (req: Request, res: Response) => {
  if (!req.userId) throw new ForbiddenError("Not signed in.");
  const [business] = await db
    .select()
    .from(businesses)
    .where(and(eq(businesses.id, req.params.id), eq(businesses.ownerId, req.userId)))
    .limit(1);
  if (!business) throw new NotFoundError("Business not found.");
  res.json(serializeBusiness(business));
});

businessesRouter.patch("/:id", requireAuth, async (req: Request, res: Response) => {
  if (!req.userId) throw new ForbiddenError("Not signed in.");
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? "Invalid input");
  const [existing] = await db
    .select()
    .from(businesses)
    .where(and(eq(businesses.id, req.params.id), eq(businesses.ownerId, req.userId)))
    .limit(1);
  if (!existing) throw new NotFoundError("Business not found.");

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.type !== undefined) updates.type = parsed.data.type;
  if (parsed.data.email !== undefined) updates.email = parsed.data.email ?? null;
  if (parsed.data.phone !== undefined) updates.phone = parsed.data.phone ?? null;
  if (parsed.data.address !== undefined) updates.address = parsed.data.address ?? null;
  if (parsed.data.city !== undefined) updates.city = parsed.data.city ?? null;
  if (parsed.data.state !== undefined) updates.state = parsed.data.state ?? null;
  if (parsed.data.zip !== undefined) updates.zip = parsed.data.zip ?? null;
  if (parsed.data.staffCount !== undefined) updates.staffCount = parsed.data.staffCount ?? null;
  if (parsed.data.operatingHours !== undefined) updates.operatingHours = parsed.data.operatingHours ?? null;
  if (parsed.data.timezone !== undefined) updates.timezone = parsed.data.timezone ?? null;
  if (parsed.data.currency !== undefined) updates.currency = parsed.data.currency?.toUpperCase() ?? "USD";
  if (parsed.data.defaultTaxRate !== undefined) updates.defaultTaxRate = String(parsed.data.defaultTaxRate ?? 0);
  if (parsed.data.appointmentBufferMinutes !== undefined) {
    updates.appointmentBufferMinutes = parsed.data.appointmentBufferMinutes ?? 15;
  }

  const [updated] = await db
    .update(businesses)
    .set(updates)
    .where(eq(businesses.id, req.params.id))
    .returning();
  if (!updated) throw new NotFoundError("Business not found.");
  res.json(serializeBusiness(updated));
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
  if (!updated) throw new NotFoundError("Business not found.");
  res.json(serializeBusiness(updated));
});

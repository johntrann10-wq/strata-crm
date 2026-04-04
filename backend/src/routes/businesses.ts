import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { businessMemberships, businesses } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { NotFoundError, ForbiddenError, BadRequestError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { randomUUID } from "crypto";
import { getBusinessTypeDefaults } from "../lib/businessTypeDefaults.js";
import { roleHasPermission } from "../lib/permissions.js";
import { warnOnce } from "../lib/warnOnce.js";
import { wrapAsync } from "../lib/asyncHandler.js";

export const businessesRouter = Router({ mergeParams: true });
type BusinessRecord = typeof businesses.$inferSelect;

const createSchema = z.object({
  name: z.string().min(1),
  type: z.enum([
    "auto_detailing",
    "mobile_detailing",
    "wrap_ppf",
    "window_tinting",
    "performance",
    "mechanic",
    "tire_shop",
    "muffler_shop",
  ]),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  zip: z.string().nullable().optional(),
  staffCount: z.number().int().min(0).max(500).nullable().optional(),
  operatingHours: z.string().max(1000).nullable().optional(),
  timezone: z.string().nullable().optional(),
  currency: z.string().length(3).nullable().optional(),
  defaultTaxRate: z.coerce.number().min(0).max(100).optional(),
  defaultAdminFee: z.coerce.number().min(0).max(100).optional(),
  defaultAdminFeeEnabled: z.boolean().optional(),
  appointmentBufferMinutes: z.number().int().min(0).max(1440).optional(),
  calendarBlockCapacityPerSlot: z.number().int().min(1).max(12).optional(),
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

function coerceBusinessRecord(
  record: Pick<BusinessRecord, "id" | "ownerId" | "name" | "type"> &
    Partial<BusinessRecord>
): BusinessRecord {
  return {
    id: record.id,
    ownerId: record.ownerId,
    name: record.name,
    type: record.type,
    email: record.email ?? null,
    phone: record.phone ?? null,
    address: record.address ?? null,
    city: record.city ?? null,
    state: record.state ?? null,
    zip: record.zip ?? null,
    timezone: record.timezone ?? "America/Los_Angeles",
    currency: record.currency ?? "USD",
    defaultTaxRate: record.defaultTaxRate ?? "0",
    defaultAdminFee: record.defaultAdminFee ?? "0",
    defaultAdminFeeEnabled: record.defaultAdminFeeEnabled ?? false,
    appointmentBufferMinutes: record.appointmentBufferMinutes ?? 15,
    calendarBlockCapacityPerSlot: record.calendarBlockCapacityPerSlot ?? 1,
    nextInvoiceNumber: record.nextInvoiceNumber ?? 1,
    onboardingComplete: record.onboardingComplete ?? null,
    staffCount: record.staffCount ?? null,
    operatingHours: record.operatingHours ?? null,
    stripeCustomerId: record.stripeCustomerId ?? null,
    stripeSubscriptionId: record.stripeSubscriptionId ?? null,
    subscriptionStatus: record.subscriptionStatus ?? null,
    trialEndsAt: record.trialEndsAt ?? null,
    currentPeriodEnd: record.currentPeriodEnd ?? null,
    stripeConnectAccountId: record.stripeConnectAccountId ?? null,
    stripeConnectDetailsSubmitted: record.stripeConnectDetailsSubmitted ?? false,
    stripeConnectChargesEnabled: record.stripeConnectChargesEnabled ?? false,
    stripeConnectPayoutsEnabled: record.stripeConnectPayoutsEnabled ?? false,
    stripeConnectOnboardedAt: record.stripeConnectOnboardedAt ?? null,
    createdAt: record.createdAt ?? new Date(),
    updatedAt: record.updatedAt ?? new Date(),
  };
}

function serializeBusiness(record: BusinessRecord) {
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

function canAccessBusiness(
  req: Request,
  business: Pick<typeof businesses.$inferSelect, "id" | "ownerId">,
  permission?: "settings.read" | "settings.write"
): boolean {
  if (req.userId && business.ownerId === req.userId) return true;
  if (!req.businessId || req.businessId !== business.id || !req.membershipRole) return false;
  return permission ? roleHasPermission(req.membershipRole, permission) : true;
}

function isBusinessSchemaDriftError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown; cause?: unknown };
  const cause =
    candidate.cause && typeof candidate.cause === "object"
      ? (candidate.cause as { code?: unknown; message?: unknown })
      : candidate;
  const code = String(cause.code ?? "");
  const message = String(cause.message ?? "").toLowerCase();
  return code === "42P01" || code === "42703" || message.includes("does not exist");
}

async function loadBusinessById(id: string): Promise<BusinessRecord | null> {
  try {
    const [business] = await db.select().from(businesses).where(eq(businesses.id, id)).limit(1);
    return business ?? null;
  } catch (error) {
    if (!isBusinessSchemaDriftError(error)) throw error;
    warnOnce("businesses:get:schema", "business read falling back without full schema", {
      businessId: id,
      error: error instanceof Error ? error.message : String(error),
    });
    const [legacyBusiness] = await db
      .select({
        id: businesses.id,
        ownerId: businesses.ownerId,
        name: businesses.name,
        type: businesses.type,
        email: businesses.email,
        phone: businesses.phone,
        address: businesses.address,
        city: businesses.city,
        state: businesses.state,
        zip: businesses.zip,
        staffCount: businesses.staffCount,
        operatingHours: businesses.operatingHours,
        createdAt: businesses.createdAt,
      })
      .from(businesses)
      .where(eq(businesses.id, id))
      .limit(1);
    return legacyBusiness ? coerceBusinessRecord(legacyBusiness) : null;
  }
}

async function loadBusinessByOwner(ownerId: string): Promise<BusinessRecord | null> {
  try {
    const [business] = await db.select().from(businesses).where(eq(businesses.ownerId, ownerId)).limit(1);
    return business ?? null;
  } catch (error) {
    if (!isBusinessSchemaDriftError(error)) throw error;
    warnOnce("businesses:list:schema", "business list falling back without full schema", {
      ownerId,
      error: error instanceof Error ? error.message : String(error),
    });
    const [legacyBusiness] = await db
      .select({
        id: businesses.id,
        ownerId: businesses.ownerId,
        name: businesses.name,
        type: businesses.type,
        email: businesses.email,
        phone: businesses.phone,
        address: businesses.address,
        city: businesses.city,
        state: businesses.state,
        zip: businesses.zip,
        staffCount: businesses.staffCount,
        operatingHours: businesses.operatingHours,
        createdAt: businesses.createdAt,
      })
      .from(businesses)
      .where(eq(businesses.ownerId, ownerId))
      .limit(1);
    return legacyBusiness ? coerceBusinessRecord(legacyBusiness) : null;
  }
}

businessesRouter.get("/", requireAuth, wrapAsync(async (req: Request, res: Response) => {
  if (!req.userId) throw new ForbiddenError("Not signed in.");
  if (req.businessId) {
    if (!req.membershipRole || !roleHasPermission(req.membershipRole, "settings.read")) {
      throw new ForbiddenError("You do not have permission to perform this action.");
    }
    const currentBusiness = await loadBusinessById(req.businessId);
    res.json({ records: currentBusiness ? [serializeBusiness(currentBusiness)] : [] });
    return;
  }
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
  const business = await loadBusinessByOwner(ownerId);
  if (!business) {
    res.json({ records: [] });
    return;
  }
  res.json({ records: [serializeBusiness(business)] });
}));

businessesRouter.post("/", requireAuth, wrapAsync(async (req: Request, res: Response) => {
  if (!req.userId) throw new ForbiddenError("Not signed in.");
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");
  const typeDefaults = getBusinessTypeDefaults(parsed.data.type);
  const businessId = randomUUID();
  const membershipId = randomUUID();
  const [created] = await db
    .insert(businesses)
    .values({
      id: businessId,
      ownerId: req.userId!,
      name: parsed.data.name,
      type: parsed.data.type,
      email: parsed.data.email ?? null,
      phone: parsed.data.phone ?? null,
      address: parsed.data.address ?? null,
      city: parsed.data.city ?? null,
      state: parsed.data.state ?? null,
      zip: parsed.data.zip ?? null,
      staffCount: parsed.data.staffCount ?? typeDefaults.defaultStaffCount,
      operatingHours: parsed.data.operatingHours ?? typeDefaults.operatingHours,
      timezone: parsed.data.timezone ?? typeDefaults.timezone,
      currency: parsed.data.currency ?? typeDefaults.currency,
      defaultTaxRate:
        parsed.data.defaultTaxRate != null ? String(parsed.data.defaultTaxRate) : String(typeDefaults.defaultTaxRate),
      defaultAdminFee: String(parsed.data.defaultAdminFee ?? 0),
      defaultAdminFeeEnabled: parsed.data.defaultAdminFeeEnabled ?? false,
      appointmentBufferMinutes:
        parsed.data.appointmentBufferMinutes ?? typeDefaults.appointmentBufferMinutes,
      calendarBlockCapacityPerSlot:
        parsed.data.calendarBlockCapacityPerSlot ?? typeDefaults.calendarBlockCapacityPerSlot,
    })
    .returning();
  if (!created) throw new BadRequestError("Failed to create business.");

  // Legacy production schemas can be missing business_memberships entirely.
  // Keep business creation durable and treat membership creation as best-effort.
  try {
    await db.insert(businessMemberships).values({
      id: membershipId,
      businessId,
      userId: req.userId!,
      role: "owner",
      status: "active",
      isDefault: true,
      joinedAt: new Date(),
    });
  } catch (error) {
    if (!isBusinessSchemaDriftError(error)) throw error;
    warnOnce("businesses:create:membership-schema", "business membership schema unavailable during business create", {
      userId: req.userId,
      businessId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  res.status(201).json(serializeBusiness(created));
}));

businessesRouter.get("/:id", requireAuth, wrapAsync(async (req: Request, res: Response) => {
  if (!req.userId) throw new ForbiddenError("Not signed in.");
  const business = await loadBusinessById(req.params.id);
  if (!business) throw new NotFoundError("Business not found.");
  if (!canAccessBusiness(req, business, "settings.read")) {
    throw new ForbiddenError("You do not have permission to perform this action.");
  }
  res.json(serializeBusiness(business));
}));

businessesRouter.patch("/:id", requireAuth, wrapAsync(async (req: Request, res: Response) => {
  if (!req.userId) throw new ForbiddenError("Not signed in.");
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? "Invalid input");
  const existing = await loadBusinessById(req.params.id);
  if (!existing) throw new NotFoundError("Business not found.");
  if (!canAccessBusiness(req, existing, "settings.write")) {
    throw new ForbiddenError("You do not have permission to perform this action.");
  }

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
  if (parsed.data.defaultAdminFee !== undefined) updates.defaultAdminFee = String(parsed.data.defaultAdminFee ?? 0);
  if (parsed.data.defaultAdminFeeEnabled !== undefined) {
    updates.defaultAdminFeeEnabled = parsed.data.defaultAdminFeeEnabled ?? false;
  }
  if (parsed.data.appointmentBufferMinutes !== undefined) {
    updates.appointmentBufferMinutes = parsed.data.appointmentBufferMinutes ?? 15;
  }
  if (parsed.data.calendarBlockCapacityPerSlot !== undefined) {
    updates.calendarBlockCapacityPerSlot = parsed.data.calendarBlockCapacityPerSlot ?? 1;
  }

  let updated: BusinessRecord | undefined;
  try {
    [updated] = await db
      .update(businesses)
      .set(updates)
      .where(eq(businesses.id, req.params.id))
      .returning();
  } catch (error) {
    if (!isBusinessSchemaDriftError(error)) throw error;
    warnOnce("businesses:update:schema", "business update falling back without full schema", {
      businessId: req.params.id,
      userId: req.userId,
      error: error instanceof Error ? error.message : String(error),
    });
    const legacyUpdates: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) legacyUpdates.name = parsed.data.name;
    if (parsed.data.type !== undefined) legacyUpdates.type = parsed.data.type;
    if (parsed.data.email !== undefined) legacyUpdates.email = parsed.data.email ?? null;
    if (parsed.data.phone !== undefined) legacyUpdates.phone = parsed.data.phone ?? null;
    if (parsed.data.address !== undefined) legacyUpdates.address = parsed.data.address ?? null;
    if (parsed.data.city !== undefined) legacyUpdates.city = parsed.data.city ?? null;
    if (parsed.data.state !== undefined) legacyUpdates.state = parsed.data.state ?? null;
    if (parsed.data.zip !== undefined) legacyUpdates.zip = parsed.data.zip ?? null;
    if (parsed.data.staffCount !== undefined) legacyUpdates.staffCount = parsed.data.staffCount ?? null;
    if (parsed.data.operatingHours !== undefined) legacyUpdates.operatingHours = parsed.data.operatingHours ?? null;

    const [legacyUpdated] = await db
      .update(businesses)
      .set(legacyUpdates)
      .where(eq(businesses.id, req.params.id))
      .returning({
        id: businesses.id,
        ownerId: businesses.ownerId,
        name: businesses.name,
        type: businesses.type,
        email: businesses.email,
        phone: businesses.phone,
        address: businesses.address,
        city: businesses.city,
        state: businesses.state,
        zip: businesses.zip,
        staffCount: businesses.staffCount,
        operatingHours: businesses.operatingHours,
        createdAt: businesses.createdAt,
      });
    updated = legacyUpdated ? coerceBusinessRecord(legacyUpdated) : undefined;
  }
  if (!updated) throw new NotFoundError("Business not found.");
  res.json(serializeBusiness(updated));
}));

businessesRouter.post("/:id/completeOnboarding", requireAuth, wrapAsync(async (req: Request, res: Response) => {
  const id = req.params.id;
  const b = await loadBusinessById(id);
  if (!b) throw new NotFoundError("Business not found.");
  if (!canAccessBusiness(req, b, "settings.write")) {
    throw new ForbiddenError("You do not have permission to perform this action.");
  }
  let updated: typeof businesses.$inferSelect | undefined;
  try {
    [updated] = await db
      .update(businesses)
      .set({ onboardingComplete: true, updatedAt: new Date() })
      .where(eq(businesses.id, id))
      .returning();
  } catch (error) {
    if (!isBusinessSchemaDriftError(error)) throw error;
    warnOnce(
      "businesses:complete-onboarding:schema",
      "business completeOnboarding falling back without full schema",
      {
        businessId: id,
        userId: req.userId,
        error: error instanceof Error ? error.message : String(error),
      }
    );
    updated = {
      ...b,
      onboardingComplete: true,
      updatedAt: new Date(),
    };
  }
  if (!updated) throw new NotFoundError("Business not found.");
  res.json(serializeBusiness(updated));
}));

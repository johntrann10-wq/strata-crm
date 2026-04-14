import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { locations, appointments } from "../db/schema.js";
import { eq, and, asc } from "drizzle-orm";
import { NotFoundError, ForbiddenError, BadRequestError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { requireTenant } from "../middleware/tenant.js";
import { logger } from "../lib/logger.js";
import { warnOnce } from "../lib/warnOnce.js";

export const locationsRouter = Router({ mergeParams: true });

function businessId(req: Request): string {
  if (!req.businessId) throw new ForbiddenError("No business.");
  return req.businessId;
}

const createSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  timezone: z.string().optional().nullable(),
  active: z.boolean().optional(),
});

const updateSchema = createSchema.partial();

function isLocationSchemaDriftError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const cause = "cause" in error ? (error as { cause?: unknown }).cause : error;
  if (!cause || typeof cause !== "object") return false;
  const code = (cause as { code?: string }).code;
  const message = String((cause as { message?: string }).message ?? "").toLowerCase();
  return code === "42P01" || code === "42703" || message.includes("does not exist");
}

type LocationRecord = {
  id: string;
  businessId: string;
  name: string;
  address: string | null;
  phone: string | null;
  timezone: string | null;
  active: boolean | null;
  createdAt: Date;
  updatedAt: Date;
};

const legacyLocationSelection = {
  id: locations.id,
  businessId: locations.businessId,
  name: locations.name,
  address: locations.address,
  createdAt: locations.createdAt,
  updatedAt: locations.updatedAt,
};

const baseLocationSelection = {
  ...legacyLocationSelection,
  active: locations.active,
};

const timezoneLocationSelection = {
  ...baseLocationSelection,
  timezone: locations.timezone,
};

const fullLocationSelection = {
  ...timezoneLocationSelection,
  phone: locations.phone,
};

function withMissingFields<T extends Omit<LocationRecord, "phone" | "timezone" | "active">>(
  row: T,
  extras?: Partial<Pick<LocationRecord, "phone" | "timezone" | "active">>
): LocationRecord {
  return {
    ...row,
    phone: extras?.phone ?? null,
    timezone: extras?.timezone ?? null,
    active: extras?.active ?? true,
  };
}

async function listLocationsForBusiness(bid: string): Promise<LocationRecord[]> {
  try {
    return await db
      .select(fullLocationSelection)
      .from(locations)
      .where(eq(locations.businessId, bid))
      .orderBy(asc(locations.name));
  } catch (error) {
    if (!isLocationSchemaDriftError(error)) throw error;
    warnOnce("locations:list:full-schema", "locations list falling back without full schema", {
      businessId: bid,
      error: error instanceof Error ? error.message : String(error),
    });
    try {
      const rows = await db
        .select(timezoneLocationSelection)
        .from(locations)
        .where(eq(locations.businessId, bid))
        .orderBy(asc(locations.name));
      return rows.map((row) => withMissingFields(row, { timezone: row.timezone }));
    } catch (innerError) {
      if (!isLocationSchemaDriftError(innerError)) throw innerError;
      warnOnce("locations:list:timezone", "locations list falling back without timezone column", {
        businessId: bid,
        error: innerError instanceof Error ? innerError.message : String(innerError),
      });
      try {
        const rows = await db
          .select(baseLocationSelection)
          .from(locations)
          .where(eq(locations.businessId, bid))
          .orderBy(asc(locations.name));
        return rows.map((row) => withMissingFields(row, { active: row.active }));
      } catch (legacyError) {
        if (!isLocationSchemaDriftError(legacyError)) throw legacyError;
        warnOnce("locations:list:active", "locations list falling back without active column", {
          businessId: bid,
          error: legacyError instanceof Error ? legacyError.message : String(legacyError),
        });
        const rows = await db
          .select(legacyLocationSelection)
          .from(locations)
          .where(eq(locations.businessId, bid))
          .orderBy(asc(locations.name));
        return rows.map((row) => withMissingFields(row));
      }
    }
  }
}

async function getLocationForBusiness(bid: string, id: string): Promise<LocationRecord | null> {
  try {
    const [row] = await db
      .select(fullLocationSelection)
      .from(locations)
      .where(and(eq(locations.id, id), eq(locations.businessId, bid)))
      .limit(1);
    return row ?? null;
  } catch (error) {
    if (!isLocationSchemaDriftError(error)) throw error;
    warnOnce("locations:lookup:full-schema", "location lookup falling back without full schema", {
      businessId: bid,
      locationId: id,
      error: error instanceof Error ? error.message : String(error),
    });
    try {
      const [row] = await db
        .select(timezoneLocationSelection)
        .from(locations)
        .where(and(eq(locations.id, id), eq(locations.businessId, bid)))
        .limit(1);
      return row ? withMissingFields(row, { timezone: row.timezone }) : null;
    } catch (innerError) {
      if (!isLocationSchemaDriftError(innerError)) throw innerError;
      warnOnce("locations:lookup:timezone", "location lookup falling back without timezone column", {
        businessId: bid,
        locationId: id,
        error: innerError instanceof Error ? innerError.message : String(innerError),
      });
      try {
        const [row] = await db
          .select(baseLocationSelection)
          .from(locations)
          .where(and(eq(locations.id, id), eq(locations.businessId, bid)))
          .limit(1);
        return row ? withMissingFields(row, { active: row.active }) : null;
      } catch (legacyError) {
        if (!isLocationSchemaDriftError(legacyError)) throw legacyError;
        warnOnce("locations:lookup:active", "location lookup falling back without active column", {
          businessId: bid,
          locationId: id,
          error: legacyError instanceof Error ? legacyError.message : String(legacyError),
        });
        const [row] = await db
          .select(legacyLocationSelection)
          .from(locations)
          .where(and(eq(locations.id, id), eq(locations.businessId, bid)))
          .limit(1);
        return row ? withMissingFields(row) : null;
      }
    }
  }
}

locationsRouter.get("/", requireAuth, requireTenant, requirePermission("settings.read"), async (req: Request, res: Response) => {
  const list = await listLocationsForBusiness(businessId(req));
  res.json({ records: list });
});

locationsRouter.get("/:id", requireAuth, requireTenant, requirePermission("settings.read"), async (req: Request, res: Response) => {
  const bid = businessId(req);
  const row = await getLocationForBusiness(bid, req.params.id);
  if (!row) throw new NotFoundError("Location not found.");
  res.json(row);
});

locationsRouter.post("/", requireAuth, requireTenant, requirePermission("settings.write"), async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? "Invalid input");
  const bid = businessId(req);
  let createdId: string | null = null;
  try {
    const [created] = await db
      .insert(locations)
      .values({
        businessId: bid,
        name: parsed.data.name,
        address: parsed.data.address ?? null,
        phone: parsed.data.phone ?? null,
        timezone: parsed.data.timezone ?? null,
        active: parsed.data.active ?? true,
      })
      .returning({ id: locations.id });
    createdId = created?.id ?? null;
  } catch (error) {
    if (!isLocationSchemaDriftError(error)) throw error;
    warnOnce("locations:create:phone", "location create falling back without phone column", {
      businessId: bid,
      error: error instanceof Error ? error.message : String(error),
    });
    try {
      const [created] = await db
        .insert(locations)
        .values({
          businessId: bid,
          name: parsed.data.name,
          address: parsed.data.address ?? null,
          timezone: parsed.data.timezone ?? null,
          active: parsed.data.active ?? true,
        })
        .returning({ id: locations.id });
      createdId = created?.id ?? null;
    } catch (innerError) {
      if (!isLocationSchemaDriftError(innerError)) throw innerError;
      warnOnce("locations:create:legacy", "location create falling back without timezone/active columns", {
        businessId: bid,
        error: innerError instanceof Error ? innerError.message : String(innerError),
      });
      const [created] = await db
        .insert(locations)
        .values({
          businessId: bid,
          name: parsed.data.name,
          address: parsed.data.address ?? null,
        })
        .returning({ id: locations.id });
      createdId = created?.id ?? null;
    }
  }
  if (!createdId) throw new BadRequestError("Failed to create location.");
  const created = await getLocationForBusiness(bid, createdId);
  if (!created) throw new BadRequestError("Failed to load created location.");
  res.status(201).json(created);
});

locationsRouter.patch("/:id", requireAuth, requireTenant, requirePermission("settings.write"), async (req: Request, res: Response) => {
  const bid = businessId(req);
  const existing = await getLocationForBusiness(bid, req.params.id);
  if (!existing) throw new NotFoundError("Location not found.");
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? "Invalid input");
  const data = parsed.data;
  const fullUpdateData = {
    ...(data.name !== undefined ? { name: data.name } : {}),
    ...(data.address !== undefined ? { address: data.address } : {}),
    ...(data.phone !== undefined ? { phone: data.phone } : {}),
    ...(data.timezone !== undefined ? { timezone: data.timezone } : {}),
    ...(data.active !== undefined ? { active: data.active } : {}),
    updatedAt: new Date(),
  };
  try {
    await db
      .update(locations)
      .set(fullUpdateData)
      .where(and(eq(locations.id, req.params.id), eq(locations.businessId, bid)));
  } catch (error) {
    if (!isLocationSchemaDriftError(error)) throw error;
    logger.warn("location update falling back without phone column", {
      businessId: bid,
      locationId: req.params.id,
      error: error instanceof Error ? error.message : String(error),
    });
    try {
      await db
        .update(locations)
        .set({
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.address !== undefined ? { address: data.address } : {}),
          ...(data.timezone !== undefined ? { timezone: data.timezone } : {}),
          ...(data.active !== undefined ? { active: data.active } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(locations.id, req.params.id), eq(locations.businessId, bid)));
    } catch (innerError) {
      if (!isLocationSchemaDriftError(innerError)) throw innerError;
      logger.warn("location update falling back without timezone/active columns", {
        businessId: bid,
        locationId: req.params.id,
        error: innerError instanceof Error ? innerError.message : String(innerError),
      });
      await db
        .update(locations)
        .set({
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.address !== undefined ? { address: data.address } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(locations.id, req.params.id), eq(locations.businessId, bid)));
    }
  }
  const updated = await getLocationForBusiness(bid, req.params.id);
  res.json(updated);
});

locationsRouter.delete("/:id", requireAuth, requireTenant, requirePermission("settings.write"), async (req: Request, res: Response) => {
  const bid = businessId(req);
  const id = req.params.id;
  const existing = await getLocationForBusiness(bid, id);
  if (!existing) throw new NotFoundError("Location not found.");

  await db.transaction(async (tx) => {
    await tx
      .update(appointments)
      .set({ locationId: null, updatedAt: new Date() })
      .where(and(eq(appointments.businessId, bid), eq(appointments.locationId, id)));
    await tx.delete(locations).where(and(eq(locations.id, id), eq(locations.businessId, bid)));
  });
  res.json(existing);
});

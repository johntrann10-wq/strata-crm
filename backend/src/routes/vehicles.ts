import { randomUUID } from "crypto";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { clients, vehicles } from "../db/schema.js";
import { wrapAsync } from "../lib/asyncHandler.js";
import { createRequestActivityLog } from "../lib/activity.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { buildVehicleDisplayName } from "../lib/vehicleFormatting.js";
import { warnOnce } from "../lib/warnOnce.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";

export const vehiclesRouter = Router({ mergeParams: true });

function businessId(req: Request): string {
  if (!req.businessId) throw new ForbiddenError("No business.");
  return req.businessId;
}

function nullableCreateString() {
  return z.preprocess((value) => (value === "" ? undefined : value), z.string().trim().min(1).optional());
}

function nullablePatchString() {
  return z.preprocess((value) => (value === "" ? null : value), z.string().trim().min(1).nullable().optional());
}

const createSchema = z.object({
  clientId: z.string().uuid(),
  make: z.string().trim().min(1),
  model: z.string().trim().min(1),
  year: z.coerce.number().int().min(1900).max(2100).nullable().optional(),
  trim: nullableCreateString(),
  bodyStyle: nullableCreateString(),
  engine: nullableCreateString(),
  color: nullableCreateString(),
  licensePlate: nullableCreateString(),
  vin: nullableCreateString(),
  displayName: nullableCreateString(),
  source: nullableCreateString(),
  sourceVehicleId: nullableCreateString(),
  mileage: z.coerce.number().int().min(0).nullable().optional(),
  notes: z.preprocess((value) => (value === "" ? undefined : value), z.string().optional()),
});

const patchSchema = z
  .object({
    make: z.string().trim().min(1).optional(),
    model: z.string().trim().min(1).optional(),
    year: z.coerce.number().int().min(1900).max(2100).nullable().optional(),
    trim: nullablePatchString(),
    bodyStyle: nullablePatchString(),
    engine: nullablePatchString(),
    color: nullablePatchString(),
    licensePlate: nullablePatchString(),
    vin: nullablePatchString(),
    displayName: nullablePatchString(),
    source: nullablePatchString(),
    sourceVehicleId: nullablePatchString(),
    mileage: z.coerce.number().int().min(0).nullable().optional(),
    notes: z.preprocess((value) => (value === "" ? null : value), z.string().nullable().optional()),
  })
  .strict();

type VehicleRecord = {
  id: string;
  businessId: string;
  clientId: string;
  make: string;
  model: string;
  year: number | null;
  trim: string | null;
  bodyStyle: string | null;
  engine: string | null;
  color: string | null;
  licensePlate: string | null;
  vin: string | null;
  displayName: string;
  source: string | null;
  sourceVehicleId: string | null;
  mileage: number | null;
  notes: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const legacyVehicleSelection = {
  id: vehicles.id,
  businessId: vehicles.businessId,
  clientId: vehicles.clientId,
  make: vehicles.make,
  model: vehicles.model,
  year: vehicles.year,
  color: vehicles.color,
  licensePlate: vehicles.licensePlate,
  vin: vehicles.vin,
  mileage: vehicles.mileage,
  notes: vehicles.notes,
  deletedAt: vehicles.deletedAt,
  createdAt: vehicles.createdAt,
  updatedAt: vehicles.updatedAt,
};

const fullVehicleSelection = {
  ...legacyVehicleSelection,
  trim: vehicles.trim,
  bodyStyle: vehicles.bodyStyle,
  engine: vehicles.engine,
  displayName: vehicles.displayName,
  source: vehicles.source,
  sourceVehicleId: vehicles.sourceVehicleId,
};

let cachedVehicleColumns: Set<string> | null = null;

async function getVehicleColumns(): Promise<Set<string>> {
  if (cachedVehicleColumns) return cachedVehicleColumns;
  const result = await db.execute(sql`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'vehicles'
  `);
  const rows = (result as { rows?: Array<{ column_name?: string }> }).rows ?? [];
  cachedVehicleColumns = new Set(
    rows
      .map((row) => row?.column_name)
      .filter((value): value is string => typeof value === "string")
  );
  return cachedVehicleColumns;
}

function isVehicleSchemaDriftError(error: unknown): boolean {
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

type VehicleRecordInput = Pick<
  VehicleRecord,
  | "id"
  | "businessId"
  | "clientId"
  | "make"
  | "model"
  | "year"
  | "color"
  | "licensePlate"
  | "vin"
  | "mileage"
  | "notes"
  | "deletedAt"
  | "createdAt"
  | "updatedAt"
> &
  {
    trim?: string | null;
    bodyStyle?: string | null;
    engine?: string | null;
    displayName?: string | null;
    source?: string | null;
    sourceVehicleId?: string | null;
  };

function normalizeVehicleRecord(row: VehicleRecordInput): VehicleRecord {
  return {
    ...row,
    trim: row.trim ?? null,
    bodyStyle: row.bodyStyle ?? null,
    engine: row.engine ?? null,
    source: row.source ?? null,
    sourceVehicleId: row.sourceVehicleId ?? null,
    displayName:
      row.displayName?.trim() ||
      buildVehicleDisplayName({
        year: row.year,
        make: row.make,
        model: row.model,
        trim: row.trim,
        bodyStyle: row.bodyStyle,
        engine: row.engine,
      }),
  };
}

function withMissingVehicleFields(row: VehicleRecordInput): VehicleRecord {
  return normalizeVehicleRecord({
    ...row,
    trim: row.trim ?? null,
    bodyStyle: row.bodyStyle ?? null,
    engine: row.engine ?? null,
    source: row.source ?? null,
    sourceVehicleId: row.sourceVehicleId ?? null,
    displayName: row.displayName ?? null,
  });
}

type VehicleWriteInput = z.infer<typeof createSchema> | z.infer<typeof patchSchema>;

function buildStoredDisplayName(input: VehicleWriteInput): string {
  return (
    ("displayName" in input ? input.displayName : undefined)?.trim() ||
    buildVehicleDisplayName({
      year: "year" in input ? input.year ?? null : null,
      make: "make" in input ? input.make ?? null : null,
      model: "model" in input ? input.model ?? null : null,
      trim: "trim" in input ? input.trim ?? null : null,
      bodyStyle: "bodyStyle" in input ? input.bodyStyle ?? null : null,
      engine: "engine" in input ? input.engine ?? null : null,
    })
  );
}

async function insertLegacyVehicleRecord(
  bid: string,
  body: z.infer<typeof createSchema>
): Promise<string | null> {
  const columns = await getVehicleColumns();
  const insertColumns = ["id", "business_id", "client_id", "make", "model"];
  const now = new Date();
  const vehicleId = randomUUID();
  const insertValues: unknown[] = [vehicleId, bid, body.clientId, body.make, body.model];

  if (columns.has("year")) {
    insertColumns.push("year");
    insertValues.push(body.year ?? null);
  }
  if (columns.has("trim")) {
    insertColumns.push("trim");
    insertValues.push(body.trim ?? null);
  }
  if (columns.has("body_style")) {
    insertColumns.push("body_style");
    insertValues.push(body.bodyStyle ?? null);
  }
  if (columns.has("engine")) {
    insertColumns.push("engine");
    insertValues.push(body.engine ?? null);
  }
  if (columns.has("color")) {
    insertColumns.push("color");
    insertValues.push(body.color ?? null);
  }
  if (columns.has("license_plate")) {
    insertColumns.push("license_plate");
    insertValues.push(body.licensePlate ?? null);
  }
  if (columns.has("vin")) {
    insertColumns.push("vin");
    insertValues.push(body.vin ?? null);
  }
  if (columns.has("display_name")) {
    insertColumns.push("display_name");
    insertValues.push(buildStoredDisplayName(body));
  }
  if (columns.has("source")) {
    insertColumns.push("source");
    insertValues.push(body.source ?? "manual");
  }
  if (columns.has("source_vehicle_id")) {
    insertColumns.push("source_vehicle_id");
    insertValues.push(body.sourceVehicleId ?? null);
  }
  if (columns.has("mileage")) {
    insertColumns.push("mileage");
    insertValues.push(body.mileage ?? null);
  }
  if (columns.has("notes")) {
    insertColumns.push("notes");
    insertValues.push(body.notes ?? null);
  }
  if (columns.has("created_at")) {
    insertColumns.push("created_at");
    insertValues.push(now);
  }
  if (columns.has("updated_at")) {
    insertColumns.push("updated_at");
    insertValues.push(now);
  }

  const query = sql`insert into "vehicles" (${sql.join(
    insertColumns.map((column) => sql.raw(`"${column}"`)),
    sql`, `
  )}) values (${sql.join(insertValues.map((value) => sql`${value}`), sql`, `)}) returning "id"`;
  const result = await db.execute(query);
  const rows = (result as { rows?: Array<{ id?: string }> }).rows ?? [];
  return rows[0]?.id ?? null;
}

async function loadVehicleRecordById(vehicleId: string, bid: string): Promise<VehicleRecord | null> {
  try {
    const [row] = await db
      .select(fullVehicleSelection)
      .from(vehicles)
      .where(and(eq(vehicles.id, vehicleId), eq(vehicles.businessId, bid)))
      .limit(1);
    return row ? normalizeVehicleRecord(row) : null;
  } catch (error) {
    if (!isVehicleSchemaDriftError(error)) throw error;
    warnOnce("vehicles:load:full-schema", "vehicle load falling back without structured schema", {
      businessId: bid,
      vehicleId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const [row] = await db
    .select(legacyVehicleSelection)
    .from(vehicles)
    .where(and(eq(vehicles.id, vehicleId), eq(vehicles.businessId, bid)))
    .limit(1);
  return row ? withMissingVehicleFields(row) : null;
}

async function updateLegacyVehicleRecord(id: string, patch: z.infer<typeof patchSchema>): Promise<void> {
  const columns = await getVehicleColumns();
  const updateColumns: string[] = [];
  const updateValues: unknown[] = [];
  const push = (column: string, value: unknown) => {
    if (!columns.has(column)) return;
    updateColumns.push(column);
    updateValues.push(value);
  };

  if (patch.make !== undefined) push("make", patch.make);
  if (patch.model !== undefined) push("model", patch.model);
  if (patch.year !== undefined) push("year", patch.year ?? null);
  if (patch.trim !== undefined) push("trim", patch.trim ?? null);
  if (patch.bodyStyle !== undefined) push("body_style", patch.bodyStyle ?? null);
  if (patch.engine !== undefined) push("engine", patch.engine ?? null);
  if (patch.color !== undefined) push("color", patch.color ?? null);
  if (patch.licensePlate !== undefined) push("license_plate", patch.licensePlate ?? null);
  if (patch.vin !== undefined) push("vin", patch.vin ?? null);
  if (patch.source !== undefined) push("source", patch.source ?? null);
  if (patch.sourceVehicleId !== undefined) push("source_vehicle_id", patch.sourceVehicleId ?? null);
  if (patch.mileage !== undefined) push("mileage", patch.mileage ?? null);
  if (patch.notes !== undefined) push("notes", patch.notes ?? null);

  const displayNameInput = {
    ...patch,
  };
  if (patch.displayName !== undefined || patch.make !== undefined || patch.model !== undefined || patch.year !== undefined || patch.trim !== undefined || patch.bodyStyle !== undefined || patch.engine !== undefined) {
    push("display_name", buildStoredDisplayName(displayNameInput));
  }
  push("updated_at", new Date());

  if (updateColumns.length === 0) return;

  const assignments = updateColumns.map((column, index) => sql`${sql.raw(`"${column}"`)} = ${updateValues[index]}`);
  await db.execute(sql`update "vehicles" set ${sql.join(assignments, sql`, `)} where "id" = ${id}`);
}

vehiclesRouter.get(
  "/",
  requireAuth,
  requireTenant,
  wrapAsync(async (req: Request, res: Response) => {
    const bid = businessId(req);
    let clientId: string | undefined;
    if (typeof req.query.filter === "string" && req.query.filter.trim()) {
      try {
        const filter = JSON.parse(req.query.filter) as { clientId?: { equals?: string } };
        clientId = filter?.clientId?.equals;
      } catch {
        /* ignore invalid filter */
      }
    }
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const first = req.query.first != null ? Math.min(Math.max(Number(req.query.first), 1), 100) : 50;

    let orderBy = desc(vehicles.createdAt);
    if (typeof req.query.sort === "string" && req.query.sort.trim()) {
      try {
        const s = JSON.parse(req.query.sort) as { createdAt?: string };
        if (s?.createdAt === "Ascending") orderBy = asc(vehicles.createdAt);
      } catch {
        /* ignore */
      }
    }

    const tenant = and(eq(vehicles.businessId, bid), isNull(vehicles.deletedAt))!;
    const scoped = clientId ? and(tenant, eq(vehicles.clientId, clientId))! : tenant;

    const term = `%${search}%`;
    const whereClause =
      search.length >= 2
        ? and(
            scoped,
            or(
              ilike(vehicles.make, term),
              ilike(vehicles.model, term),
              ilike(vehicles.color, term),
              ilike(vehicles.licensePlate, term),
              ilike(vehicles.vin, term),
              sql`cast(${vehicles.year} as text) ilike ${term}`,
              ilike(clients.firstName, term),
              ilike(clients.lastName, term)
            )
          )!
        : scoped;

    try {
      const rows = await db
        .select({
          ...fullVehicleSelection,
          clientFirstName: clients.firstName,
          clientLastName: clients.lastName,
          clientPhone: clients.phone,
        })
        .from(vehicles)
        .innerJoin(clients, eq(vehicles.clientId, clients.id))
        .where(and(whereClause, eq(clients.businessId, bid)))
        .orderBy(orderBy)
        .limit(first);

      res.json({
        records: rows.map((row) => {
          const normalized = normalizeVehicleRecord(row);
          return {
            ...normalized,
            client: {
              id: row.clientId,
              firstName: row.clientFirstName ?? "",
              lastName: row.clientLastName ?? "",
              phone: row.clientPhone ?? null,
            },
          };
        }),
      });
      return;
    } catch (error) {
      if (!isVehicleSchemaDriftError(error)) throw error;
      warnOnce("vehicles:list:full-schema", "vehicles list falling back without structured schema", {
        businessId: bid,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const rows = await db
      .select({
        ...legacyVehicleSelection,
        clientFirstName: clients.firstName,
        clientLastName: clients.lastName,
        clientPhone: clients.phone,
      })
      .from(vehicles)
      .innerJoin(clients, eq(vehicles.clientId, clients.id))
      .where(and(whereClause, eq(clients.businessId, bid)))
      .orderBy(orderBy)
      .limit(first);

    res.json({
      records: rows.map((row) => {
        const normalized = withMissingVehicleFields(row);
        return {
          ...normalized,
          client: {
            id: row.clientId,
            firstName: row.clientFirstName ?? "",
            lastName: row.clientLastName ?? "",
            phone: row.clientPhone ?? null,
          },
        };
      }),
    });
  })
);

vehiclesRouter.get(
  "/:id",
  requireAuth,
  requireTenant,
  wrapAsync(async (req: Request, res: Response) => {
    const bid = businessId(req);
    try {
      const [row] = await db
        .select({
          ...fullVehicleSelection,
          clientRecordId: clients.id,
          clientFirstName: clients.firstName,
          clientLastName: clients.lastName,
        })
        .from(vehicles)
        .innerJoin(clients, eq(vehicles.clientId, clients.id))
        .where(and(eq(vehicles.id, req.params.id), eq(vehicles.businessId, bid)))
        .limit(1);
      if (!row) throw new NotFoundError("Vehicle not found.");
      res.json({
        ...normalizeVehicleRecord(row as any),
        client: {
          id: row.clientRecordId,
          firstName: row.clientFirstName ?? "",
          lastName: row.clientLastName ?? "",
        },
      });
      return;
    } catch (error) {
      if (!isVehicleSchemaDriftError(error)) throw error;
      warnOnce("vehicles:get:full-schema", "vehicle lookup falling back without structured schema", {
        businessId: bid,
        vehicleId: req.params.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const [row] = await db
      .select(legacyVehicleSelection)
      .from(vehicles)
      .where(and(eq(vehicles.id, req.params.id), eq(vehicles.businessId, bid)))
      .limit(1);
    if (!row) throw new NotFoundError("Vehicle not found.");
    res.json(withMissingVehicleFields(row));
  })
);

vehiclesRouter.post(
  "/",
  requireAuth,
  requireTenant,
  wrapAsync(async (req: Request, res: Response) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");
    const bid = businessId(req);
    const [client] = await db
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.id, parsed.data.clientId), eq(clients.businessId, bid), isNull(clients.deletedAt)))
      .limit(1);
    if (!client) throw new BadRequestError("Client not found or access denied.");

    let createdId: string | null = null;
    try {
      const [created] = await db
        .insert(vehicles)
        .values({
          businessId: bid,
          clientId: parsed.data.clientId,
          make: parsed.data.make,
          model: parsed.data.model,
          year: parsed.data.year ?? null,
          trim: parsed.data.trim ?? null,
          bodyStyle: parsed.data.bodyStyle ?? null,
          engine: parsed.data.engine ?? null,
          color: parsed.data.color ?? null,
          licensePlate: parsed.data.licensePlate ?? null,
          vin: parsed.data.vin ?? null,
          displayName: buildStoredDisplayName(parsed.data),
          source: parsed.data.source ?? "manual",
          sourceVehicleId: parsed.data.sourceVehicleId ?? null,
          mileage: parsed.data.mileage ?? null,
          notes: parsed.data.notes ?? null,
        })
        .returning({ id: vehicles.id });
      createdId = created?.id ?? null;
    } catch (error) {
      if (!isVehicleSchemaDriftError(error)) throw error;
      warnOnce("vehicles:create:full-schema", "vehicle create falling back without structured schema", {
        businessId: bid,
        clientId: parsed.data.clientId,
        error: error instanceof Error ? error.message : String(error),
      });
      createdId = await insertLegacyVehicleRecord(bid, parsed.data);
    }

    if (!createdId) {
      throw new BadRequestError("Vehicle could not be created.");
    }

    const created = await loadVehicleRecordById(createdId, bid);
    if (!created) throw new NotFoundError("Vehicle was created but could not be loaded.");

    logger.info("Vehicle created", { vehicleId: created.id, businessId: bid, clientId: created.clientId });
    await createRequestActivityLog(req, {
      businessId: bid,
      action: "vehicle.created",
      entityType: "vehicle",
      entityId: created.id,
      metadata: {
        clientId: created.clientId,
        make: created.make,
        model: created.model,
        year: created.year,
        trim: created.trim,
        source: created.source,
      },
    });
    res.status(201).json(created);
  })
);

vehiclesRouter.patch(
  "/:id",
  requireAuth,
  requireTenant,
  wrapAsync(async (req: Request, res: Response) => {
    const bid = businessId(req);
    const existing = await loadVehicleRecordById(req.params.id, bid);
    if (!existing) throw new NotFoundError("Vehicle not found.");
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");

    try {
      const [updated] = await db
        .update(vehicles)
        .set({
          ...parsed.data,
          displayName: buildStoredDisplayName({
            year: parsed.data.year !== undefined ? parsed.data.year : existing.year,
            make: parsed.data.make ?? existing.make,
            model: parsed.data.model ?? existing.model,
            trim: parsed.data.trim !== undefined ? parsed.data.trim : (existing as any).trim ?? null,
            bodyStyle:
              parsed.data.bodyStyle !== undefined ? parsed.data.bodyStyle : (existing as any).bodyStyle ?? null,
            engine: parsed.data.engine !== undefined ? parsed.data.engine : (existing as any).engine ?? null,
            displayName: parsed.data.displayName ?? (existing as any).displayName ?? undefined,
          }),
          updatedAt: new Date(),
        })
        .where(eq(vehicles.id, req.params.id))
        .returning();
      const normalized = withMissingVehicleFields(updated);
      logger.info("Vehicle updated", { vehicleId: normalized.id, businessId: bid, clientId: normalized.clientId });
      await createRequestActivityLog(req, {
        businessId: bid,
        action: "vehicle.updated",
        entityType: "vehicle",
        entityId: normalized.id,
        metadata: {
          clientId: normalized.clientId,
          make: normalized.make,
          model: normalized.model,
          year: normalized.year,
          trim: normalized.trim,
          source: normalized.source,
        },
      });
      res.json(normalized);
      return;
    } catch (error) {
      if (!isVehicleSchemaDriftError(error)) throw error;
      warnOnce("vehicles:update:full-schema", "vehicle update falling back without structured schema", {
        businessId: bid,
        vehicleId: req.params.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    await updateLegacyVehicleRecord(req.params.id, parsed.data);
    const normalized = await loadVehicleRecordById(req.params.id, bid);
    if (!normalized) throw new NotFoundError("Vehicle not found.");
    logger.info("Vehicle updated", { vehicleId: normalized.id, businessId: bid, clientId: normalized.clientId });
    await createRequestActivityLog(req, {
      businessId: bid,
      action: "vehicle.updated",
      entityType: "vehicle",
      entityId: normalized.id,
      metadata: {
        clientId: normalized.clientId,
        make: normalized.make,
        model: normalized.model,
        year: normalized.year,
        trim: normalized.trim,
        source: normalized.source,
      },
    });
    res.json(normalized);
  })
);

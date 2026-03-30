import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { serviceAddonLinks, services } from "../db/schema.js";
import { eq, and, asc } from "drizzle-orm";
import { NotFoundError, ForbiddenError, BadRequestError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";

export const serviceAddonLinksRouter = Router({ mergeParams: true });

function businessId(req: Request): string {
  if (!req.businessId) throw new ForbiddenError("No business.");
  return req.businessId;
}

function parseFilter(req: Request): Record<string, unknown> | undefined {
  try {
    return req.query.filter ? (JSON.parse(String(req.query.filter)) as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function isServiceAddonSchemaDriftError(error: unknown): boolean {
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

const createSchema = z.object({
  parentServiceId: z.string().uuid(),
  addonServiceId: z.string().uuid(),
  sortOrder: z.number().int().min(0).optional(),
});

serviceAddonLinksRouter.get("/", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const filter = parseFilter(req) as
    | { parentService?: { id?: { equals?: string } }; parentServiceId?: { equals?: string } }
    | undefined;

  const parentId =
    filter?.parentService?.id?.equals ?? filter?.parentServiceId?.equals ?? undefined;

  const conditions = [eq(serviceAddonLinks.businessId, bid)];
  if (parentId) {
    conditions.push(eq(serviceAddonLinks.parentServiceId, parentId));
  }

  let rows: unknown[] = [];
  try {
    rows = await db
      .select()
      .from(serviceAddonLinks)
      .where(and(...conditions))
      .orderBy(asc(serviceAddonLinks.sortOrder), asc(serviceAddonLinks.createdAt));
  } catch (error) {
    if (!isServiceAddonSchemaDriftError(error)) throw error;
    logger.warn("service addon links list falling back without schema", {
      businessId: bid,
      error: error instanceof Error ? error.message : String(error),
    });
    rows = [];
  }

  res.json({ records: rows });
});

serviceAddonLinksRouter.post("/", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");
  const { parentServiceId, addonServiceId, sortOrder } = parsed.data;

  if (parentServiceId === addonServiceId) {
    throw new BadRequestError("A service cannot be an add-on of itself.");
  }

  const [parent] = await db
    .select({ id: services.id })
    .from(services)
    .where(and(eq(services.id, parentServiceId), eq(services.businessId, bid)))
    .limit(1);
  const [addon] = await db
    .select({ id: services.id })
    .from(services)
    .where(and(eq(services.id, addonServiceId), eq(services.businessId, bid)))
    .limit(1);

  if (!parent || !addon) throw new BadRequestError("Parent and add-on must belong to your business.");

  let created: unknown;
  try {
    [created] = await db
      .insert(serviceAddonLinks)
      .values({
        businessId: bid,
        parentServiceId,
        addonServiceId,
        sortOrder: sortOrder ?? 0,
      })
      .returning();
  } catch (error) {
    if (!isServiceAddonSchemaDriftError(error)) throw error;
    logger.warn("service addon link create skipped due to schema drift", {
      businessId: bid,
      parentServiceId,
      addonServiceId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new BadRequestError("Add-on links are not supported on this database schema yet.");
  }

  res.status(201).json(created);
});

serviceAddonLinksRouter.delete("/:id", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  let existing: unknown;
  try {
    [existing] = await db
      .select()
      .from(serviceAddonLinks)
      .where(and(eq(serviceAddonLinks.id, req.params.id), eq(serviceAddonLinks.businessId, bid)))
      .limit(1);
  } catch (error) {
    if (!isServiceAddonSchemaDriftError(error)) throw error;
    logger.warn("service addon link delete skipped due to schema drift", {
      businessId: bid,
      linkId: req.params.id,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(204).end();
    return;
  }
  if (!existing) throw new NotFoundError("Add-on link not found.");
  try {
    await db.delete(serviceAddonLinks).where(eq(serviceAddonLinks.id, req.params.id));
  } catch (error) {
    if (!isServiceAddonSchemaDriftError(error)) throw error;
    logger.warn("service addon link delete falling back without schema", {
      businessId: bid,
      linkId: req.params.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  res.status(204).end();
});

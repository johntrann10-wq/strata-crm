import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { serviceAddonLinks, services } from "../db/schema.js";
import { eq, and, asc } from "drizzle-orm";
import { NotFoundError, ForbiddenError, BadRequestError } from "../lib/errors.js";
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

  const rows = await db
    .select()
    .from(serviceAddonLinks)
    .where(and(...conditions))
    .orderBy(asc(serviceAddonLinks.sortOrder), asc(serviceAddonLinks.createdAt));

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
    .select()
    .from(services)
    .where(and(eq(services.id, parentServiceId), eq(services.businessId, bid)))
    .limit(1);
  const [addon] = await db
    .select()
    .from(services)
    .where(and(eq(services.id, addonServiceId), eq(services.businessId, bid)))
    .limit(1);

  if (!parent || !addon) throw new BadRequestError("Parent and add-on must belong to your business.");

  const [created] = await db
    .insert(serviceAddonLinks)
    .values({
      businessId: bid,
      parentServiceId,
      addonServiceId,
      sortOrder: sortOrder ?? 0,
    })
    .returning();

  res.status(201).json(created);
});

serviceAddonLinksRouter.delete("/:id", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const [existing] = await db
    .select()
    .from(serviceAddonLinks)
    .where(and(eq(serviceAddonLinks.id, req.params.id), eq(serviceAddonLinks.businessId, bid)))
    .limit(1);
  if (!existing) throw new NotFoundError("Add-on link not found.");
  await db.delete(serviceAddonLinks).where(eq(serviceAddonLinks.id, req.params.id));
  res.status(204).end();
});

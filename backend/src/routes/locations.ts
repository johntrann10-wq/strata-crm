import { Router, Request, Response } from "express";
import { db } from "../db/index.js";
import { locations } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { NotFoundError, ForbiddenError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";

export const locationsRouter = Router({ mergeParams: true });

function businessId(req: Request): string {
  if (!req.businessId) throw new ForbiddenError("No business.");
  return req.businessId;
}

locationsRouter.get("/", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const list = await db.select().from(locations).where(eq(locations.businessId, businessId(req)));
  res.json({ records: list });
});

locationsRouter.get("/:id", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const [row] = await db
    .select()
    .from(locations)
    .where(eq(locations.id, req.params.id))
    .limit(1);
  if (!row || row.businessId !== req.businessId) throw new NotFoundError("Location not found.");
  res.json(row);
});

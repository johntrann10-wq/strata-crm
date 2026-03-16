import { Router, Request, Response } from "express";
import { db } from "../db/index.js";
import { services } from "../db/schema.js";
import { eq, desc } from "drizzle-orm";
import { NotFoundError, ForbiddenError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";

export const servicesRouter = Router({ mergeParams: true });

function businessId(req: Request): string {
  if (!req.businessId) throw new ForbiddenError("No business.");
  return req.businessId;
}

servicesRouter.get("/", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const list = await db.select().from(services).where(eq(services.businessId, businessId(req))).orderBy(desc(services.createdAt)).limit(100);
  res.json({ records: list });
});

servicesRouter.get("/:id", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const [row] = await db
    .select()
    .from(services)
    .where(eq(services.id, req.params.id))
    .limit(1);
  if (!row || row.businessId !== req.businessId) throw new NotFoundError("Service not found.");
  res.json(row);
});

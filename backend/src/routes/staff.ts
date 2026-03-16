import { Router, Request, Response } from "express";
import { db } from "../db/index.js";
import { staff } from "../db/schema.js";
import { eq, desc } from "drizzle-orm";
import { NotFoundError, ForbiddenError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";

export const staffRouter = Router({ mergeParams: true });

function businessId(req: Request): string {
  if (!req.businessId) throw new ForbiddenError("No business.");
  return req.businessId;
}

staffRouter.get("/", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const list = await db.select().from(staff).where(eq(staff.businessId, businessId(req))).orderBy(desc(staff.createdAt)).limit(100);
  res.json({ records: list });
});

staffRouter.get("/:id", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const [row] = await db
    .select()
    .from(staff)
    .where(eq(staff.id, req.params.id))
    .limit(1);
  if (!row || row.businessId !== req.businessId) throw new NotFoundError("Staff not found.");
  res.json(row);
});

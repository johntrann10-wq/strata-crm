import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "../db/index.js";
import { expenses } from "../db/schema.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../lib/errors.js";
import { createRequestActivityLog } from "../lib/activity.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js";
import { logger } from "../lib/logger.js";

export const expensesRouter = Router({ mergeParams: true });

function businessId(req: Request): string {
  if (!req.businessId) throw new ForbiddenError("No business.");
  return req.businessId;
}

const emptyToUndefined = (value: unknown) => (value === "" || value === null ? undefined : value);

const createExpenseSchema = z.object({
  expenseDate: z.union([z.string().datetime(), z.string().min(1), z.date()]),
  vendor: z.string().trim().min(1),
  category: z.string().trim().min(1),
  description: z.string().trim().min(1),
  amount: z.coerce.number().positive(),
  notes: z.preprocess(emptyToUndefined, z.string().trim().max(2000).optional()),
});

const updateExpenseSchema = z
  .object({
    expenseDate: z.union([z.string().datetime(), z.string().min(1), z.date()]).optional(),
    vendor: z.string().trim().min(1).optional(),
    category: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).optional(),
    amount: z.coerce.number().positive().optional(),
    notes: z.union([z.string().trim().max(2000), z.null()]).optional(),
  })
  .strict();

function toExpenseDate(value: string | Date): Date {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new BadRequestError("Expense date is invalid.");
  return parsed;
}

expensesRouter.get("/", requireAuth, requireTenant, requirePermission("payments.read"), async (req: Request, res: Response) => {
  const bid = businessId(req);
  const first = req.query.first != null ? Math.min(Math.max(Number(req.query.first), 1), 200) : 100;
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

  let orderBy = desc(expenses.expenseDate);
  if (typeof req.query.sort === "string" && req.query.sort.trim()) {
    try {
      const sort = JSON.parse(req.query.sort) as { expenseDate?: string };
      if (sort?.expenseDate === "Ascending") orderBy = asc(expenses.expenseDate);
    } catch {
      // Ignore malformed sort.
    }
  }

  const tenantFilter = eq(expenses.businessId, bid);
  const whereClause =
    search.length > 0
      ? and(
          tenantFilter,
          or(
            ilike(expenses.vendor, `%${search}%`),
            ilike(expenses.category, `%${search}%`),
            ilike(expenses.description, `%${search}%`),
            ilike(expenses.notes, `%${search}%`)
          )
        )
      : tenantFilter;

  const rows = await db.select().from(expenses).where(whereClause!).orderBy(orderBy, desc(expenses.createdAt)).limit(first);
  res.json({ records: rows });
});

expensesRouter.get("/:id", requireAuth, requireTenant, requirePermission("payments.read"), async (req: Request, res: Response) => {
  const [row] = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, req.params.id), eq(expenses.businessId, businessId(req))))
    .limit(1);
  if (!row) throw new NotFoundError("Expense not found.");
  res.json(row);
});

expensesRouter.post("/", requireAuth, requireTenant, requirePermission("payments.write"), async (req: Request, res: Response) => {
  const parsed = createExpenseSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");
  const bid = businessId(req);
  const [created] = await db
    .insert(expenses)
    .values({
      businessId: bid,
      expenseDate: toExpenseDate(parsed.data.expenseDate),
      vendor: parsed.data.vendor,
      category: parsed.data.category,
      description: parsed.data.description,
      amount: String(parsed.data.amount),
      notes: parsed.data.notes ?? null,
    })
    .returning();

  logger.info("Expense created", { expenseId: created.id, businessId: bid });
  await createRequestActivityLog(req, {
    businessId: bid,
    action: "expense.created",
    entityType: "expense",
    entityId: created.id,
    metadata: {
      vendor: created.vendor,
      category: created.category,
      amount: created.amount,
    },
  });
  res.status(201).json(created);
});

expensesRouter.patch("/:id", requireAuth, requireTenant, requirePermission("payments.write"), async (req: Request, res: Response) => {
  const bid = businessId(req);
  const [existing] = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, req.params.id), eq(expenses.businessId, bid)))
    .limit(1);
  if (!existing) throw new NotFoundError("Expense not found.");

  const parsed = updateExpenseSchema.safeParse({
    ...req.body,
    notes: req.body?.notes === "" ? null : req.body?.notes,
  });
  if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.expenseDate !== undefined) patch.expenseDate = toExpenseDate(parsed.data.expenseDate);
  if (parsed.data.vendor !== undefined) patch.vendor = parsed.data.vendor;
  if (parsed.data.category !== undefined) patch.category = parsed.data.category;
  if (parsed.data.description !== undefined) patch.description = parsed.data.description;
  if (parsed.data.amount !== undefined) patch.amount = String(parsed.data.amount);
  if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes;

  const [updated] = await db.update(expenses).set(patch).where(eq(expenses.id, req.params.id)).returning();
  if (!updated) throw new NotFoundError("Expense not found.");

  await createRequestActivityLog(req, {
    businessId: bid,
    action: "expense.updated",
    entityType: "expense",
    entityId: updated.id,
    metadata: {
      vendor: updated.vendor,
      category: updated.category,
      amount: updated.amount,
    },
  });
  res.json(updated);
});

expensesRouter.delete("/:id", requireAuth, requireTenant, requirePermission("payments.write"), async (req: Request, res: Response) => {
  const bid = businessId(req);
  const [existing] = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, req.params.id), eq(expenses.businessId, bid)))
    .limit(1);
  if (!existing) throw new NotFoundError("Expense not found.");

  await db.delete(expenses).where(eq(expenses.id, req.params.id));
  await createRequestActivityLog(req, {
    businessId: bid,
    action: "expense.deleted",
    entityType: "expense",
    entityId: existing.id,
    metadata: {
      vendor: existing.vendor,
      category: existing.category,
      amount: existing.amount,
    },
  });
  res.status(204).end();
});

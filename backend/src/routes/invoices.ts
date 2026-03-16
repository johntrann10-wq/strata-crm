import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { invoices, businesses, invoiceLineItems, clients, payments, appointments, vehicles } from "../db/schema.js";
import { eq, and, desc, isNull, sql } from "drizzle-orm";
import { NotFoundError, ForbiddenError, BadRequestError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { logger } from "../lib/logger.js";
import { renderInvoiceHtml, type InvoiceTemplateData } from "../lib/invoiceTemplate.js";

export const invoicesRouter = Router({ mergeParams: true });

function businessId(req: Request): string {
  if (!req.businessId) throw new ForbiddenError("No business.");
  return req.businessId;
}

const createSchema = z.object({
  clientId: z.string().uuid(),
  appointmentId: z.string().uuid().optional(),
  lineItems: z.array(z.object({ description: z.string(), quantity: z.number(), unitPrice: z.number() })).optional(),
  discountAmount: z.number().min(0).optional(),
});

invoicesRouter.get("/", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const first = req.query.first != null ? Math.min(Number(req.query.first), 100) : 50;
  const list = await db.select().from(invoices).where(eq(invoices.businessId, bid)).orderBy(desc(invoices.createdAt)).limit(first);
  res.json({ records: list });
});

invoicesRouter.get("/:id", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const [row] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, req.params.id), eq(invoices.businessId, bid)))
    .limit(1);
  if (!row) throw new NotFoundError("Invoice not found.");
  const lineItemsRows = await db.select().from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, row.id));
  const paymentsList = await db.select().from(payments).where(eq(payments.invoiceId, row.id));
  const [clientRow] = await db.select({ id: clients.id, firstName: clients.firstName, lastName: clients.lastName, email: clients.email, phone: clients.phone }).from(clients).where(eq(clients.id, row.clientId)).limit(1);
  let appointmentData: { id: string; startTime: Date | null; vehicle?: { year: number | null; make: string; model: string } } | null = null;
  if (row.appointmentId) {
    const [apt] = await db.select({ id: appointments.id, startTime: appointments.startTime, vehicleId: appointments.vehicleId }).from(appointments).where(eq(appointments.id, row.appointmentId)).limit(1);
    if (apt?.vehicleId) {
      const [v] = await db.select({ year: vehicles.year, make: vehicles.make, model: vehicles.model }).from(vehicles).where(eq(vehicles.id, apt.vehicleId)).limit(1);
      appointmentData = { id: apt.id, startTime: apt.startTime, vehicle: v ? { year: v.year, make: v.make ?? "", model: v.model ?? "" } : undefined };
    } else {
      appointmentData = apt ? { id: apt.id, startTime: apt.startTime } : null;
    }
  }
  res.json({
    ...row,
    lineItems: lineItemsRows,
    payments: paymentsList,
    client: clientRow ?? null,
    appointment: appointmentData,
    business: { id: row.businessId },
  });
});

invoicesRouter.get("/:id/html", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const [row] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, req.params.id), eq(invoices.businessId, bid)))
    .limit(1);
  if (!row) throw new NotFoundError("Invoice not found.");
  const [businessRow] = await db
    .select({ name: businesses.name, email: businesses.email, phone: businesses.phone, address: businesses.address, city: businesses.city, state: businesses.state, zip: businesses.zip, timezone: businesses.timezone })
    .from(businesses)
    .where(eq(businesses.id, bid))
    .limit(1);
  const [clientRow] = await db
    .select({ firstName: clients.firstName, lastName: clients.lastName, email: clients.email, phone: clients.phone, address: clients.address })
    .from(clients)
    .where(eq(clients.id, row.clientId))
    .limit(1);
  const lineItemsRows = await db.select().from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, row.id));
  const paymentsList = await db.select().from(payments).where(and(eq(payments.invoiceId, row.id), isNull(payments.reversedAt)));
  const totalPaid = paymentsList.reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
  const templateData: InvoiceTemplateData = {
    invoiceNumber: row.invoiceNumber,
    status: row.status,
    dueDate: row.dueDate,
    subtotal: row.subtotal,
    taxRate: row.taxRate,
    taxAmount: row.taxAmount,
    discountAmount: row.discountAmount,
    total: row.total,
    totalPaid: String(totalPaid),
    notes: row.notes,
    createdAt: row.createdAt,
    business: {
      name: businessRow?.name,
      email: businessRow?.email,
      phone: businessRow?.phone,
      address: [businessRow?.address, businessRow?.city, businessRow?.state, businessRow?.zip].filter(Boolean).join(", "),
      city: businessRow?.city,
      state: businessRow?.state,
      zip: businessRow?.zip,
      timezone: businessRow?.timezone,
    },
    client: {
      firstName: clientRow?.firstName,
      lastName: clientRow?.lastName,
      email: clientRow?.email,
      phone: clientRow?.phone,
      address: clientRow?.address,
    },
    lineItems: lineItemsRows.map((li) => ({ description: li.description, quantity: li.quantity, unitPrice: li.unitPrice, total: li.total })),
    payments: paymentsList.map((p) => ({ amount: p.amount, method: p.method, paidAt: p.paidAt })),
  };
  const html = renderInvoiceHtml(templateData);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

invoicesRouter.post("/", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");
  const bid = businessId(req);

  // Tenancy: client must belong to this business
  const [client] = await db.select().from(clients).where(and(eq(clients.id, parsed.data.clientId), eq(clients.businessId, bid))).limit(1);
  if (!client) throw new BadRequestError("Client not found or access denied.");

  const lineItems = parsed.data.lineItems ?? [];
  const subtotal = lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
  const discountAmount = parsed.data.discountAmount ?? 0;
  const taxRate = 0;
  const taxAmount = 0;
  const total = Math.max(0, subtotal - discountAmount + taxAmount);
  const items = lineItems.map((li) => {
    const lineTotal = li.quantity * li.unitPrice;
    return { description: li.description, quantity: String(li.quantity), unitPrice: String(li.unitPrice), total: String(lineTotal) };
  });

  // Transaction: atomic create; nextInvoiceNumber read/update in same tx to reduce race window
  const inv = await db.transaction(async (tx) => {
    const [b] = await tx.select({ nextInvoiceNumber: businesses.nextInvoiceNumber }).from(businesses).where(eq(businesses.id, bid)).limit(1);
    if (!b) throw new NotFoundError("Business not found.");
    const nextNum = b.nextInvoiceNumber ?? 1;
    const invoiceNumber = `INV-${nextNum}`;
    const [created] = await tx
      .insert(invoices)
      .values({
        businessId: bid,
        clientId: parsed.data.clientId,
        appointmentId: parsed.data.appointmentId ?? null,
        invoiceNumber,
        status: "draft",
        subtotal: String(subtotal),
        taxRate: String(taxRate),
        taxAmount: String(taxAmount),
        discountAmount: String(discountAmount),
        total: String(total),
      })
      .returning();
    if (!created) throw new BadRequestError("Failed to create invoice.");
    await tx.update(businesses).set({ nextInvoiceNumber: nextNum + 1, updatedAt: new Date() }).where(eq(businesses.id, bid));
    for (const it of items) {
      await tx.insert(invoiceLineItems).values({
        invoiceId: created.id,
        description: it.description,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        total: it.total,
      });
    }
    return created;
  });

  logger.info("Invoice created", { invoiceId: inv.id, businessId: bid });
  res.status(201).json(inv);
});

invoicesRouter.post("/:id/void", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const [existing] = await db.select().from(invoices).where(and(eq(invoices.id, req.params.id), eq(invoices.businessId, bid))).limit(1);
  if (!existing) throw new NotFoundError("Invoice not found.");
  if (existing.status === "void") throw new BadRequestError("Invoice is already void.");
  const [updated] = await db.update(invoices).set({ status: "void", updatedAt: new Date() }).where(eq(invoices.id, req.params.id)).returning();
  res.json(updated);
});

invoicesRouter.post("/:id/sendToClient", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const [existing] = await db.select().from(invoices).where(and(eq(invoices.id, req.params.id), eq(invoices.businessId, bid))).limit(1);
  if (!existing) throw new NotFoundError("Invoice not found.");
  const [updated] = await db.update(invoices).set({ status: "sent", updatedAt: new Date() }).where(eq(invoices.id, req.params.id)).returning();
  res.json(updated);
});

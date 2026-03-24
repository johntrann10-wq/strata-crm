import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { invoices, businesses, invoiceLineItems, clients, payments, appointments, vehicles, quotes } from "../db/schema.js";
import { eq, and, or, desc, asc, isNull, sql, ilike } from "drizzle-orm";
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
  /** Optional: validated against clientId (does not auto-copy lines — UI sends lineItems). */
  quoteId: z.string().uuid().optional(),
  status: z.enum(["draft", "sent"]).optional(),
  lineItems: z.array(z.object({ description: z.string(), quantity: z.number(), unitPrice: z.number() })).optional(),
  discountAmount: z.number().min(0).optional(),
  taxRate: z.coerce.number().min(0).max(100).optional(),
  notes: z.string().optional(),
  dueDate: z.union([z.string(), z.null()]).optional(),
});

const INVOICE_STATUSES = ["draft", "sent", "paid", "partial", "void"] as const;

invoicesRouter.get("/", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const first = req.query.first != null ? Math.min(Math.max(Number(req.query.first), 1), 100) : 50;
  const clientIdRaw = typeof req.query.clientId === "string" ? req.query.clientId.trim() : "";
  const clientIdFilter = z.string().uuid().safeParse(clientIdRaw).success ? clientIdRaw : undefined;
  const vehicleIdRaw = typeof req.query.vehicleId === "string" ? req.query.vehicleId.trim() : "";
  const vehicleIdFilter = z.string().uuid().safeParse(vehicleIdRaw).success ? vehicleIdRaw : undefined;
  const unpaid = req.query.unpaid === "1" || req.query.unpaid === "true";
  const statusRaw = typeof req.query.status === "string" ? req.query.status.trim() : "";
  const statusFilter =
    !unpaid && statusRaw && statusRaw !== "all" && (INVOICE_STATUSES as readonly string[]).includes(statusRaw)
      ? statusRaw
      : undefined;

  let orderBy = desc(invoices.createdAt);
  if (typeof req.query.sort === "string" && req.query.sort.trim()) {
    try {
      const s = JSON.parse(req.query.sort) as { createdAt?: string };
      if (s?.createdAt === "Ascending") orderBy = asc(invoices.createdAt);
    } catch {
      /* ignore invalid sort */
    }
  }

  const conditions = [eq(invoices.businessId, bid)];
  if (clientIdFilter) conditions.push(eq(invoices.clientId, clientIdFilter));
  if (vehicleIdFilter) conditions.push(eq(appointments.vehicleId, vehicleIdFilter));
  if (unpaid) {
    conditions.push(sql`${invoices.status} in ('sent', 'partial')`);
  } else if (statusFilter) {
    conditions.push(eq(invoices.status, statusFilter as (typeof INVOICE_STATUSES)[number]));
  }

  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const term = `%${search}%`;
  const whereClause =
    search.length >= 2
      ? and(
          ...conditions,
          or(
            ilike(invoices.invoiceNumber, term),
            ilike(clients.firstName, term),
            ilike(clients.lastName, term),
            ilike(vehicles.make, term),
            ilike(vehicles.model, term),
            sql`cast(${invoices.id} as text) ilike ${term}`
          )
        )!
      : and(...conditions)!;

  const rows = await db
    .select({
      id: invoices.id,
      businessId: invoices.businessId,
      clientId: invoices.clientId,
      appointmentId: invoices.appointmentId,
      invoiceNumber: invoices.invoiceNumber,
      status: invoices.status,
      subtotal: invoices.subtotal,
      taxRate: invoices.taxRate,
      taxAmount: invoices.taxAmount,
      discountAmount: invoices.discountAmount,
      total: invoices.total,
      dueDate: invoices.dueDate,
      paidAt: invoices.paidAt,
      notes: invoices.notes,
      createdAt: invoices.createdAt,
      updatedAt: invoices.updatedAt,
      clientFirstName: clients.firstName,
      clientLastName: clients.lastName,
      aptStart: appointments.startTime,
      vehicleYear: vehicles.year,
      vehicleMake: vehicles.make,
      vehicleModel: vehicles.model,
    })
    .from(invoices)
    .leftJoin(clients, and(eq(invoices.clientId, clients.id), eq(clients.businessId, bid)))
    .leftJoin(appointments, eq(invoices.appointmentId, appointments.id))
    .leftJoin(vehicles, and(eq(appointments.vehicleId, vehicles.id), eq(vehicles.businessId, bid)))
    .where(whereClause)
    .orderBy(orderBy)
    .limit(first);

  const records = rows.map((r) => ({
    id: r.id,
    businessId: r.businessId,
    clientId: r.clientId,
    appointmentId: r.appointmentId,
    invoiceNumber: r.invoiceNumber,
    status: r.status,
    subtotal: r.subtotal,
    taxRate: r.taxRate,
    taxAmount: r.taxAmount,
    discountAmount: r.discountAmount,
    total: r.total,
    dueDate: r.dueDate,
    paidAt: r.paidAt,
    notes: r.notes,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    client:
      r.clientFirstName != null
        ? { id: r.clientId, firstName: r.clientFirstName, lastName: r.clientLastName ?? "" }
        : null,
    appointment:
      r.appointmentId != null
        ? { id: r.appointmentId, startTime: r.aptStart ?? null }
        : null,
    vehicle:
      r.vehicleMake != null
        ? {
            year: r.vehicleYear ?? null,
            make: r.vehicleMake,
            model: r.vehicleModel ?? "",
          }
        : null,
  }));

  res.json({ records });
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
  let quoteData: { id: string; status: string; total: string | null } | null = null;
  if (row.appointmentId) {
    const [apt] = await db.select({ id: appointments.id, startTime: appointments.startTime, vehicleId: appointments.vehicleId }).from(appointments).where(eq(appointments.id, row.appointmentId)).limit(1);
    if (apt?.vehicleId) {
      const [v] = await db.select({ year: vehicles.year, make: vehicles.make, model: vehicles.model }).from(vehicles).where(eq(vehicles.id, apt.vehicleId)).limit(1);
      appointmentData = { id: apt.id, startTime: apt.startTime, vehicle: v ? { year: v.year, make: v.make ?? "", model: v.model ?? "" } : undefined };
    } else {
      appointmentData = apt ? { id: apt.id, startTime: apt.startTime } : null;
    }
    const [quote] = await db
      .select({ id: quotes.id, status: quotes.status, total: quotes.total })
      .from(quotes)
      .where(and(eq(quotes.appointmentId, row.appointmentId), eq(quotes.businessId, bid)))
      .orderBy(desc(quotes.updatedAt), desc(quotes.createdAt))
      .limit(1);
    quoteData = quote ?? null;
  }
  res.json({
    ...row,
    lineItems: lineItemsRows,
    payments: paymentsList,
    client: clientRow ?? null,
    appointment: appointmentData,
    quote: quoteData,
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

  if (parsed.data.appointmentId) {
    const [apt] = await db
      .select()
      .from(appointments)
      .where(and(eq(appointments.id, parsed.data.appointmentId), eq(appointments.businessId, bid)))
      .limit(1);
    if (!apt) throw new BadRequestError("Appointment not found.");
    if (apt.clientId !== parsed.data.clientId) throw new BadRequestError("Invoice client must match the appointment client.");
  }

  if (parsed.data.quoteId) {
    const [q] = await db.select().from(quotes).where(and(eq(quotes.id, parsed.data.quoteId), eq(quotes.businessId, bid))).limit(1);
    if (!q) throw new BadRequestError("Quote not found.");
    if (q.clientId !== parsed.data.clientId) throw new BadRequestError("Invoice client must match the quote client.");
  }

  const lineItems = parsed.data.lineItems ?? [];
  const initialStatus = parsed.data.status ?? "draft";
  const subtotal = lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
  const discountAmount = parsed.data.discountAmount ?? 0;
  const taxRate = parsed.data.taxRate ?? 0;
  const taxAmount = (subtotal * taxRate) / 100;
  const total = Math.max(0, subtotal + taxAmount - discountAmount);
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
    const dueDate =
      parsed.data.dueDate != null && parsed.data.dueDate !== ""
        ? new Date(parsed.data.dueDate)
        : null;
    const [created] = await tx
      .insert(invoices)
      .values({
        businessId: bid,
        clientId: parsed.data.clientId,
        appointmentId: parsed.data.appointmentId ?? null,
        invoiceNumber,
        status: initialStatus,
        subtotal: String(subtotal),
        taxRate: String(taxRate),
        taxAmount: String(taxAmount),
        discountAmount: String(discountAmount),
        total: String(total),
        notes: parsed.data.notes ?? null,
        dueDate,
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

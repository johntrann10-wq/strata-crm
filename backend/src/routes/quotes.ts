import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { quotes, clients, vehicles, quoteLineItems, appointments, staff, locations, businesses } from "../db/schema.js";
import { eq, and, desc, asc, isNull, lt, sql, ilike, or } from "drizzle-orm";
import { NotFoundError, ForbiddenError, BadRequestError, ConflictError, AppError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { hasAppointmentOverlap } from "../lib/appointmentOverlap.js";
import { recalculateQuoteTotals } from "../lib/revenueTotals.js";
import { createRequestActivityLog } from "../lib/activity.js";
import { isEmailConfigured } from "../lib/env.js";
import { sendQuoteEmail, sendQuoteFollowUpEmail } from "../lib/email.js";
import { logger } from "../lib/logger.js";
import { renderQuoteHtml, type QuoteTemplateData } from "../lib/quoteTemplate.js";
import { wrapAsync } from "../lib/asyncHandler.js";

export const quotesRouter = Router({ mergeParams: true });

function businessId(req: Request): string {
  if (!req.businessId) throw new ForbiddenError("No business.");
  return req.businessId;
}

function isLocationSchemaDriftError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: string }).code;
  const message = String((error as { message?: string }).message ?? "").toLowerCase();
  return code === "42P01" || code === "42703" || message.includes("does not exist");
}

async function locationExistsForBusiness(locationId: string, bid: string): Promise<boolean> {
  try {
    const [loc] = await db
      .select({ id: locations.id })
      .from(locations)
      .where(and(eq(locations.id, locationId), eq(locations.businessId, bid)))
      .limit(1);
    return !!loc;
  } catch (error) {
    if (!isLocationSchemaDriftError(error)) throw error;
    const [loc] = await db
      .select({
        id: locations.id,
        businessId: locations.businessId,
        name: locations.name,
        address: locations.address,
        active: locations.active,
        createdAt: locations.createdAt,
        updatedAt: locations.updatedAt,
      })
      .from(locations)
      .where(and(eq(locations.id, locationId), eq(locations.businessId, bid)))
      .limit(1);
    return !!loc;
  }
}

const QUOTE_STATUSES = ["draft", "sent", "accepted", "declined", "expired"] as const;
const sendQuoteSchema = z.object({
  message: z.string().max(2000).optional(),
});

quotesRouter.get("/", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const first = req.query.first != null ? Math.min(Math.max(Number(req.query.first), 1), 100) : 50;
  const clientIdRaw = typeof req.query.clientId === "string" ? req.query.clientId.trim() : "";
  const clientIdFilter = z.string().uuid().safeParse(clientIdRaw).success ? clientIdRaw : undefined;
  const vehicleIdRaw = typeof req.query.vehicleId === "string" ? req.query.vehicleId.trim() : "";
  const vehicleIdFilter = z.string().uuid().safeParse(vehicleIdRaw).success ? vehicleIdRaw : undefined;
  const lost = req.query.lost === "1" || req.query.lost === "true";
  const pending = req.query.pending === "1" || req.query.pending === "true";
  const statusRaw = typeof req.query.status === "string" ? req.query.status.trim() : "";
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const statusFilter =
    !lost && !pending && statusRaw && (QUOTE_STATUSES as readonly string[]).includes(statusRaw) ? statusRaw : undefined;

  let orderBy = desc(quotes.createdAt);
  if (typeof req.query.sort === "string" && req.query.sort.trim()) {
    try {
      const s = JSON.parse(req.query.sort) as { createdAt?: string };
      if (s?.createdAt === "Ascending") orderBy = asc(quotes.createdAt);
    } catch {
      /* ignore */
    }
  }

  const conditions = [eq(quotes.businessId, bid)];
  if (clientIdFilter) conditions.push(eq(quotes.clientId, clientIdFilter));
  if (vehicleIdFilter) conditions.push(eq(quotes.vehicleId, vehicleIdFilter));
  if (pending) {
    conditions.push(sql`${quotes.status} in ('draft', 'sent')`);
  } else if (lost) {
    const threshold = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    conditions.push(sql`${quotes.status} in ('draft', 'sent')`);
    conditions.push(isNull(quotes.followUpSentAt));
    conditions.push(lt(quotes.createdAt, threshold));
  } else if (statusFilter) {
    conditions.push(eq(quotes.status, statusFilter as (typeof QUOTE_STATUSES)[number]));
  }

  const term = `%${search}%`;
  const whereClause =
    search.length >= 2
      ? and(
          ...conditions,
          or(
            ilike(clients.firstName, term),
            ilike(clients.lastName, term),
            ilike(vehicles.make, term),
            ilike(vehicles.model, term),
            sql`cast(${quotes.id} as text) ilike ${term}`
          )
        )!
      : and(...conditions)!;

  const rows = await db
    .select({
      id: quotes.id,
      businessId: quotes.businessId,
      clientId: quotes.clientId,
      vehicleId: quotes.vehicleId,
      appointmentId: quotes.appointmentId,
      status: quotes.status,
      subtotal: quotes.subtotal,
      taxRate: quotes.taxRate,
      taxAmount: quotes.taxAmount,
      total: quotes.total,
      expiresAt: quotes.expiresAt,
      sentAt: quotes.sentAt,
      followUpSentAt: quotes.followUpSentAt,
      notes: quotes.notes,
      createdAt: quotes.createdAt,
      updatedAt: quotes.updatedAt,
      clientFirstName: clients.firstName,
      clientLastName: clients.lastName,
      clientEmail: clients.email,
      vehicleYear: vehicles.year,
      vehicleMake: vehicles.make,
      vehicleModel: vehicles.model,
    })
    .from(quotes)
    .leftJoin(clients, and(eq(quotes.clientId, clients.id), eq(clients.businessId, bid)))
    .leftJoin(vehicles, and(eq(quotes.vehicleId, vehicles.id), eq(vehicles.businessId, bid)))
    .where(whereClause)
    .orderBy(orderBy)
    .limit(first);

  const records = rows.map((r) => ({
    id: r.id,
    businessId: r.businessId,
    clientId: r.clientId,
    vehicleId: r.vehicleId,
    appointmentId: r.appointmentId,
    status: r.status,
    subtotal: r.subtotal,
    taxRate: r.taxRate,
    taxAmount: r.taxAmount,
    total: r.total,
    expiresAt: r.expiresAt,
    sentAt: r.sentAt,
    followUpSentAt: r.followUpSentAt,
    notes: r.notes,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    client:
      r.clientFirstName != null
        ? {
            id: r.clientId,
            firstName: r.clientFirstName,
            lastName: r.clientLastName ?? "",
            email: r.clientEmail ?? null,
          }
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

quotesRouter.get("/:id", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const [row] = await db
    .select()
    .from(quotes)
    .where(and(eq(quotes.id, req.params.id), eq(quotes.businessId, businessId(req))))
    .limit(1);
  if (!row) throw new NotFoundError("Quote not found.");

  const bid = businessId(req);

  const [clientRow] = await db
    .select({
      id: clients.id,
      firstName: clients.firstName,
      lastName: clients.lastName,
      email: clients.email,
      phone: clients.phone,
    })
    .from(clients)
    .where(and(eq(clients.id, row.clientId), eq(clients.businessId, bid)))
    .limit(1);

  let vehicleRow:
    | {
        id: string;
        year: number | null;
        make: string | null;
        model: string | null;
        color: string | null;
        licensePlate: string | null;
      }
    | null = null;
  if (row.vehicleId) {
    const [v] = await db
      .select({
        id: vehicles.id,
        year: vehicles.year,
        make: vehicles.make,
        model: vehicles.model,
        color: vehicles.color,
        licensePlate: vehicles.licensePlate,
      })
      .from(vehicles)
      .where(and(eq(vehicles.id, row.vehicleId), eq(vehicles.businessId, bid)))
      .limit(1);
    vehicleRow = v ?? null;
  }

  const lineItemsRows = await db
    .select()
    .from(quoteLineItems)
    .where(eq(quoteLineItems.quoteId, row.id))
    .orderBy(desc(quoteLineItems.createdAt));

  res.json({
    ...row,
    client: clientRow ?? null,
    vehicle: vehicleRow ?? null,
    lineItems: {
      edges: lineItemsRows.map((li) => ({ node: li })),
    },
  });
});

quotesRouter.get("/:id/html", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const [row] = await db
    .select()
    .from(quotes)
    .where(and(eq(quotes.id, req.params.id), eq(quotes.businessId, bid)))
    .limit(1);
  if (!row) throw new NotFoundError("Quote not found.");

  const [businessRow] = await db
    .select({
      name: businesses.name,
      email: businesses.email,
      phone: businesses.phone,
      address: businesses.address,
      city: businesses.city,
      state: businesses.state,
      zip: businesses.zip,
      timezone: businesses.timezone,
    })
    .from(businesses)
    .where(eq(businesses.id, bid))
    .limit(1);

  const [clientRow] = await db
    .select({
      firstName: clients.firstName,
      lastName: clients.lastName,
      email: clients.email,
      phone: clients.phone,
      address: clients.address,
    })
    .from(clients)
    .where(eq(clients.id, row.clientId))
    .limit(1);

  let vehicleRow: QuoteTemplateData["vehicle"] = null;
  if (row.vehicleId) {
    const [vehicle] = await db
      .select({
        year: vehicles.year,
        make: vehicles.make,
        model: vehicles.model,
        color: vehicles.color,
        licensePlate: vehicles.licensePlate,
      })
      .from(vehicles)
      .where(and(eq(vehicles.id, row.vehicleId), eq(vehicles.businessId, bid)))
      .limit(1);
    vehicleRow = vehicle ?? null;
  }

  const lineItemsRows = await db
    .select()
    .from(quoteLineItems)
    .where(eq(quoteLineItems.quoteId, row.id))
    .orderBy(desc(quoteLineItems.createdAt));

  const html = renderQuoteHtml({
    status: row.status,
    subtotal: row.subtotal,
    taxRate: row.taxRate,
    taxAmount: row.taxAmount,
    total: row.total,
    notes: row.notes,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
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
    vehicle: vehicleRow,
    lineItems: lineItemsRows.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.total,
    })),
  });

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

const createQuoteSchema = z.object({
  clientId: z.string().uuid().optional(),
  client: z.object({ _link: z.string().uuid() }).optional(),
  vehicleId: z.string().uuid().nullable().optional(),
  vehicle: z.object({ _link: z.string().uuid() }).optional(),
  business: z.object({ _link: z.string().uuid() }).optional(),
  notes: z.string().nullable().optional(),
  expiresAt: z.union([z.string(), z.null()]).optional(),
  taxRate: z.coerce.number().min(0).max(100).optional(),
  subtotal: z.coerce.number().optional(),
  taxAmount: z.coerce.number().optional(),
  total: z.coerce.number().optional(),
  status: z.enum(QUOTE_STATUSES).optional(),
  lineItems: z
    .array(
      z.object({
        description: z.string().trim().min(1),
        quantity: z.coerce.number().positive(),
        unitPrice: z.coerce.number().min(0),
      })
    )
    .optional(),
});

quotesRouter.post("/", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const parsed = createQuoteSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");
  const clientId = parsed.data.clientId ?? parsed.data.client?._link;
  if (!clientId) throw new BadRequestError("clientId or client._link is required.");
  if (parsed.data.business?._link && parsed.data.business._link !== bid) {
    throw new BadRequestError("Business mismatch.");
  }
  const [client] = await db.select().from(clients).where(and(eq(clients.id, clientId), eq(clients.businessId, bid))).limit(1);
  if (!client) throw new BadRequestError("Client not found or access denied.");

  const vehicleId = parsed.data.vehicleId ?? parsed.data.vehicle?._link ?? null;
  if (vehicleId) {
    const [veh] = await db
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.id, vehicleId), eq(vehicles.businessId, bid), eq(vehicles.clientId, clientId)))
      .limit(1);
    if (!veh) throw new BadRequestError("Vehicle not found or does not belong to this client.");
  }

  const taxRate = parsed.data.taxRate ?? 0;
  let expiresAt: Date | null = null;
  if (parsed.data.expiresAt != null && parsed.data.expiresAt !== "") {
    const d = new Date(parsed.data.expiresAt);
    if (!Number.isNaN(d.getTime())) expiresAt = d;
  }

  const created = await db.transaction(async (tx) => {
    const [quote] = await tx
      .insert(quotes)
      .values({
        businessId: bid,
        clientId,
        vehicleId,
        notes: parsed.data.notes ?? null,
        expiresAt,
        taxRate: String(taxRate),
        subtotal: "0",
        taxAmount: "0",
        total: "0",
        status: parsed.data.status ?? "draft",
      })
      .returning();
    if (!quote) throw new BadRequestError("Failed to create quote.");

    for (const item of parsed.data.lineItems ?? []) {
      await tx.insert(quoteLineItems).values({
        quoteId: quote.id,
        description: item.description.trim(),
        quantity: String(item.quantity),
        unitPrice: String(item.unitPrice),
        total: String(item.quantity * item.unitPrice),
      });
    }

    if ((parsed.data.lineItems?.length ?? 0) > 0) {
      await recalculateQuoteTotals(tx, quote.id);
    }

    const [freshQuote] = await tx.select().from(quotes).where(eq(quotes.id, quote.id)).limit(1);
    if (!freshQuote) throw new BadRequestError("Failed to load created quote.");
    return freshQuote;
  });
  if (!created) throw new BadRequestError("Failed to create quote.");
  await createRequestActivityLog(req, {
    businessId: bid,
    action: "quote.created",
    entityType: "quote",
    entityId: created.id,
    metadata: {
      clientId: created.clientId,
      vehicleId: created.vehicleId,
      status: created.status,
    },
  });
  res.status(201).json(created);
});

const patchQuoteSchema = z
  .object({
    status: z.enum(QUOTE_STATUSES).optional(),
    notes: z.union([z.string(), z.null()]).optional(),
    vehicleId: z.union([z.string().uuid(), z.null()]).optional(),
    clientId: z.string().uuid().optional(),
    appointmentId: z.union([z.string().uuid(), z.null()]).optional(),
    expiresAt: z.union([z.string(), z.null()]).optional(),
    taxRate: z.coerce.number().min(0).max(100).optional(),
  })
  .strict();

quotesRouter.patch("/:id", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const [existing] = await db.select().from(quotes).where(and(eq(quotes.id, req.params.id), eq(quotes.businessId, bid))).limit(1);
  if (!existing) throw new NotFoundError("Quote not found.");
  const parsed = patchQuoteSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");
  const patch = parsed.data;
  if (patch.clientId) {
    const [c] = await db.select().from(clients).where(and(eq(clients.id, patch.clientId), eq(clients.businessId, bid))).limit(1);
    if (!c) throw new BadRequestError("Client not found.");
  }

  const effectiveClientId = patch.clientId ?? existing.clientId;
  const effectiveVehicleId = patch.vehicleId !== undefined ? patch.vehicleId : existing.vehicleId;
  const effectiveAppointmentId = patch.appointmentId !== undefined ? patch.appointmentId : existing.appointmentId;

  if (effectiveVehicleId) {
    const [v] = await db
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.id, effectiveVehicleId), eq(vehicles.businessId, bid), eq(vehicles.clientId, effectiveClientId)))
      .limit(1);
    if (!v) throw new BadRequestError("Vehicle not found for this client.");
  }
  if (effectiveAppointmentId) {
    if (!effectiveVehicleId) {
      throw new BadRequestError("Appointment-linked quotes must keep a vehicle attached.");
    }
    const [appointment] = await db
      .select({
        id: appointments.id,
        clientId: appointments.clientId,
        vehicleId: appointments.vehicleId,
      })
      .from(appointments)
      .where(and(eq(appointments.id, effectiveAppointmentId), eq(appointments.businessId, bid)))
      .limit(1);
    if (!appointment) throw new BadRequestError("Appointment not found.");
    if (appointment.clientId !== effectiveClientId) {
      throw new BadRequestError("Quote client must match the linked appointment client.");
    }
    if (!appointment.vehicleId || appointment.vehicleId !== effectiveVehicleId) {
      throw new BadRequestError("Quote vehicle must match the linked appointment vehicle.");
    }
  }
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.status != null) updates.status = patch.status;
  if (patch.notes !== undefined) updates.notes = patch.notes;
  if (patch.vehicleId !== undefined) updates.vehicleId = patch.vehicleId;
  if (patch.clientId != null) updates.clientId = patch.clientId;
  if (patch.appointmentId !== undefined) updates.appointmentId = patch.appointmentId;
  if (patch.expiresAt !== undefined) {
    updates.expiresAt = patch.expiresAt && patch.expiresAt !== "" ? new Date(patch.expiresAt) : null;
  }
  if (patch.taxRate != null) updates.taxRate = String(patch.taxRate);

  const [updated] = await db.update(quotes).set(updates).where(eq(quotes.id, req.params.id)).returning();
  if (!updated) throw new NotFoundError("Quote not found.");
  if (patch.taxRate != null) {
    await recalculateQuoteTotals(db, req.params.id);
  }
  const [fresh] = await db.select().from(quotes).where(eq(quotes.id, req.params.id)).limit(1);
  await createRequestActivityLog(req, {
    businessId: bid,
    action: "quote.updated",
    entityType: "quote",
    entityId: req.params.id,
    metadata: {
      status: fresh?.status ?? updated.status,
    },
  });
  res.json(fresh ?? updated);
});

quotesRouter.delete("/:id", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const [existing] = await db.select().from(quotes).where(and(eq(quotes.id, req.params.id), eq(quotes.businessId, bid))).limit(1);
  if (!existing) throw new NotFoundError("Quote not found.");
  await db.delete(quoteLineItems).where(eq(quoteLineItems.quoteId, req.params.id));
  await db.delete(quotes).where(eq(quotes.id, req.params.id));
  res.status(204).end();
});

quotesRouter.post("/:id/send", requireAuth, requireTenant, wrapAsync(async (req: Request, res: Response) => {
  const parsed = sendQuoteSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");
  const bid = businessId(req);
  const [existing] = await db
    .select({
      id: quotes.id,
      total: quotes.total,
      vehicleId: quotes.vehicleId,
      clientId: quotes.clientId,
      clientFirstName: clients.firstName,
      clientLastName: clients.lastName,
      clientEmail: clients.email,
      businessName: businesses.name,
      vehicleYear: vehicles.year,
      vehicleMake: vehicles.make,
      vehicleModel: vehicles.model,
    })
    .from(quotes)
    .leftJoin(clients, eq(quotes.clientId, clients.id))
    .leftJoin(vehicles, eq(quotes.vehicleId, vehicles.id))
    .leftJoin(businesses, eq(quotes.businessId, businesses.id))
    .where(and(eq(quotes.id, req.params.id), eq(quotes.businessId, bid)))
    .limit(1);
  if (!existing) throw new NotFoundError("Quote not found.");
  if (!existing.clientEmail?.trim()) {
    logger.warn("Quote send blocked: client email missing", { quoteId: existing.id, businessId: bid });
    await createRequestActivityLog(req, {
      businessId: bid,
      action: "quote.send_failed",
      entityType: "quote",
      entityId: existing.id,
      metadata: {
        recipient: null,
        message: parsed.data.message ?? null,
        deliveryStatus: "missing_email",
        deliveryError: "Client does not have an email address.",
      },
    });
    res.status(400).json({
      message: "Client does not have an email address.",
      code: "EMAIL_MISSING_RECIPIENT",
      deliveryStatus: "missing_email",
      deliveryError: "Client does not have an email address.",
    });
    return;
  }
  if (!isEmailConfigured()) {
    logger.error("Quote send blocked: SMTP is not configured", { quoteId: existing.id, businessId: bid });
    await createRequestActivityLog(req, {
      businessId: bid,
      action: "quote.send_failed",
      entityType: "quote",
      entityId: existing.id,
      metadata: {
        recipient: existing.clientEmail.trim(),
        message: parsed.data.message ?? null,
        deliveryStatus: "smtp_disabled",
        deliveryError: "Transactional email is not configured.",
      },
    });
    res.json({
      ok: false,
      message: "Transactional email is not configured. Set RESEND_* or SMTP_* environment variables.",
      code: "EMAIL_NOT_CONFIGURED",
      deliveryStatus: "smtp_disabled",
      deliveryError: "Transactional email is not configured.",
    });
    return;
  }

  let deliveryError: string | null = null;
  try {
    await sendQuoteEmail({
      to: existing.clientEmail.trim(),
      businessId: bid,
      clientName: `${existing.clientFirstName ?? ""} ${existing.clientLastName ?? ""}`.trim() || "Customer",
      businessName: existing.businessName ?? "Your shop",
      amount: Number(existing.total ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" }),
      vehicle: [existing.vehicleYear, existing.vehicleMake, existing.vehicleModel].filter(Boolean).join(" "),
      quoteUrl: `${process.env.FRONTEND_URL?.trim() ?? ""}/quotes/${existing.id}`,
      message: parsed.data.message ?? null,
    });
  } catch (error) {
    deliveryError = error instanceof Error ? error.message : String(error);
    logger.error("Quote email send failed", { quoteId: existing.id, businessId: bid, error: deliveryError });
    await createRequestActivityLog(req, {
      businessId: bid,
      action: "quote.send_failed",
      entityType: "quote",
      entityId: existing.id,
      metadata: {
        recipient: existing.clientEmail,
        message: parsed.data.message ?? null,
        deliveryStatus: "email_failed",
        deliveryError,
      },
    });
    res.json({
      ok: false,
      message: `Quote email failed to send: ${deliveryError}`,
      code: "EMAIL_SEND_FAILED",
      deliveryStatus: "email_failed",
      deliveryError,
    });
    return;
  }

  const [updated] = await db
    .update(quotes)
    .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
    .where(and(eq(quotes.id, req.params.id), eq(quotes.businessId, bid)))
    .returning();
  if (!updated) throw new NotFoundError("Quote not found.");
  await createRequestActivityLog(req, {
    businessId: bid,
    action: "quote.sent",
    entityType: "quote",
    entityId: updated.id,
    metadata: {
      status: updated.status,
      recipient: existing.clientEmail ?? null,
      message: parsed.data.message ?? null,
      deliveryStatus: "emailed",
      deliveryError: null,
    },
  });
  res.json({ ...updated, deliveryStatus: "emailed", deliveryError: null });
}));

quotesRouter.post("/:id/sendFollowUp", requireAuth, requireTenant, wrapAsync(async (req: Request, res: Response) => {
  const parsed = sendQuoteSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");
  const bid = businessId(req);
  const [existing] = await db
    .select({
      id: quotes.id,
      total: quotes.total,
      vehicleId: quotes.vehicleId,
      clientFirstName: clients.firstName,
      clientLastName: clients.lastName,
      clientEmail: clients.email,
      businessName: businesses.name,
      vehicleYear: vehicles.year,
      vehicleMake: vehicles.make,
      vehicleModel: vehicles.model,
    })
    .from(quotes)
    .leftJoin(clients, eq(quotes.clientId, clients.id))
    .leftJoin(vehicles, eq(quotes.vehicleId, vehicles.id))
    .leftJoin(businesses, eq(quotes.businessId, businesses.id))
    .where(and(eq(quotes.id, req.params.id), eq(quotes.businessId, bid)))
    .limit(1);
  if (!existing) throw new NotFoundError("Quote not found.");
  if (!existing.clientEmail?.trim()) {
    logger.warn("Quote follow-up blocked: client email missing", { quoteId: existing.id, businessId: bid });
    await createRequestActivityLog(req, {
      businessId: bid,
      action: "quote.follow_up_failed",
      entityType: "quote",
      entityId: existing.id,
      metadata: {
        recipient: null,
        message: parsed.data.message ?? null,
        deliveryStatus: "missing_email",
        deliveryError: "Client does not have an email address.",
      },
    });
    res.status(400).json({
      message: "Client does not have an email address.",
      code: "EMAIL_MISSING_RECIPIENT",
      deliveryStatus: "missing_email",
      deliveryError: "Client does not have an email address.",
    });
    return;
  }
  if (!isEmailConfigured()) {
    logger.error("Quote follow-up blocked: SMTP is not configured", { quoteId: existing.id, businessId: bid });
    await createRequestActivityLog(req, {
      businessId: bid,
      action: "quote.follow_up_failed",
      entityType: "quote",
      entityId: existing.id,
      metadata: {
        recipient: existing.clientEmail.trim(),
        message: parsed.data.message ?? null,
        deliveryStatus: "smtp_disabled",
        deliveryError: "Transactional email is not configured.",
      },
    });
    res.json({
      ok: false,
      message: "Transactional email is not configured. Set RESEND_* or SMTP_* environment variables.",
      code: "EMAIL_NOT_CONFIGURED",
      deliveryStatus: "smtp_disabled",
      deliveryError: "Transactional email is not configured.",
    });
    return;
  }

  let deliveryError: string | null = null;
  try {
    await sendQuoteFollowUpEmail({
      to: existing.clientEmail.trim(),
      businessId: bid,
      clientName: `${existing.clientFirstName ?? ""} ${existing.clientLastName ?? ""}`.trim() || "Customer",
      businessName: existing.businessName ?? "Your shop",
      amount: Number(existing.total ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" }),
      vehicle: [existing.vehicleYear, existing.vehicleMake, existing.vehicleModel].filter(Boolean).join(" "),
      quoteUrl: `${process.env.FRONTEND_URL?.trim() ?? ""}/quotes/${existing.id}`,
      message: parsed.data.message ?? null,
    });
  } catch (error) {
    deliveryError = error instanceof Error ? error.message : String(error);
    logger.error("Quote follow-up email failed", { quoteId: existing.id, businessId: bid, error: deliveryError });
    await createRequestActivityLog(req, {
      businessId: bid,
      action: "quote.follow_up_failed",
      entityType: "quote",
      entityId: existing.id,
      metadata: {
        recipient: existing.clientEmail,
        message: parsed.data.message ?? null,
        deliveryStatus: "email_failed",
        deliveryError,
      },
    });
    res.json({
      ok: false,
      message: `Quote follow-up email failed to send: ${deliveryError}`,
      code: "EMAIL_SEND_FAILED",
      deliveryStatus: "email_failed",
      deliveryError,
    });
    return;
  }

  const [updated] = await db
    .update(quotes)
    .set({ followUpSentAt: new Date(), updatedAt: new Date() })
    .where(and(eq(quotes.id, req.params.id), eq(quotes.businessId, bid)))
    .returning();
  if (!updated) throw new NotFoundError("Quote not found.");
  await createRequestActivityLog(req, {
    businessId: bid,
    action: "quote.follow_up_recorded",
    entityType: "quote",
    entityId: updated.id,
    metadata: {
      followUpSentAt: updated.followUpSentAt,
      recipient: existing.clientEmail ?? null,
      message: parsed.data.message ?? null,
      deliveryStatus: "emailed",
      deliveryError: null,
    },
  });
  res.json({ ...updated, deliveryStatus: "emailed", deliveryError: null });
}));

const scheduleFromQuoteSchema = z.object({
  startTime: z.string().datetime(),
  endTime: z.string().datetime().optional(),
  title: z.string().optional(),
  assignedStaffId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
});

/** Create an appointment from a quote and link the quote (status → accepted). */
quotesRouter.post("/:id/schedule", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const quoteId = req.params.id;
  const parsed = scheduleFromQuoteSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");

  const [quote] = await db.select().from(quotes).where(and(eq(quotes.id, quoteId), eq(quotes.businessId, bid))).limit(1);
  if (!quote) throw new NotFoundError("Quote not found.");
  if (!quote.vehicleId) throw new BadRequestError("Quote must have a vehicle before scheduling.");
  const quoteVehicleId = quote.vehicleId;
  if (quote.status === "declined" || quote.status === "expired") throw new BadRequestError("Cannot schedule this quote.");

  const [client] = await db.select().from(clients).where(and(eq(clients.id, quote.clientId), eq(clients.businessId, bid))).limit(1);
  if (!client) throw new BadRequestError("Client not found.");
  const [vehicle] = await db
    .select()
    .from(vehicles)
    .where(and(eq(vehicles.id, quoteVehicleId), eq(vehicles.businessId, bid), eq(vehicles.clientId, quote.clientId)))
    .limit(1);
  if (!vehicle) throw new BadRequestError("Vehicle not found for this quote.");

  if (parsed.data.assignedStaffId) {
    const [st] = await db.select().from(staff).where(and(eq(staff.id, parsed.data.assignedStaffId), eq(staff.businessId, bid))).limit(1);
    if (!st) throw new BadRequestError("Staff not found.");
  }
  if (parsed.data.locationId) {
    const hasLocation = await locationExistsForBusiness(parsed.data.locationId, bid);
    if (!hasLocation) throw new BadRequestError("Location not found.");
  }

  const startTime = new Date(parsed.data.startTime);
  const endTime = parsed.data.endTime ? new Date(parsed.data.endTime) : null;
  const overlap = await hasAppointmentOverlap({
    businessId: bid,
    startTime,
    endTime,
    assignedStaffId: parsed.data.assignedStaffId ?? null,
    excludeAppointmentId: null,
  });
  if (overlap) {
    throw new ConflictError(
      parsed.data.assignedStaffId
        ? "This staff member already has an appointment in this time slot."
        : "Another appointment overlaps this time slot."
    );
  }

  const apt = await db.transaction(async (tx) => {
    const [a] = await tx
      .insert(appointments)
      .values({
        businessId: bid,
        clientId: quote.clientId,
        vehicleId: quoteVehicleId,
        startTime,
        endTime,
        title: parsed.data.title ?? null,
        assignedStaffId: parsed.data.assignedStaffId ?? null,
        locationId: parsed.data.locationId ?? null,
        totalPrice: quote.total ?? "0",
      })
      .returning();
    if (!a) throw new BadRequestError("Failed to create appointment.");
    await tx.update(quotes).set({ appointmentId: a.id, status: "accepted", updatedAt: new Date() }).where(eq(quotes.id, quoteId));
    return a;
  });
  await createRequestActivityLog(req, {
    businessId: bid,
    action: "quote.scheduled",
    entityType: "quote",
    entityId: quoteId,
    metadata: {
      appointmentId: apt.id,
      startTime: apt.startTime,
    },
  });
  res.status(201).json(apt);
});

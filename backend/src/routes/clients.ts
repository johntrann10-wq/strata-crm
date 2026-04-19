import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { appointments, businesses, clients, invoices, quotes, vehicles } from "../db/schema.js";
import { eq, and, desc, asc, isNull, or, ilike, sql, inArray } from "drizzle-orm";
import { NotFoundError, ForbiddenError, BadRequestError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { requireTenant } from "../middleware/tenant.js";
import { createRateLimiter } from "../middleware/security.js";
import { createRequestActivityLog } from "../lib/activity.js";
import { logger } from "../lib/logger.js";
import { isEmailConfigured } from "../lib/env.js";
import { sendCustomerPortalEmail } from "../lib/email.js";
import { buildPublicAppUrl, createPublicDocumentToken } from "../lib/publicDocumentAccess.js";
import { enqueueQuickBooksCustomerSync } from "../lib/quickbooks.js";
import {
  isImportantLeadStatus,
  parseLeadRecord,
} from "../lib/leads.js";
import { safeCreateNotification } from "../lib/notifications.js";

export const clientsRouter = Router({ mergeParams: true });

function businessId(req: Request): string {
  if (!req.businessId) throw new ForbiddenError("No business.");
  return req.businessId;
}

const emptyToUndefined = (v: unknown) => (v === "" || v === null ? undefined : v);

const createSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.preprocess(emptyToUndefined, z.string().email().optional()),
  phone: z.preprocess(emptyToUndefined, z.string().optional()),
  address: z.preprocess(emptyToUndefined, z.string().optional()),
  city: z.preprocess(emptyToUndefined, z.string().optional()),
  state: z.preprocess(emptyToUndefined, z.string().optional()),
  zip: z.preprocess(emptyToUndefined, z.string().optional()),
  notes: z.preprocess(emptyToUndefined, z.string().optional()),
  internalNotes: z.preprocess(emptyToUndefined, z.string().optional()),
  marketingOptIn: z.boolean().optional(),
});
/** Nullable optional fields clear the column when PATCH sends null (after empty-string → null normalization). */
const updateSchema = z
  .object({
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    email: z.union([z.string().email(), z.null()]).optional(),
    phone: z.union([z.string(), z.null()]).optional(),
    address: z.union([z.string(), z.null()]).optional(),
    city: z.union([z.string(), z.null()]).optional(),
    state: z.union([z.string(), z.null()]).optional(),
    zip: z.union([z.string(), z.null()]).optional(),
    notes: z.union([z.string(), z.null()]).optional(),
    internalNotes: z.union([z.string(), z.null()]).optional(),
    marketingOptIn: z.boolean().optional(),
  })
  .strict();

const sendPortalSchema = z.object({
  message: z.string().max(2000).optional(),
  recipientEmail: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().email().optional()
  ),
  recipientName: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().max(120).optional()
  ),
});

const clientPortalLimiter = createRateLimiter({
  id: "client_portal_send",
  windowMs: 10 * 60 * 1000,
  max: 6,
  message: "Too many portal emails sent. Please wait a bit before trying again.",
  key: ({ businessId, userId, ip, path }) => `email:client-portal:${businessId ?? "none"}:${userId ?? ip}:${path}`,
});

/** Empty strings clear optional text fields on PATCH. */
function normalizeClientPatchBody(body: unknown): unknown {
  if (body == null || typeof body !== "object") return body;
  const o = { ...(body as Record<string, unknown>) };
  for (const k of ["email", "phone", "address", "city", "state", "zip", "notes", "internalNotes"]) {
    if (o[k] === "") o[k] = null;
  }
  return o;
}

async function resolveClientPortalToken(clientId: string, businessId: string) {
  const [quote] = await db
    .select({
      id: quotes.id,
      updatedAt: quotes.updatedAt,
      createdAt: quotes.createdAt,
      publicTokenVersion: quotes.publicTokenVersion,
    })
    .from(quotes)
    .where(
      and(
        eq(quotes.clientId, clientId),
        eq(quotes.businessId, businessId),
        inArray(quotes.status, ["draft", "sent", "accepted"])
      )
    )
    .orderBy(desc(quotes.updatedAt), desc(quotes.createdAt))
    .limit(1);
  if (quote?.id) {
    return createPublicDocumentToken({
      kind: "quote",
      entityId: quote.id,
      businessId,
      tokenVersion: quote.publicTokenVersion ?? 1,
    });
  }

  const [invoice] = await db
    .select({
      id: invoices.id,
      updatedAt: invoices.updatedAt,
      createdAt: invoices.createdAt,
      publicTokenVersion: invoices.publicTokenVersion,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.clientId, clientId),
        eq(invoices.businessId, businessId),
        inArray(invoices.status, ["draft", "sent", "partial", "paid"])
      )
    )
    .orderBy(desc(invoices.updatedAt), desc(invoices.createdAt))
    .limit(1);
  if (invoice?.id) {
    return createPublicDocumentToken({
      kind: "invoice",
      entityId: invoice.id,
      businessId,
      tokenVersion: invoice.publicTokenVersion ?? 1,
    });
  }

  const [appointment] = await db
    .select({
      id: appointments.id,
      updatedAt: appointments.updatedAt,
      startTime: appointments.startTime,
      publicTokenVersion: appointments.publicTokenVersion,
    })
    .from(appointments)
    .where(and(eq(appointments.clientId, clientId), eq(appointments.businessId, businessId)))
    .orderBy(desc(appointments.updatedAt), desc(appointments.startTime))
    .limit(1);
  if (appointment?.id) {
    return createPublicDocumentToken({
      kind: "appointment",
      entityId: appointment.id,
      businessId,
      tokenVersion: appointment.publicTokenVersion ?? 1,
    });
  }

  return null;
}

clientsRouter.get("/", requireAuth, requireTenant, requirePermission("customers.read"), async (req: Request, res: Response) => {
  const bid = businessId(req);
  const first = req.query.first != null ? Math.min(Math.max(Number(req.query.first), 1), 100) : 50;
  const includeDeleted = req.query.includeDeleted === "true";
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

  let orderBy = desc(clients.createdAt);
  if (typeof req.query.sort === "string" && req.query.sort.trim()) {
    try {
      const s = JSON.parse(req.query.sort) as { createdAt?: string };
      if (s?.createdAt === "Ascending") orderBy = asc(clients.createdAt);
    } catch {
      /* ignore */
    }
  }

  const tenantFilter = includeDeleted ? eq(clients.businessId, bid) : and(eq(clients.businessId, bid), isNull(clients.deletedAt));

  const whereClause =
    search.length > 0
      ? and(
          tenantFilter,
          or(
            ilike(clients.firstName, `%${search}%`),
            ilike(clients.lastName, `%${search}%`),
            ilike(clients.email, `%${search}%`),
            ilike(clients.phone, `%${search}%`),
            sql`(${clients.firstName} || ' ' || ${clients.lastName}) ilike ${`%${search}%`}`
          )
        )
      : tenantFilter;

  const list = await db.select().from(clients).where(whereClause!).orderBy(orderBy).limit(first);
  res.json({ records: list });
});

clientsRouter.get("/:id", requireAuth, requireTenant, requirePermission("customers.read"), async (req: Request, res: Response) => {
  const [row] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, req.params.id), eq(clients.businessId, businessId(req))))
    .limit(1);
  if (!row) throw new NotFoundError("Client not found.");
  res.json(row);
});

clientsRouter.post("/", requireAuth, requireTenant, requirePermission("customers.write"), async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");
  const bid = businessId(req);
  const [created] = await db
    .insert(clients)
    .values({
      businessId: bid,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      email: parsed.data.email ?? null,
      phone: parsed.data.phone ?? null,
      address: parsed.data.address ?? null,
      city: parsed.data.city ?? null,
      state: parsed.data.state ?? null,
      zip: parsed.data.zip ?? null,
      notes: parsed.data.notes ?? null,
      internalNotes: parsed.data.internalNotes ?? null,
      marketingOptIn: parsed.data.marketingOptIn ?? true,
    })
    .returning();
  logger.info("Client created", { clientId: created.id, businessId: bid });
  await createRequestActivityLog(req, {
    businessId: bid,
    action: "client.created",
    entityType: "client",
    entityId: created.id,
    metadata: {
      firstName: created.firstName,
      lastName: created.lastName,
      email: created.email,
      phone: created.phone,
    },
  });
  const createdLead = parseLeadRecord(created.notes);
  if (createdLead.isLead) {
    await createRequestActivityLog(req, {
      businessId: bid,
      action: "lead.created",
      entityType: "client",
      entityId: created.id,
      metadata: {
        status: createdLead.status,
        source: createdLead.source,
        serviceInterest: createdLead.serviceInterest || null,
      },
    });
    await safeCreateNotification(
      {
        businessId: bid,
        type: "new_lead",
        title: "New lead captured",
        message:
          `${created.firstName} ${created.lastName}`.trim() +
          (createdLead.serviceInterest?.trim() ? ` asked about ${createdLead.serviceInterest.trim()}.` : " was added to the lead pipeline."),
        entityType: "client",
        entityId: created.id,
        bucket: "leads",
        dedupeKey: `lead-created:${created.id}`,
        metadata: {
          leadStatus: createdLead.status,
          leadSource: createdLead.source,
          serviceInterest: createdLead.serviceInterest || null,
          path: `/clients/${encodeURIComponent(created.id)}?from=${encodeURIComponent("/leads")}`,
        },
      },
      { source: "clients.create" }
    );
  }
  void enqueueQuickBooksCustomerSync({
    businessId: bid,
    clientId: created.id,
    userId: req.userId ?? null,
  }).catch((error) => {
    logger.warn("QuickBooks customer sync enqueue failed after client create", {
      businessId: bid,
      clientId: created.id,
      error,
    });
  });
  res.status(201).json(created);
});

clientsRouter.patch("/:id", requireAuth, requireTenant, requirePermission("customers.write"), async (req: Request, res: Response) => {
  const bid = businessId(req);
  const [existing] = await db.select().from(clients).where(and(eq(clients.id, req.params.id), eq(clients.businessId, bid))).limit(1);
  if (!existing) throw new NotFoundError("Client not found.");
  const existingLead = parseLeadRecord(existing.notes);
  const parsed = updateSchema.safeParse(normalizeClientPatchBody(req.body));
  if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");
  const patch = { ...parsed.data };
  const [updated] = await db
    .update(clients)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(clients.id, req.params.id))
    .returning();
  logger.info("Client updated", { clientId: updated.id, businessId: bid });
  await createRequestActivityLog(req, {
    businessId: bid,
    action: "client.updated",
    entityType: "client",
    entityId: updated.id,
    metadata: {
      firstName: updated.firstName,
      lastName: updated.lastName,
      email: updated.email,
      phone: updated.phone,
    },
  });
  const updatedLead = parseLeadRecord(updated.notes);
  if (!existingLead.isLead && updatedLead.isLead) {
    await createRequestActivityLog(req, {
      businessId: bid,
      action: "lead.created",
      entityType: "client",
      entityId: updated.id,
      metadata: {
        status: updatedLead.status,
        source: updatedLead.source,
        serviceInterest: updatedLead.serviceInterest || null,
        createdFrom: "client_update",
      },
    });
    await safeCreateNotification(
      {
        businessId: bid,
        type: "new_lead",
        title: "Lead added to the pipeline",
        message:
          `${updated.firstName} ${updated.lastName}`.trim() +
          (updatedLead.serviceInterest?.trim() ? ` is now tracked for ${updatedLead.serviceInterest.trim()}.` : " is now being tracked as a lead."),
        entityType: "client",
        entityId: updated.id,
        bucket: "leads",
        dedupeKey: `lead-created:${updated.id}`,
        metadata: {
          leadStatus: updatedLead.status,
          leadSource: updatedLead.source,
          serviceInterest: updatedLead.serviceInterest || null,
          path: `/clients/${encodeURIComponent(updated.id)}?from=${encodeURIComponent("/leads")}`,
        },
      },
      { source: "clients.update.promoted_to_lead" }
    );
  } else if (
    updatedLead.isLead &&
    existingLead.status !== updatedLead.status &&
    isImportantLeadStatus(updatedLead.status)
  ) {
    await createRequestActivityLog(req, {
      businessId: bid,
      action: "lead.status_changed",
      entityType: "client",
      entityId: updated.id,
      metadata: {
        fromStatus: existingLead.status,
        toStatus: updatedLead.status,
        source: updatedLead.source,
      },
    });
    const title =
      updatedLead.status === "quoted"
        ? "Lead quoted"
        : updatedLead.status === "booked"
          ? "Lead booked"
          : updatedLead.status === "converted"
            ? "Lead converted"
            : updatedLead.status === "lost"
              ? "Lead marked lost"
              : "Lead updated";
    await safeCreateNotification(
      {
        businessId: bid,
        type: "lead_status_changed",
        title,
        message:
          `${updated.firstName} ${updated.lastName}`.trim() +
          ` moved from ${existingLead.status.replace(/_/g, " ")} to ${updatedLead.status.replace(/_/g, " ")}.`,
        entityType: "client",
        entityId: updated.id,
        bucket: "leads",
        dedupeKey: `lead-status:${updated.id}:${updatedLead.status}`,
        metadata: {
          leadStatus: updatedLead.status,
          previousLeadStatus: existingLead.status,
          leadSource: updatedLead.source,
          path: `/clients/${encodeURIComponent(updated.id)}?from=${encodeURIComponent("/leads")}`,
        },
      },
      { source: "clients.update.lead_status" }
    );
  }
  void enqueueQuickBooksCustomerSync({
    businessId: bid,
    clientId: updated.id,
    userId: req.userId ?? null,
  }).catch((error) => {
    logger.warn("QuickBooks customer sync enqueue failed after client update", {
      businessId: bid,
      clientId: updated.id,
      error,
    });
  });
  res.json(updated);
});

clientsRouter.post(
  "/:id/sendPortal",
  clientPortalLimiter.middleware,
  requireAuth,
  requireTenant,
  requirePermission("customers.write"),
  async (req: Request, res: Response) => {
  const bid = businessId(req);
  const parsed = sendPortalSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");

  const [existing] = await db
    .select({
      id: clients.id,
      firstName: clients.firstName,
      lastName: clients.lastName,
      email: clients.email,
      businessName: businesses.name,
    })
    .from(clients)
    .leftJoin(businesses, eq(clients.businessId, businesses.id))
    .where(and(eq(clients.id, req.params.id), eq(clients.businessId, bid)))
    .limit(1);
  if (!existing) throw new NotFoundError("Client not found.");

  const recipientEmail = parsed.data.recipientEmail?.trim() || existing.email?.trim() || null;
  const recipientName =
    parsed.data.recipientName?.trim() ||
    `${existing.firstName ?? ""} ${existing.lastName ?? ""}`.trim() ||
    "Customer";

  if (!recipientEmail) {
    await createRequestActivityLog(req, {
      businessId: bid,
      action: "client.portal_send_failed",
      entityType: "client",
      entityId: existing.id,
      metadata: {
        recipient: null,
        recipientName,
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
    await createRequestActivityLog(req, {
      businessId: bid,
      action: "client.portal_send_failed",
      entityType: "client",
      entityId: existing.id,
      metadata: {
        recipient: recipientEmail,
        recipientName,
        message: parsed.data.message ?? null,
        deliveryStatus: "smtp_disabled",
        deliveryError: "Transactional email is not configured.",
      },
    });
    res.status(503).json({
      ok: false,
      message: "Transactional email is not configured. Set RESEND_* or SMTP_* environment variables.",
      code: "EMAIL_NOT_CONFIGURED",
      deliveryStatus: "smtp_disabled",
      deliveryError: "Transactional email is not configured.",
    });
    return;
  }

  const portalToken = await resolveClientPortalToken(existing.id, bid);
  if (!portalToken) {
    res.status(400).json({
      ok: false,
      message: "Send a quote, invoice, or appointment to this client first so Strata can create a secure customer hub link.",
      code: "PORTAL_LINK_UNAVAILABLE",
      deliveryStatus: "missing_source_document",
      deliveryError: "No customer-facing records are available for this client yet.",
    });
    return;
  }

  let deliveryError: string | null = null;
  try {
    await sendCustomerPortalEmail({
      to: recipientEmail,
      businessId: bid,
      clientName: recipientName,
      businessName: existing.businessName ?? "Your shop",
      portalUrl: buildPublicAppUrl(`/portal/${encodeURIComponent(portalToken)}`),
      message: parsed.data.message ?? null,
    });
  } catch (error) {
    deliveryError = error instanceof Error ? error.message : String(error);
    logger.error("Customer hub email send failed", { clientId: existing.id, businessId: bid, error: deliveryError });
    await createRequestActivityLog(req, {
      businessId: bid,
      action: "client.portal_send_failed",
      entityType: "client",
      entityId: existing.id,
      metadata: {
        recipient: recipientEmail,
        recipientName,
        message: parsed.data.message ?? null,
        deliveryStatus: "email_failed",
        deliveryError,
      },
    });
    res.status(502).json({
      ok: false,
      message: `Customer hub email failed to send: ${deliveryError}`,
      code: "EMAIL_SEND_FAILED",
      deliveryStatus: "email_failed",
      deliveryError,
    });
    return;
  }

  await createRequestActivityLog(req, {
    businessId: bid,
    action: "client.portal_sent",
    entityType: "client",
    entityId: existing.id,
    metadata: {
      recipient: recipientEmail,
      recipientName,
      message: parsed.data.message ?? null,
      deliveryStatus: "emailed",
      deliveryError: null,
    },
  });

  res.json({ ok: true, deliveryStatus: "emailed", deliveryError: null, recipient: recipientEmail, recipientName });
});

/** Soft-delete client and cascade to vehicles (set deletedAt on all client vehicles). */
clientsRouter.delete("/:id", requireAuth, requireTenant, requirePermission("customers.write"), async (req: Request, res: Response) => {
  const bid = businessId(req);
  const [existing] = await db.select().from(clients).where(and(eq(clients.id, req.params.id), eq(clients.businessId, bid))).limit(1);
  if (!existing) throw new NotFoundError("Client not found.");
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(clients)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(clients.id, req.params.id), eq(clients.businessId, bid)));
    await tx
      .update(vehicles)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(vehicles.clientId, req.params.id), eq(vehicles.businessId, bid)));
  });
  const [updated] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, req.params.id), eq(clients.businessId, bid)))
    .limit(1);
  logger.info("Client archived", { clientId: req.params.id, businessId: bid });
  await createRequestActivityLog(req, {
    businessId: bid,
    action: "client.archived",
    entityType: "client",
    entityId: req.params.id,
    metadata: {
      firstName: existing.firstName,
      lastName: existing.lastName,
      deletedAt: now.toISOString(),
    },
  });
  res.json(updated ?? existing);
});

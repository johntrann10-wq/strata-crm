import express, { type Request, type Response } from "express";
import { z } from "zod";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  appointmentServices,
  appointments,
  activityLogs,
  businesses,
  clients,
  invoices,
  quotes,
  serviceAddonLinks,
  services,
  vehicles,
} from "../db/schema.js";
import { wrapAsync } from "../lib/asyncHandler.js";
import { createActivityLog } from "../lib/activity.js";
import { BadRequestError, NotFoundError } from "../lib/errors.js";
import { getAppointmentFinanceSummaryMap } from "../lib/appointmentFinance.js";
import { getActiveInvoicePaymentTotal } from "../lib/invoicePayments.js";
import { calculateAppointmentFinanceTotals } from "../lib/revenueTotals.js";
import { safeCreateNotification } from "../lib/notifications.js";
import { createRateLimiter } from "../middleware/security.js";
import {
  buildPublicAppUrl,
  buildPublicDocumentUrl,
  createPublicDocumentToken,
  isPublicDocumentTokenCurrent,
  verifyAnyPublicDocumentToken,
  type PublicDocumentKind,
  type PublicDocumentTokenPayload,
} from "../lib/publicDocumentAccess.js";
import { retrieveConnectAccount } from "../lib/stripe.js";

export const portalRouter = express.Router();

const publicPortalAddonRequestLimiter = createRateLimiter({
  id: "public_portal_addon_request",
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: "Too many add-on requests. Please wait a bit before trying again.",
  key: ({ ip, path }) => `public:portal-addon:${ip}:${path}`,
});

const portalAddonRequestSchema = z.object({
  addonServiceId: z.string().uuid(),
});

function toMoneyNumber(value: number | string | null | undefined): number {
  if (value == null || value === "") return 0;
  const normalized = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(normalized) ? normalized : 0;
}

function getDisplayedAppointmentPortalAmount(row: {
  subtotal?: number | string | null;
  taxRate?: number | string | null;
  taxAmount?: number | string | null;
  applyTax?: boolean | null;
  adminFeeRate?: number | string | null;
  adminFeeAmount?: number | string | null;
  applyAdminFee?: boolean | null;
  totalPrice?: number | string | null;
}): number {
  const subtotal = Math.max(0, toMoneyNumber(row.subtotal));
  const storedTotal = Math.max(0, toMoneyNumber(row.totalPrice));
  if (subtotal <= 0) return storedTotal;

  const computed = calculateAppointmentFinanceTotals({
    subtotal,
    taxRate: toMoneyNumber(row.taxRate),
    applyTax: Boolean(row.applyTax),
    adminFeeRate: toMoneyNumber(row.adminFeeRate),
    applyAdminFee: Boolean(row.applyAdminFee),
  });

  const adminFeeAmount =
    row.applyAdminFee === true
      ? row.adminFeeAmount != null
        ? Math.max(0, toMoneyNumber(row.adminFeeAmount))
        : computed.adminFeeAmount
      : 0;
  const taxableSubtotal = subtotal + adminFeeAmount;
  const taxAmount =
    row.applyTax === true
      ? row.taxAmount != null
        ? Math.max(0, toMoneyNumber(row.taxAmount))
        : taxableSubtotal * (toMoneyNumber(row.taxRate) / 100)
      : 0;

  return Math.max(0, Number((subtotal + adminFeeAmount + taxAmount).toFixed(2)));
}

type PortalReferenceDocument = {
  kind: PublicDocumentKind;
  id: string;
  title: string;
  status: string;
  url: string;
};

type PortalAppointmentServiceLine = {
  id: string;
  appointmentId: string;
  serviceId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  durationMinutes: number | null;
};

type PortalAppointmentAddonSuggestion = {
  id: string;
  name: string;
  price: number;
  durationMinutes: number | null;
  description: string | null;
  featured: boolean;
  showPrice: boolean;
  showDuration: boolean;
  parentServiceId: string;
  parentServiceName: string;
  requestStatus: "available" | "requested";
};

type PortalAddonRequestStatus = "requested" | "resolved";

export type PortalAddonRequestActivityRow = {
  appointmentId: string | null;
  action: string;
  metadata: string | null;
};

function cleanPortalText(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

export function buildPortalAddonRequestStatusMap(rows: PortalAddonRequestActivityRow[]) {
  const requestStatusByAppointment = new Map<string, Map<string, PortalAddonRequestStatus>>();

  for (const row of rows) {
    if (!row.appointmentId) continue;
    let addonServiceId = "";
    try {
      const parsed = row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : {};
      addonServiceId = typeof parsed.addonServiceId === "string" ? parsed.addonServiceId : "";
    } catch {
      addonServiceId = "";
    }
    if (!addonServiceId) continue;
    if (!requestStatusByAppointment.has(row.appointmentId)) {
      requestStatusByAppointment.set(row.appointmentId, new Map<string, PortalAddonRequestStatus>());
    }
    const status = row.action === "appointment.public_addon_requested" ? "requested" : "resolved";
    requestStatusByAppointment.get(row.appointmentId)?.set(addonServiceId, status);
  }

  return requestStatusByAppointment;
}

function formatDocumentTitle(kind: PublicDocumentKind, source: Record<string, unknown>): string {
  if (kind === "invoice") {
    const invoiceNumber = String(source.invoiceNumber ?? "").trim();
    return invoiceNumber ? `Invoice #${invoiceNumber}` : "Invoice";
  }
  if (kind === "quote") {
    return "Estimate";
  }
  const title = String(source.title ?? "").trim();
  return title || "Appointment";
}

function buildDocumentUrl(payload: PublicDocumentTokenPayload & { tokenVersion?: number }): string {
  const token = encodeURIComponent(
    createPublicDocumentToken({
      kind: payload.kind,
      entityId: payload.entityId,
      businessId: payload.businessId,
      tokenVersion: payload.tokenVersion ?? payload.ver,
    })
  );
  if (payload.kind === "quote") {
    return buildPublicDocumentUrl(`/api/quotes/${payload.entityId}/public-html?token=${token}`);
  }
  if (payload.kind === "invoice") {
    return buildPublicDocumentUrl(`/api/invoices/${payload.entityId}/public-html?token=${token}`);
  }
  return buildPublicDocumentUrl(`/api/appointments/${payload.entityId}/public-html?token=${token}`);
}

async function buildPortalAppointmentServiceContext(
  businessId: string,
  appointmentIds: string[]
): Promise<{
  serviceLinesByAppointment: Map<string, PortalAppointmentServiceLine[]>;
  addonSuggestionsByAppointment: Map<string, PortalAppointmentAddonSuggestion[]>;
}> {
  const serviceLinesByAppointment = new Map<string, PortalAppointmentServiceLine[]>();
  const addonSuggestionsByAppointment = new Map<string, PortalAppointmentAddonSuggestion[]>();
  if (appointmentIds.length === 0) {
    return { serviceLinesByAppointment, addonSuggestionsByAppointment };
  }

  const serviceRows = await db
    .select({
      id: appointmentServices.id,
      appointmentId: appointmentServices.appointmentId,
      serviceId: appointmentServices.serviceId,
      quantity: appointmentServices.quantity,
      unitPrice: appointmentServices.unitPrice,
      serviceName: services.name,
      servicePrice: services.price,
      durationMinutes: services.durationMinutes,
    })
    .from(appointmentServices)
    .innerJoin(services, eq(appointmentServices.serviceId, services.id))
    .where(and(inArray(appointmentServices.appointmentId, appointmentIds), eq(services.businessId, businessId)))
    .orderBy(asc(appointmentServices.createdAt));

  const serviceIds = new Set<string>();
  const serviceNameById = new Map<string, string>();
  const existingServiceIdsByAppointment = new Map<string, Set<string>>();

  for (const row of serviceRows) {
    const line: PortalAppointmentServiceLine = {
      id: row.id,
      appointmentId: row.appointmentId,
      serviceId: row.serviceId,
      name: row.serviceName,
      quantity: Number(row.quantity ?? 1),
      unitPrice: toMoneyNumber(row.unitPrice ?? row.servicePrice),
      durationMinutes: row.durationMinutes ?? null,
    };
    serviceLinesByAppointment.set(row.appointmentId, [...(serviceLinesByAppointment.get(row.appointmentId) ?? []), line]);
    serviceIds.add(row.serviceId);
    serviceNameById.set(row.serviceId, row.serviceName);
    if (!existingServiceIdsByAppointment.has(row.appointmentId)) {
      existingServiceIdsByAppointment.set(row.appointmentId, new Set<string>());
    }
    existingServiceIdsByAppointment.get(row.appointmentId)?.add(row.serviceId);
  }

  const parentServiceIds = Array.from(serviceIds);
  if (parentServiceIds.length === 0) {
    return { serviceLinesByAppointment, addonSuggestionsByAppointment };
  }

  const addonLinks = await db
    .select({
      parentServiceId: serviceAddonLinks.parentServiceId,
      addonServiceId: serviceAddonLinks.addonServiceId,
      sortOrder: serviceAddonLinks.sortOrder,
    })
    .from(serviceAddonLinks)
    .where(and(eq(serviceAddonLinks.businessId, businessId), inArray(serviceAddonLinks.parentServiceId, parentServiceIds)))
    .orderBy(asc(serviceAddonLinks.sortOrder), asc(serviceAddonLinks.createdAt));

  const addonServiceIds = Array.from(new Set(addonLinks.map((link) => link.addonServiceId)));
  if (addonServiceIds.length === 0) {
    return { serviceLinesByAppointment, addonSuggestionsByAppointment };
  }

  const addonRows = await db
    .select({
      id: services.id,
      name: services.name,
      price: services.price,
      durationMinutes: services.durationMinutes,
      description: services.bookingDescription,
      featured: services.bookingFeatured,
      hidePrice: services.bookingHidePrice,
      hideDuration: services.bookingHideDuration,
    })
    .from(services)
    .where(and(eq(services.businessId, businessId), eq(services.active, true), inArray(services.id, addonServiceIds)));
  const addonById = new Map(addonRows.map((addon) => [addon.id, addon]));
  const addonRequestActivityRows = await db
    .select({
      appointmentId: activityLogs.entityId,
      action: activityLogs.action,
      metadata: activityLogs.metadata,
      createdAt: activityLogs.createdAt,
    })
    .from(activityLogs)
    .where(
      and(
        eq(activityLogs.businessId, businessId),
        eq(activityLogs.entityType, "appointment"),
        inArray(activityLogs.entityId, appointmentIds),
        sql`${activityLogs.action} in (
          'appointment.public_addon_requested',
          'appointment.public_addon_approved',
          'appointment.public_addon_declined'
        )`
      )
    )
    .orderBy(asc(activityLogs.createdAt));
  const requestStatusByAppointment = buildPortalAddonRequestStatusMap(addonRequestActivityRows);

  const linksByParentService = addonLinks.reduce((acc, link) => {
    acc.set(link.parentServiceId, [...(acc.get(link.parentServiceId) ?? []), link]);
    return acc;
  }, new Map<string, typeof addonLinks>());

  for (const [appointmentId, appointmentServiceLines] of serviceLinesByAppointment) {
    const existingIds = existingServiceIdsByAppointment.get(appointmentId) ?? new Set<string>();
    const seenSuggestions = new Set<string>();
    const suggestions: PortalAppointmentAddonSuggestion[] = [];

    for (const line of appointmentServiceLines) {
      for (const link of linksByParentService.get(line.serviceId) ?? []) {
        const addon = addonById.get(link.addonServiceId);
        if (!addon || existingIds.has(addon.id) || seenSuggestions.has(addon.id)) continue;
        const requestStatus = requestStatusByAppointment.get(appointmentId)?.get(addon.id);
        if (requestStatus === "resolved") continue;
        seenSuggestions.add(addon.id);
        suggestions.push({
          id: addon.id,
          name: addon.name,
          price: toMoneyNumber(addon.price),
          durationMinutes: addon.durationMinutes ?? null,
          description: cleanPortalText(addon.description),
          featured: addon.featured === true,
          showPrice: addon.hidePrice !== true,
          showDuration: addon.hideDuration !== true,
          parentServiceId: link.parentServiceId,
          parentServiceName: serviceNameById.get(link.parentServiceId) ?? "Booked service",
          requestStatus: requestStatus === "requested" ? "requested" : "available",
        });
      }
    }

    addonSuggestionsByAppointment.set(
      appointmentId,
      suggestions.sort((left, right) => Number(right.featured) - Number(left.featured) || left.name.localeCompare(right.name))
    );
  }

  return { serviceLinesByAppointment, addonSuggestionsByAppointment };
}

async function resolvePortalReferenceDocument(access: PublicDocumentTokenPayload): Promise<{
  clientId: string;
  currentDocument: PortalReferenceDocument;
}> {
  if (access.kind === "quote") {
    const [quote] = await db
      .select({
        id: quotes.id,
        clientId: quotes.clientId,
        status: quotes.status,
        publicTokenVersion: quotes.publicTokenVersion,
    })
    .from(quotes)
    .where(and(eq(quotes.id, access.entityId), eq(quotes.businessId, access.businessId)))
    .limit(1);
    if (!quote) throw new NotFoundError("Estimate not found.");
    if (!isPublicDocumentTokenCurrent(access, quote.publicTokenVersion)) {
      throw new BadRequestError("This customer hub link is invalid or expired.");
    }
    return {
      clientId: quote.clientId,
      currentDocument: {
        kind: "quote",
        id: quote.id,
        title: "Estimate",
        status: quote.status,
        url: buildDocumentUrl({ ...access, tokenVersion: quote.publicTokenVersion ?? 1 }),
      },
    };
  }

  if (access.kind === "invoice") {
    const [invoice] = await db
      .select({
        id: invoices.id,
        clientId: invoices.clientId,
        status: invoices.status,
        invoiceNumber: invoices.invoiceNumber,
        publicTokenVersion: invoices.publicTokenVersion,
      })
      .from(invoices)
      .where(and(eq(invoices.id, access.entityId), eq(invoices.businessId, access.businessId)))
      .limit(1);
    if (!invoice) throw new NotFoundError("Invoice not found.");
    if (!isPublicDocumentTokenCurrent(access, invoice.publicTokenVersion)) {
      throw new BadRequestError("This customer hub link is invalid or expired.");
    }
    return {
      clientId: invoice.clientId,
      currentDocument: {
        kind: "invoice",
        id: invoice.id,
        title: formatDocumentTitle("invoice", invoice),
        status: invoice.status,
        url: buildDocumentUrl({ ...access, tokenVersion: invoice.publicTokenVersion ?? 1 }),
      },
    };
  }

  const [appointment] = await db
    .select({
      id: appointments.id,
      clientId: appointments.clientId,
      status: appointments.status,
      title: appointments.title,
      publicTokenVersion: appointments.publicTokenVersion,
    })
    .from(appointments)
    .where(and(eq(appointments.id, access.entityId), eq(appointments.businessId, access.businessId)))
    .limit(1);
  if (!appointment) throw new NotFoundError("Appointment not found.");
  if (!isPublicDocumentTokenCurrent(access, appointment.publicTokenVersion)) {
    throw new BadRequestError("This customer hub link is invalid or expired.");
  }
  if (!appointment.clientId) {
    throw new BadRequestError("This appointment does not have a client portal view yet.");
  }
  return {
    clientId: appointment.clientId,
    currentDocument: {
      kind: "appointment",
      id: appointment.id,
      title: formatDocumentTitle("appointment", appointment),
      status: appointment.status,
      url: buildDocumentUrl({ ...access, tokenVersion: appointment.publicTokenVersion ?? 1 }),
    },
  };
}

portalRouter.post(
  "/:token/appointments/:appointmentId/add-on-request",
  publicPortalAddonRequestLimiter.middleware,
  express.json({ limit: "16kb" }),
  wrapAsync(async (req: Request, res: Response) => {
    const token = typeof req.params.token === "string" ? req.params.token.trim() : "";
    const access = verifyAnyPublicDocumentToken(token);
    if (!access) throw new BadRequestError("This customer hub link is invalid or expired.");

    const parsed = portalAddonRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? "Invalid add-on request.");

    const { clientId } = await resolvePortalReferenceDocument(access);
    const [appointment] = await db
      .select({
        id: appointments.id,
        title: appointments.title,
        status: appointments.status,
        startTime: appointments.startTime,
        clientFirstName: clients.firstName,
        clientLastName: clients.lastName,
        clientEmail: clients.email,
        clientPhone: clients.phone,
      })
      .from(appointments)
      .leftJoin(clients, and(eq(appointments.clientId, clients.id), eq(clients.businessId, access.businessId)))
      .where(
        and(
          eq(appointments.id, req.params.appointmentId),
          eq(appointments.businessId, access.businessId),
          eq(appointments.clientId, clientId)
        )
      )
      .limit(1);

    if (!appointment) throw new NotFoundError("Appointment not found.");
    if (!["scheduled", "confirmed", "in_progress"].includes(appointment.status)) {
      throw new BadRequestError("Add-ons can only be requested for active upcoming appointments.");
    }

    const currentServiceRows = await db
      .select({
        serviceId: appointmentServices.serviceId,
        serviceName: services.name,
      })
      .from(appointmentServices)
      .innerJoin(services, eq(appointmentServices.serviceId, services.id))
      .where(and(eq(appointmentServices.appointmentId, appointment.id), eq(services.businessId, access.businessId)));

    const currentServiceIds = currentServiceRows.map((row) => row.serviceId);
    if (currentServiceIds.length === 0) {
      throw new BadRequestError("This appointment does not have any services that support add-ons yet.");
    }
    if (currentServiceIds.includes(parsed.data.addonServiceId)) {
      throw new BadRequestError("This add-on is already part of the appointment.");
    }

    const [addon] = await db
      .select({
        id: services.id,
        name: services.name,
        price: services.price,
        durationMinutes: services.durationMinutes,
      })
      .from(services)
      .where(and(eq(services.id, parsed.data.addonServiceId), eq(services.businessId, access.businessId), eq(services.active, true)))
      .limit(1);
    if (!addon) throw new BadRequestError("This add-on is unavailable.");

    const [link] = await db
      .select({
        parentServiceId: serviceAddonLinks.parentServiceId,
      })
      .from(serviceAddonLinks)
      .where(
        and(
          eq(serviceAddonLinks.businessId, access.businessId),
          eq(serviceAddonLinks.addonServiceId, addon.id),
          inArray(serviceAddonLinks.parentServiceId, currentServiceIds)
        )
      )
      .limit(1);
    if (!link) throw new BadRequestError("This add-on is not available for the booked services.");

    const parentServiceName =
      currentServiceRows.find((row) => row.serviceId === link.parentServiceId)?.serviceName ?? "Booked service";
    const clientName =
      [appointment.clientFirstName, appointment.clientLastName].filter(Boolean).join(" ").trim() || "Customer";

    const [existingRequest] = await db
      .select({ id: activityLogs.id, action: activityLogs.action })
      .from(activityLogs)
      .where(
        and(
          eq(activityLogs.businessId, access.businessId),
          eq(activityLogs.entityType, "appointment"),
          eq(activityLogs.entityId, appointment.id),
          sql`${activityLogs.action} in (
            'appointment.public_addon_requested',
            'appointment.public_addon_approved',
            'appointment.public_addon_declined'
          )`,
          sql`coalesce(${activityLogs.metadata}::json->>'addonServiceId', '') = ${addon.id}`
        )
      )
      .orderBy(desc(activityLogs.createdAt))
      .limit(1);
    if (existingRequest) {
      if (existingRequest.action !== "appointment.public_addon_requested") {
        throw new BadRequestError("The shop has already reviewed this add-on request.");
      }
      res.status(200).json({ ok: true, message: "Add-on request already sent." });
      return;
    }

    await createActivityLog({
      businessId: access.businessId,
      action: "appointment.public_addon_requested",
      entityType: "appointment",
      entityId: appointment.id,
      metadata: {
        source: "customer_hub",
        addonServiceId: addon.id,
        addonName: addon.name,
        addonPrice: toMoneyNumber(addon.price),
        addonDurationMinutes: addon.durationMinutes ?? null,
        parentServiceId: link.parentServiceId,
        parentServiceName,
        appointmentTitle: formatDocumentTitle("appointment", appointment),
        appointmentStartTime: appointment.startTime,
        clientName,
        clientEmail: appointment.clientEmail ?? null,
        clientPhone: appointment.clientPhone ?? null,
      },
    });

    await safeCreateNotification(
      {
        businessId: access.businessId,
        type: "customer_addon_request",
        title: "Customer requested an add-on",
        message: `${clientName} asked to add ${addon.name} to ${formatDocumentTitle("appointment", appointment)}.`,
        entityType: "appointment",
        entityId: appointment.id,
        bucket: "calendar",
        dedupeKey: `customer-addon-request:${appointment.id}:${addon.id}`,
        metadata: {
          source: "customer_hub",
          addonServiceId: addon.id,
          addonName: addon.name,
          addonPrice: toMoneyNumber(addon.price),
          parentServiceId: link.parentServiceId,
          parentServiceName,
          path: `/appointments/${encodeURIComponent(appointment.id)}`,
        },
      },
      { source: "portal.addon-request" }
    );

    res.status(201).json({ ok: true, message: "Add-on request sent." });
  })
);

portalRouter.get(
  "/:token",
  wrapAsync(async (req: Request, res: Response) => {
    const token = typeof req.params.token === "string" ? req.params.token.trim() : "";
    const access = verifyAnyPublicDocumentToken(token);
    if (!access) throw new BadRequestError("This customer hub link is invalid or expired.");

    const { clientId, currentDocument } = await resolvePortalReferenceDocument(access);

    const [business] = await db
      .select({
        id: businesses.id,
        name: businesses.name,
        email: businesses.email,
        phone: businesses.phone,
        stripeConnectAccountId: businesses.stripeConnectAccountId,
      })
      .from(businesses)
      .where(eq(businesses.id, access.businessId))
      .limit(1);
    if (!business) throw new NotFoundError("Business not found.");

    let stripeReady = false;
    if (business.stripeConnectAccountId) {
      const account = await retrieveConnectAccount({ accountId: business.stripeConnectAccountId });
      stripeReady = !!account?.ready;
    }

    const [client] = await db
      .select({
        id: clients.id,
        firstName: clients.firstName,
        lastName: clients.lastName,
        email: clients.email,
        phone: clients.phone,
      })
      .from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.businessId, access.businessId)))
      .limit(1);
    if (!client) throw new NotFoundError("Client not found.");

    const clientVehicles = await db
      .select({
        id: vehicles.id,
        year: vehicles.year,
        make: vehicles.make,
        model: vehicles.model,
        color: vehicles.color,
        licensePlate: vehicles.licensePlate,
      })
      .from(vehicles)
      .where(and(eq(vehicles.clientId, clientId), eq(vehicles.businessId, access.businessId), sql`${vehicles.deletedAt} is null`))
      .orderBy(desc(vehicles.updatedAt))
      .limit(8);

    const activeQuotes = await db
      .select({
        id: quotes.id,
        status: quotes.status,
        total: quotes.total,
        expiresAt: quotes.expiresAt,
        createdAt: quotes.createdAt,
        publicTokenVersion: quotes.publicTokenVersion,
        vehicleYear: vehicles.year,
        vehicleMake: vehicles.make,
        vehicleModel: vehicles.model,
      })
      .from(quotes)
      .leftJoin(vehicles, and(eq(quotes.vehicleId, vehicles.id), eq(vehicles.businessId, access.businessId)))
      .where(
        and(
          eq(quotes.clientId, clientId),
          eq(quotes.businessId, access.businessId),
          inArray(quotes.status, ["draft", "sent", "accepted"])
        )
      )
      .orderBy(desc(quotes.updatedAt))
      .limit(6);

    const invoiceRows = await db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        status: invoices.status,
        total: invoices.total,
        dueDate: invoices.dueDate,
        createdAt: invoices.createdAt,
        publicTokenVersion: invoices.publicTokenVersion,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.clientId, clientId),
          eq(invoices.businessId, access.businessId),
          inArray(invoices.status, ["sent", "partial", "paid"])
        )
      )
      .orderBy(desc(invoices.createdAt))
      .limit(8);

    const unpaidInvoices = (
      await Promise.all(
        invoiceRows.map(async (invoice) => {
          const totalPaid = await getActiveInvoicePaymentTotal(invoice.id);
          return {
            ...invoice,
            balance: Math.max(Number(invoice.total ?? 0) - totalPaid, 0),
          };
        })
      )
    )
      .filter((invoice) => invoice.balance > 0 && invoice.status !== "paid")
      .slice(0, 6);

    const upcomingAppointments = await db
      .select({
        id: appointments.id,
        title: appointments.title,
        status: appointments.status,
        startTime: appointments.startTime,
        subtotal: appointments.subtotal,
        taxRate: appointments.taxRate,
        taxAmount: appointments.taxAmount,
        applyTax: appointments.applyTax,
        adminFeeRate: appointments.adminFeeRate,
        adminFeeAmount: appointments.adminFeeAmount,
        applyAdminFee: appointments.applyAdminFee,
        totalPrice: appointments.totalPrice,
        depositAmount: appointments.depositAmount,
        publicTokenVersion: appointments.publicTokenVersion,
        vehicleYear: vehicles.year,
        vehicleMake: vehicles.make,
        vehicleModel: vehicles.model,
      })
      .from(appointments)
      .leftJoin(vehicles, and(eq(appointments.vehicleId, vehicles.id), eq(vehicles.businessId, access.businessId)))
      .where(
        and(
          eq(appointments.clientId, clientId),
          eq(appointments.businessId, access.businessId),
          gte(appointments.startTime, new Date(Date.now() - 24 * 60 * 60 * 1000)),
          inArray(appointments.status, ["scheduled", "confirmed", "in_progress"])
        )
      )
      .orderBy(asc(appointments.startTime))
      .limit(6);

    const upcomingAppointmentFinance = await getAppointmentFinanceSummaryMap(
      access.businessId,
      upcomingAppointments.map((appointment) => ({
        id: appointment.id,
        totalPrice: getDisplayedAppointmentPortalAmount(appointment),
        depositAmount: appointment.depositAmount,
        paidAt: null,
      }))
    );
    const { serviceLinesByAppointment, addonSuggestionsByAppointment } =
      await buildPortalAppointmentServiceContext(
        access.businessId,
        upcomingAppointments.map((appointment) => appointment.id)
      );

    const recentAppointments = await db
      .select({
        id: appointments.id,
        title: appointments.title,
        status: appointments.status,
        startTime: appointments.startTime,
        subtotal: appointments.subtotal,
        taxRate: appointments.taxRate,
        taxAmount: appointments.taxAmount,
        applyTax: appointments.applyTax,
        adminFeeRate: appointments.adminFeeRate,
        adminFeeAmount: appointments.adminFeeAmount,
        applyAdminFee: appointments.applyAdminFee,
        totalPrice: appointments.totalPrice,
        vehicleYear: vehicles.year,
        vehicleMake: vehicles.make,
        vehicleModel: vehicles.model,
        publicTokenVersion: appointments.publicTokenVersion,
      })
      .from(appointments)
      .leftJoin(vehicles, and(eq(appointments.vehicleId, vehicles.id), eq(vehicles.businessId, access.businessId)))
      .where(
        and(
          eq(appointments.clientId, clientId),
          eq(appointments.businessId, access.businessId),
          sql`${appointments.startTime} < now()`
        )
      )
      .orderBy(desc(appointments.startTime))
      .limit(6);

    res.json({
      business: {
        name: business.name,
        email: business.email,
        phone: business.phone,
      },
      client: {
        firstName: client.firstName,
        lastName: client.lastName,
        email: client.email,
        phone: client.phone,
      },
      currentDocument,
      portalUrl: buildPublicAppUrl(`/portal/${encodeURIComponent(token)}`),
      sections: {
        quotes: activeQuotes.map((quote) => ({
          id: quote.id,
          status: quote.status,
          total: Number(quote.total ?? 0),
          expiresAt: quote.expiresAt,
          createdAt: quote.createdAt,
          vehicleLabel: [quote.vehicleYear, quote.vehicleMake, quote.vehicleModel].filter(Boolean).join(" ") || null,
          url: buildDocumentUrl({
            kind: "quote",
            entityId: quote.id,
            businessId: access.businessId,
            tokenVersion: quote.publicTokenVersion ?? 1,
          }),
        })),
        invoices: unpaidInvoices.map((invoice) => ({
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          status: invoice.status,
          total: Number(invoice.total ?? 0),
          balance: invoice.balance,
          dueDate: invoice.dueDate,
          createdAt: invoice.createdAt,
          url: buildDocumentUrl({
            kind: "invoice",
            entityId: invoice.id,
            businessId: access.businessId,
            tokenVersion: invoice.publicTokenVersion ?? 1,
          }),
          payUrl:
            stripeReady && invoice.balance > 0
              ? buildPublicDocumentUrl(
                  `/api/invoices/${invoice.id}/public-pay?token=${encodeURIComponent(
                    createPublicDocumentToken({
                      kind: "invoice",
                      entityId: invoice.id,
                      businessId: access.businessId,
                      tokenVersion: invoice.publicTokenVersion ?? 1,
                    })
                  )}`
                )
              : null,
        })),
        upcomingAppointments: upcomingAppointments.map((appointment) => {
          const finance = upcomingAppointmentFinance.get(appointment.id);
          const displayedTotalPrice = getDisplayedAppointmentPortalAmount(appointment);
          return {
          id: appointment.id,
          title: formatDocumentTitle("appointment", appointment),
          status: appointment.status,
          startTime: appointment.startTime,
          totalPrice: displayedTotalPrice,
          depositAmount: Number(appointment.depositAmount ?? 0),
          balanceDue: finance?.balanceDue ?? Math.max(0, displayedTotalPrice),
          paidInFull: finance?.paidInFull ?? false,
          depositSatisfied: finance?.depositSatisfied ?? false,
          vehicleLabel:
            [appointment.vehicleYear, appointment.vehicleMake, appointment.vehicleModel].filter(Boolean).join(" ") || null,
          serviceLines: serviceLinesByAppointment.get(appointment.id) ?? [],
          availableAddons: addonSuggestionsByAppointment.get(appointment.id) ?? [],
          url: buildDocumentUrl({
            kind: "appointment",
            entityId: appointment.id,
            businessId: access.businessId,
            tokenVersion: appointment.publicTokenVersion ?? 1,
          }),
          payUrl:
            stripeReady && Number(appointment.depositAmount ?? 0) > 0 && finance?.depositSatisfied !== true
              ? buildPublicDocumentUrl(
                  `/api/appointments/${appointment.id}/public-pay?token=${encodeURIComponent(
                    createPublicDocumentToken({
                      kind: "appointment",
                      entityId: appointment.id,
                      businessId: access.businessId,
                      tokenVersion: appointment.publicTokenVersion ?? 1,
                    })
                  )}`
                )
              : null,
          };
        }),
        recentAppointments: recentAppointments.map((appointment) => ({
          id: appointment.id,
          title: formatDocumentTitle("appointment", appointment),
          status: appointment.status,
          startTime: appointment.startTime,
          totalPrice: getDisplayedAppointmentPortalAmount(appointment),
          vehicleLabel:
            [appointment.vehicleYear, appointment.vehicleMake, appointment.vehicleModel].filter(Boolean).join(" ") || null,
          url: buildDocumentUrl({
            kind: "appointment",
            entityId: appointment.id,
            businessId: access.businessId,
            tokenVersion: appointment.publicTokenVersion ?? 1,
          }),
        })),
        vehicles: clientVehicles.map((vehicle) => ({
          id: vehicle.id,
          label: [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Vehicle",
          color: vehicle.color,
          licensePlate: vehicle.licensePlate,
        })),
      },
    });
  })
);

import express, { type Request, type Response } from "express";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  appointments,
  businesses,
  clients,
  invoices,
  quotes,
  vehicles,
} from "../db/schema.js";
import { wrapAsync } from "../lib/asyncHandler.js";
import { BadRequestError, NotFoundError } from "../lib/errors.js";
import { getAppointmentFinanceSummaryMap } from "../lib/appointmentFinance.js";
import { getActiveInvoicePaymentTotal } from "../lib/invoicePayments.js";
import { calculateAppointmentFinanceTotals } from "../lib/revenueTotals.js";
import {
  buildPublicAppUrl,
  buildPublicDocumentUrl,
  createPublicDocumentToken,
  verifyAnyPublicDocumentToken,
  type PublicDocumentKind,
  type PublicDocumentTokenPayload,
} from "../lib/publicDocumentAccess.js";
import { retrieveConnectAccount } from "../lib/stripe.js";

export const portalRouter = express.Router();

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

function buildDocumentUrl(payload: PublicDocumentTokenPayload): string {
  const token = encodeURIComponent(
    createPublicDocumentToken({
      kind: payload.kind,
      entityId: payload.entityId,
      businessId: payload.businessId,
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
      })
      .from(quotes)
      .where(and(eq(quotes.id, access.entityId), eq(quotes.businessId, access.businessId)))
      .limit(1);
    if (!quote) throw new NotFoundError("Estimate not found.");
    return {
      clientId: quote.clientId,
      currentDocument: {
        kind: "quote",
        id: quote.id,
        title: "Estimate",
        status: quote.status,
        url: buildDocumentUrl(access),
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
      })
      .from(invoices)
      .where(and(eq(invoices.id, access.entityId), eq(invoices.businessId, access.businessId)))
      .limit(1);
    if (!invoice) throw new NotFoundError("Invoice not found.");
    return {
      clientId: invoice.clientId,
      currentDocument: {
        kind: "invoice",
        id: invoice.id,
        title: formatDocumentTitle("invoice", invoice),
        status: invoice.status,
        url: buildDocumentUrl(access),
      },
    };
  }

  const [appointment] = await db
    .select({
      id: appointments.id,
      clientId: appointments.clientId,
      status: appointments.status,
      title: appointments.title,
    })
    .from(appointments)
    .where(and(eq(appointments.id, access.entityId), eq(appointments.businessId, access.businessId)))
    .limit(1);
  if (!appointment) throw new NotFoundError("Appointment not found.");
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
      url: buildDocumentUrl(access),
    },
  };
}

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
          }),
          payUrl:
            invoice.balance > 0
              ? buildPublicDocumentUrl(
                  `/api/invoices/${invoice.id}/public-pay?token=${encodeURIComponent(
                    createPublicDocumentToken({
                      kind: "invoice",
                      entityId: invoice.id,
                      businessId: access.businessId,
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
          url: buildDocumentUrl({
            kind: "appointment",
            entityId: appointment.id,
            businessId: access.businessId,
          }),
          payUrl:
            stripeReady && Number(appointment.depositAmount ?? 0) > 0 && finance?.depositSatisfied !== true
              ? buildPublicDocumentUrl(
                  `/api/appointments/${appointment.id}/public-pay?token=${encodeURIComponent(
                    createPublicDocumentToken({
                      kind: "appointment",
                      entityId: appointment.id,
                      businessId: access.businessId,
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

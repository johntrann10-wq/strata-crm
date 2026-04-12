import { expect, type Page } from "@playwright/test";

type ClientRecord = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

type VehicleRecord = {
  id: string;
  clientId: string;
  year: number;
  make: string;
  model: string;
  color?: string | null;
  licensePlate?: string | null;
};

type StaffRecord = {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  active: boolean;
};

type ServiceRecord = {
  id: string;
  businessId: string;
  name: string;
  active: boolean;
  price: number;
  durationMinutes: number;
  category: string;
  categoryId?: string | null;
  categoryLabel?: string | null;
  notes?: string | null;
  createdAt?: string;
};

type QuoteLineItemRecord = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
};

type QuoteRecord = {
  id: string;
  clientId: string;
  vehicleId?: string | null;
  status: string;
  notes?: string | null;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  sentAt?: string | null;
  followUpSentAt?: string | null;
  acceptedAt?: string | null;
  expiresAt?: string | null;
  appointmentId?: string | null;
  client: ClientRecord | null;
  vehicle: VehicleRecord | null;
  lineItems: { edges: Array<{ node: QuoteLineItemRecord }> };
};

type InvoiceLineItemRecord = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

type PaymentRecord = {
  id: string;
  amount: number;
  method: string;
  paidAt: string;
  createdAt: string;
  notes?: string | null;
  reversedAt?: string | null;
};

type InvoiceRecord = {
  id: string;
  clientId: string;
  appointmentId?: string | null;
  quoteId?: string | null;
  invoiceNumber: string;
  status: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  dueDate?: string | null;
  notes?: string | null;
  paidAt?: string | null;
  lastSentAt?: string | null;
  lastPaidAt?: string | null;
  business?: { id: string };
  client: ClientRecord | null;
  lineItems: InvoiceLineItemRecord[];
  payments: PaymentRecord[];
};

type ActivityLogRecord = {
  id: string;
  type: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: string;
  createdAt: string;
};

type AppointmentRecord = {
  id: string;
  clientId: string;
  vehicleId: string | null;
  quoteId?: string | null;
  assignedStaffId?: string | null;
  title: string;
  startTime: string;
  endTime: string;
  jobStartTime: string | null;
  expectedCompletionTime: string | null;
  pickupReadyTime: string | null;
  vehicleOnSite: boolean;
  jobPhase: string;
  status: string;
  notes: string | null;
  internalNotes: string | null;
  isMobile: boolean;
  mobileAddress: string | null;
  totalPrice: number;
  depositAmount: number | null;
  depositPaid: boolean;
  completedAt: string | null;
  cancelledAt: string | null;
  reminderSent: boolean;
  reviewRequestSent: boolean;
  technicianNotes: string | null;
  rescheduleCount: number;
  invoicedAt: string | null;
  paidAt: string | null;
  client: ClientRecord | null;
  vehicle: VehicleRecord | null;
  assignedStaff: Pick<StaffRecord, "id" | "firstName" | "lastName"> | null;
  business: { id: string };
};

type AppointmentServiceRecord = {
  id: string;
  appointmentId: string;
  serviceId: string;
  quantity: number;
  unitPrice: number;
  service: {
    id: string;
    name: string;
    category: string;
    durationMinutes: number;
  };
};

type BillingMockState = {
  quotes: QuoteRecord[];
  invoices: InvoiceRecord[];
  payments: PaymentRecord[];
  appointments: AppointmentRecord[];
  activityLogs: ActivityLogRecord[];
};

const BUSINESS_ID = "biz-billing";
const USER_ID = "owner-1";
const QA_PERMISSIONS = [
  "dashboard.view",
  "customers.read",
  "vehicles.read",
  "appointments.read",
  "quotes.read",
  "quotes.write",
  "invoices.read",
  "invoices.write",
  "payments.read",
  "payments.write",
];

const client: ClientRecord = {
  id: "client-1",
  firstName: "Avery",
  lastName: "Detail",
  email: "avery@example.com",
  phone: "555-111-2222",
};

const vehicle: VehicleRecord = {
  id: "veh-1",
  clientId: client.id,
  year: 2024,
  make: "BMW",
  model: "M3",
  color: "Black",
  licensePlate: "DETAIL1",
};

const staffMember: StaffRecord = {
  id: "staff-1",
  firstName: "Jamie",
  lastName: "Rivera",
  role: "technician",
  active: true,
};

const serviceCatalog: ServiceRecord[] = [
  {
    id: "svc-1",
    businessId: BUSINESS_ID,
    name: "Exterior detail package",
    active: true,
    price: 199,
    durationMinutes: 180,
    category: "Detailing",
    categoryId: "cat-detailing",
    categoryLabel: "Detailing",
    notes: "Premium exterior detail service",
    createdAt: "2026-03-01T17:00:00.000Z",
  },
];

const seededAppointmentStart = "2026-04-11T16:00:00.000Z";

function toJson(body: unknown) {
  return JSON.stringify(body);
}

function parseBody(route: Parameters<Page["route"]>[1] extends (args: infer A) => any ? A : never): Record<string, any> {
  const postData = route.request().postData();
  return postData ? (JSON.parse(postData) as Record<string, any>) : {};
}

function currency(value: number): number {
  return Number(value.toFixed(2));
}

function getAppointmentCollectedAmount(state: BillingMockState, appointmentId: string): number {
  return currency(
    state.activityLogs
      .filter((entry) => entry.entityType === "appointment" && entry.entityId === appointmentId)
      .reduce((sum, entry) => {
        const parsed = JSON.parse(entry.metadata) as { amount?: number | string | null };
        const entryAmount = currency(Number(parsed.amount ?? 0) || 0);
        if (entry.action === "appointment.deposit_paid") return sum + entryAmount;
        if (entry.action === "appointment.deposit_payment_reversed") return sum - entryAmount;
        return sum;
      }, 0)
  );
}

function pushActivityLog(
  state: BillingMockState,
  entry: Omit<ActivityLogRecord, "id" | "createdAt">
): ActivityLogRecord {
  const record: ActivityLogRecord = {
    id: `activity-${state.activityLogs.length + 1}`,
    createdAt: new Date().toISOString(),
    ...entry,
  };
  state.activityLogs.push(record);
  return record;
}

function buildQuoteRecord(id: string, payload: Record<string, any>): QuoteRecord {
  const lineItems = Array.isArray(payload.lineItems)
    ? payload.lineItems.map((item: Record<string, any>, index: number) => ({
        id: `qli-${id}-${index + 1}`,
        description: String(item.description ?? ""),
        quantity: Number(item.quantity ?? 1) || 1,
        unitPrice: Number(item.unitPrice ?? 0) || 0,
      }))
    : [];

  const subtotal = currency(
    lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  );
  const taxRate = Number(payload.taxRate ?? 0) || 0;
  const taxAmount = currency((subtotal * taxRate) / 100);
  const total = currency(subtotal + taxAmount);

  return {
    id,
    clientId: client.id,
    vehicleId: vehicle.id,
    status: String(payload.status ?? "draft"),
    notes: payload.notes ? String(payload.notes) : null,
    subtotal,
    taxRate,
    taxAmount,
    total,
    sentAt: null,
    followUpSentAt: null,
    acceptedAt: null,
    expiresAt: payload.expiresAt ? String(payload.expiresAt) : null,
    appointmentId: null,
    client,
    vehicle,
    lineItems: {
      edges: lineItems.map((item) => ({ node: item })),
    },
  };
}

function buildInvoiceRecord(id: string, payload: Record<string, any>): InvoiceRecord {
  const lineItems = Array.isArray(payload.lineItems)
    ? payload.lineItems.map((item: Record<string, any>, index: number) => {
        const quantity = Number(item.quantity ?? 1) || 1;
        const unitPrice = Number(item.unitPrice ?? 0) || 0;
        return {
          id: `ili-${id}-${index + 1}`,
          description: String(item.description ?? ""),
          quantity,
          unitPrice,
          total: currency(quantity * unitPrice),
        };
      })
    : [];

  const subtotal = currency(lineItems.reduce((sum, item) => sum + item.total, 0));
  const taxRate = Number(payload.taxRate ?? 0) || 0;
  const taxAmount = currency((subtotal * taxRate) / 100);
  const discountAmount = Number(payload.discountAmount ?? 0) || 0;
  const total = currency(subtotal + taxAmount - discountAmount);

  return {
    id,
    clientId: client.id,
    appointmentId: payload.appointmentId ? String(payload.appointmentId) : null,
    quoteId: payload.quoteId ? String(payload.quoteId) : null,
    invoiceNumber: `INV-${id.slice(-4).toUpperCase()}`,
    status: String(payload.status ?? "draft"),
    subtotal,
    taxRate,
    taxAmount,
    discountAmount,
    total,
    dueDate: payload.dueDate ? String(payload.dueDate) : null,
    notes: payload.notes ? String(payload.notes) : null,
    paidAt: null,
    lastSentAt: null,
    lastPaidAt: null,
    business: { id: BUSINESS_ID },
    client,
    lineItems,
    payments: [],
  };
}

function serializeInvoiceRecord(state: BillingMockState, invoice: InvoiceRecord) {
  const appointment = invoice.appointmentId
    ? state.appointments.find((entry) => entry.id === invoice.appointmentId) ?? null
    : null;
  const quote = invoice.quoteId
    ? state.quotes.find((entry) => entry.id === invoice.quoteId) ?? null
    : null;

  return {
    ...invoice,
    appointment: appointment
      ? {
          id: appointment.id,
          startTime: appointment.startTime,
          vehicle: appointment.vehicle
            ? {
                year: appointment.vehicle.year,
                make: appointment.vehicle.make,
                model: appointment.vehicle.model,
              }
            : null,
        }
      : null,
    quote: quote
      ? {
          id: quote.id,
          status: quote.status,
          total: quote.total,
        }
      : null,
  };
}

function paidTotal(invoice: InvoiceRecord): number {
  return currency(
    invoice.payments.reduce((sum, payment) => sum + (payment.reversedAt ? 0 : payment.amount), 0)
  );
}

function buildQuoteHtml(quote: QuoteRecord): string {
  const clientName = quote.client ? `${quote.client.firstName} ${quote.client.lastName}` : "Client";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Quote ${quote.id}</title>
  </head>
  <body>
    <main>
      <h1>Estimate for ${clientName}</h1>
      <p>Total ${quote.total.toFixed(2)}</p>
    </main>
  </body>
</html>`;
}

function buildInvoiceHtml(invoice: InvoiceRecord): string {
  const clientName = invoice.client ? `${invoice.client.firstName} ${invoice.client.lastName}` : "Client";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Invoice ${invoice.invoiceNumber}</title>
  </head>
  <body>
    <main>
      <h1>Invoice ${invoice.invoiceNumber}</h1>
      <p>${clientName}</p>
      <p>Total ${invoice.total.toFixed(2)}</p>
    </main>
  </body>
</html>`;
}

function buildAppointmentRecord(id: string, payload: Record<string, any>): AppointmentRecord {
  const startTime = String(payload.startTime ?? new Date().toISOString());
  const durationMinutes = Number(payload.totalDuration ?? payload.durationMinutes ?? 180) || 180;
  const endTime = new Date(new Date(startTime).getTime() + durationMinutes * 60_000).toISOString();
  const vehicleRecord = payload.vehicleId ? vehicle : null;
  const title =
    payload.title ??
    (payload.serviceIds?.length
      ? serviceCatalog
          .filter((service) => (payload.serviceIds as string[]).includes(service.id))
          .map((service) => service.name)
          .join(", ")
      : "Scheduled appointment");

  return {
    id,
    clientId: client.id,
    vehicleId: payload.vehicleId ? String(payload.vehicleId) : null,
    quoteId: payload.quoteId ? String(payload.quoteId) : null,
    assignedStaffId: payload.assignedStaffId ? String(payload.assignedStaffId) : staffMember.id,
    title: String(title),
    startTime,
    endTime,
    jobStartTime: payload.jobStartTime ? String(payload.jobStartTime) : null,
    expectedCompletionTime: payload.expectedCompletionTime ? String(payload.expectedCompletionTime) : null,
    pickupReadyTime: payload.pickupReadyTime ? String(payload.pickupReadyTime) : null,
    vehicleOnSite: Boolean(payload.vehicleOnSite ?? false),
    jobPhase: String(payload.jobPhase ?? "scheduled"),
    status: String(payload.status ?? "scheduled"),
    notes: payload.notes ? String(payload.notes) : null,
    internalNotes: payload.internalNotes ? String(payload.internalNotes) : null,
    isMobile: Boolean(payload.isMobile ?? false),
    mobileAddress: payload.mobileAddress ? String(payload.mobileAddress) : null,
    totalPrice: currency(Number(payload.totalPrice ?? 0) || 0),
    depositAmount: payload.depositAmount != null ? Number(payload.depositAmount) : null,
    depositPaid: Boolean(payload.depositPaid ?? false),
    completedAt: null,
    cancelledAt: null,
    reminderSent: false,
    reviewRequestSent: false,
    technicianNotes: null,
    rescheduleCount: 0,
    invoicedAt: null,
    paidAt: null,
    client,
    vehicle: vehicleRecord,
    assignedStaff: { id: staffMember.id, firstName: staffMember.firstName, lastName: staffMember.lastName },
    business: { id: BUSINESS_ID },
  };
}

export async function mockBillingFlowApp(page: Page): Promise<BillingMockState> {
  const seededAppointment = buildAppointmentRecord("appointment-seeded-1", {
    clientId: client.id,
    vehicleId: vehicle.id,
    title: "Paint correction follow-up",
    startTime: seededAppointmentStart,
    totalPrice: 480,
    depositAmount: 120,
    status: "scheduled",
  });

  const state: BillingMockState = {
    quotes: [],
    invoices: [],
    payments: [],
    appointments: [seededAppointment],
    activityLogs: [],
  };

  await page.route("**/api/auth/sign-in", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: toJson({
        data: {
          id: USER_ID,
          email: "owner@example.com",
          firstName: "Owner",
          lastName: "QA",
          token: "qa-token",
        },
      }),
    });
  });

  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: toJson({
        data: {
          id: USER_ID,
          email: "owner@example.com",
          firstName: "Owner",
          lastName: "QA",
          token: "qa-token",
        },
      }),
    });
  });

  await page.route("**/api/auth/context", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: toJson({
        data: {
          currentBusinessId: BUSINESS_ID,
          businesses: [
            {
              id: BUSINESS_ID,
              name: "QA Detail Shop",
              type: "auto_detailing",
              role: "owner",
              status: "active",
              isDefault: true,
              permissions: QA_PERMISSIONS,
            },
          ],
        },
      }),
    });
  });

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api/, "");
    const method = route.request().method();

    if (path === "/auth/sign-in" || path === "/auth/me" || path === "/auth/context") {
      await route.fallback();
      return;
    }

    if (path === `/users/${USER_ID}`) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: toJson({
          id: USER_ID,
          email: "owner@example.com",
          firstName: "Owner",
          lastName: "QA",
        }),
      });
      return;
    }

    if (path === "/businesses" || path === `/businesses/${BUSINESS_ID}`) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body:
          path === "/businesses"
            ? toJson({ records: [{ id: BUSINESS_ID, name: "QA Detail Shop", type: "auto_detailing", defaultTaxRate: 8.5 }] })
            : toJson({ id: BUSINESS_ID, name: "QA Detail Shop", type: "auto_detailing", onboardingComplete: true, defaultTaxRate: 8.5 }),
      });
      return;
    }

    if (path === "/billing/status") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: toJson({
          status: "active",
          trialEndsAt: null,
          currentPeriodEnd: null,
          billingEnforced: false,
          checkoutConfigured: true,
          portalConfigured: true,
        }),
      });
      return;
    }

    if (path === "/locations") {
      await route.fulfill({ status: 200, contentType: "application/json", body: toJson({ records: [] }) });
      return;
    }

    if (path === "/clients") {
      await route.fulfill({ status: 200, contentType: "application/json", body: toJson({ records: [client] }) });
      return;
    }

    if (path === `/clients/${client.id}`) {
      await route.fulfill({ status: 200, contentType: "application/json", body: toJson(client) });
      return;
    }

    if (path === "/vehicles") {
      const clientId = url.searchParams.get("clientId");
      const records = clientId && clientId !== client.id ? [] : [vehicle];
      await route.fulfill({ status: 200, contentType: "application/json", body: toJson({ records }) });
      return;
    }

    if (path === `/vehicles/${vehicle.id}`) {
      await route.fulfill({ status: 200, contentType: "application/json", body: toJson(vehicle) });
      return;
    }

    if (path === "/services") {
      await route.fulfill({ status: 200, contentType: "application/json", body: toJson({ records: serviceCatalog }) });
      return;
    }

    if (path === "/staff") {
      await route.fulfill({ status: 200, contentType: "application/json", body: toJson({ records: [staffMember] }) });
      return;
    }

    if (path === "/quotes" && method === "GET") {
      const appointmentId = url.searchParams.get("appointmentId");
      const clientId = url.searchParams.get("clientId");
      const vehicleId = url.searchParams.get("vehicleId");
      const records = state.quotes.filter((quote) => {
        if (appointmentId && quote.appointmentId !== appointmentId) return false;
        if (clientId && quote.clientId !== clientId) return false;
        if (vehicleId && quote.vehicleId !== vehicleId) return false;
        return true;
      });
      await route.fulfill({ status: 200, contentType: "application/json", body: toJson({ records }) });
      return;
    }

    if (path === "/quotes" && method === "POST") {
      const payload = parseBody(route);
      const created = buildQuoteRecord(`quote-${state.quotes.length + 1}`, payload);
      state.quotes.push(created);
      await route.fulfill({ status: 201, contentType: "application/json", body: toJson(created) });
      return;
    }

    if (path.startsWith("/quotes/") && method === "GET") {
      const quoteId = path.split("/")[2];
      if (path.endsWith("/html")) {
        const found = state.quotes.find((quote) => quote.id === quoteId);
        await route.fulfill({
          status: found ? 200 : 404,
          contentType: "text/html; charset=utf-8",
          body: found ? buildQuoteHtml(found) : "<html><body>Quote not found</body></html>",
        });
        return;
      }
      const found = state.quotes.find((quote) => quote.id === quoteId);
      await route.fulfill({
        status: found ? 200 : 404,
        contentType: "application/json",
        body: toJson(found ?? { message: "Quote not found" }),
      });
      return;
    }

    if (path.startsWith("/quotes/") && !path.endsWith("/send") && method !== "GET") {
      const quoteId = path.split("/")[2];
      const found = state.quotes.find((quote) => quote.id === quoteId);
      const payload = parseBody(route);
      if (found) {
        Object.assign(found, payload);
        if (payload.status === "accepted" && !found.acceptedAt) {
          found.acceptedAt = new Date().toISOString();
        }
      }
      await route.fulfill({
        status: found ? 200 : 404,
        contentType: "application/json",
        body: toJson(found ?? { message: "Quote not found" }),
      });
      return;
    }

    if (path.endsWith("/send") && path.startsWith("/quotes/") && method === "POST") {
      const quoteId = path.split("/")[2];
      const found = state.quotes.find((quote) => quote.id === quoteId);
      if (found) {
        found.status = "sent";
        found.sentAt = new Date().toISOString();
        pushActivityLog(state, {
          type: "quote.sent",
          action: "quote.sent",
          entityType: "quote",
          entityId: quoteId,
          metadata: toJson({
            deliveryStatus: "emailed",
            recipient: found.client?.email ?? null,
          }),
        });
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: toJson({ deliveryStatus: "emailed", id: quoteId }),
      });
      return;
    }

    if (path === "/quote-line-items") {
      await route.fulfill({ status: 200, contentType: "application/json", body: toJson({ records: [] }) });
      return;
    }

    if (path === "/appointments" && method === "GET") {
      const clientId = url.searchParams.get("clientId");
      const vehicleId = url.searchParams.get("vehicleId");
      const records = state.appointments.filter((appointment) => {
        if (clientId && appointment.clientId !== clientId) return false;
        if (vehicleId && appointment.vehicleId !== vehicleId) return false;
        return true;
      });
      await route.fulfill({ status: 200, contentType: "application/json", body: toJson({ records }) });
      return;
    }

    if (path === "/appointments" && method === "POST") {
      const payload = parseBody(route);
      const created = buildAppointmentRecord(`appointment-${state.appointments.length + 1}`, payload);
      state.appointments.push(created);
      const quoteId = created.quoteId;
      if (quoteId) {
        const quote = state.quotes.find((entry) => entry.id === quoteId);
        if (quote) {
          quote.appointmentId = created.id;
        }
      }
      await route.fulfill({ status: 201, contentType: "application/json", body: toJson({ ...created, deliveryStatus: "emailed" }) });
      return;
    }

    if (path.startsWith("/appointments/") && method === "GET") {
      const appointmentId = path.split("/")[2];
      const found = state.appointments.find((appointment) => appointment.id === appointmentId);
      await route.fulfill({
        status: found ? 200 : 404,
        contentType: "application/json",
        body: toJson(found ?? { message: "Appointment not found" }),
      });
      return;
    }

    if (path.match(/^\/appointments\/[^/]+\/recordDepositPayment$/) && method === "POST") {
      const appointmentId = path.split("/")[2];
      const appointment = state.appointments.find((entry) => entry.id === appointmentId);
      if (!appointment) {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: toJson({ message: "Appointment not found" }),
        });
        return;
      }

      const payload = parseBody(route);
      const amount = currency(Number(payload.amount ?? 0) || 0);
      const paidAt = String(payload.paidAt ?? new Date().toISOString());
      const createdAt = new Date().toISOString();
      const methodLabel = String(payload.method ?? "cash");
      const notes = payload.notes ? String(payload.notes) : null;
      const existingCollected = getAppointmentCollectedAmount(state, appointmentId);
      const nextCollected = currency(existingCollected + amount);
      if (nextCollected >= currency(appointment.totalPrice)) {
        appointment.paidAt = paidAt;
      }

      pushActivityLog(state, {
        type: "appointment.deposit_paid",
        action: "appointment.deposit_paid",
        entityType: "appointment",
        entityId: appointmentId,
        metadata: toJson({
          amount,
          method: methodLabel,
          notes,
          source: "manual",
          paymentType: appointment.depositAmount && appointment.depositAmount > 0 ? "deposit" : "payment",
          paidAt,
        }),
      });

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: toJson({
          success: true,
          appointmentId,
          amount,
          paidAt,
          method: methodLabel,
        }),
      });
      return;
    }

    if (path.match(/^\/appointments\/[^/]+\/reverseDepositPayment$/) && method === "POST") {
      const appointmentId = path.split("/")[2];
      const appointment = state.appointments.find((entry) => entry.id === appointmentId);
      if (!appointment) {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: toJson({ message: "Appointment not found" }),
        });
        return;
      }

      const collectedAmount = getAppointmentCollectedAmount(state, appointmentId);
      const reverseAmount =
        collectedAmount > 0 ? collectedAmount : currency(Number(appointment.depositAmount ?? 0) || 0);

      pushActivityLog(state, {
        type: "appointment.deposit_payment_reversed",
        action: "appointment.deposit_payment_reversed",
        entityType: "appointment",
        entityId: appointmentId,
        metadata: toJson({
          amount: reverseAmount,
          source: "manual",
          paymentType:
            reverseAmount >= currency(appointment.totalPrice) && appointment.totalPrice > 0
              ? "full"
              : appointment.depositAmount && appointment.depositAmount > 0 && reverseAmount <= currency(Number(appointment.depositAmount))
                ? "deposit"
                : "partial",
        }),
      });
      appointment.paidAt = null;

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: toJson({
          success: true,
          appointmentId,
          amount: reverseAmount,
        }),
      });
      return;
    }

    if (path === "/appointment-services" && method === "GET") {
      const appointmentId = url.searchParams.get("appointmentId");
      const appointment = state.appointments.find((entry) => entry.id === appointmentId);
      const serviceIds = appointment?.quoteId
        ? state.quotes
            .find((quote) => quote.id === appointment.quoteId)
            ?.lineItems.edges.map((edge) => serviceCatalog.find((service) => service.name === edge.node.description)?.id)
            .filter(Boolean) as string[] | undefined
        : [];
      const records: AppointmentServiceRecord[] = (serviceIds ?? []).map((serviceId, index) => {
        const service = serviceCatalog.find((entry) => entry.id === serviceId)!;
        return {
          id: `appointment-service-${index + 1}`,
          appointmentId: appointmentId ?? "",
          serviceId,
          quantity: 1,
          unitPrice: service.price,
          service: {
            id: service.id,
            name: service.name,
            category: service.category,
            durationMinutes: service.durationMinutes,
          },
        };
      });
      await route.fulfill({ status: 200, contentType: "application/json", body: toJson({ records }) });
      return;
    }

    if (path === "/invoices" && method === "GET") {
      const appointmentId = url.searchParams.get("appointmentId");
      const quoteId = url.searchParams.get("quoteId");
      const clientId = url.searchParams.get("clientId");
      const records = state.invoices.filter((invoice) => {
        if (appointmentId && invoice.appointmentId !== appointmentId) return false;
        if (quoteId && invoice.quoteId !== quoteId) return false;
        if (clientId && invoice.clientId !== clientId) return false;
        return true;
      }).map((invoice) => serializeInvoiceRecord(state, invoice));
      await route.fulfill({ status: 200, contentType: "application/json", body: toJson({ records }) });
      return;
    }

    if (path === "/invoices" && method === "POST") {
      const payload = parseBody(route);
      const created = buildInvoiceRecord(`invoice-${state.invoices.length + 1}`, payload);
      state.invoices.push(created);
      if (created.appointmentId) {
        const appointment = state.appointments.find((entry) => entry.id === created.appointmentId);
        if (appointment) {
          appointment.invoicedAt = new Date().toISOString();
        }
      }
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: toJson(serializeInvoiceRecord(state, created)),
      });
      return;
    }

    if (path.startsWith("/invoices/") && method === "GET") {
      const invoiceId = path.split("/")[2];
      if (path.endsWith("/html")) {
        const found = state.invoices.find((invoice) => invoice.id === invoiceId);
        await route.fulfill({
          status: found ? 200 : 404,
          contentType: "text/html; charset=utf-8",
          body: found ? buildInvoiceHtml(found) : "<html><body>Invoice not found</body></html>",
        });
        return;
      }
      const found = state.invoices.find((invoice) => invoice.id === invoiceId);
      await route.fulfill({
        status: found ? 200 : 404,
        contentType: "application/json",
        body: toJson(found ? serializeInvoiceRecord(state, found) : { message: "Invoice not found" }),
      });
      return;
    }

    if (path.endsWith("/sendToClient") && path.startsWith("/invoices/") && method === "POST") {
      const invoiceId = path.split("/")[2];
      const found = state.invoices.find((invoice) => invoice.id === invoiceId);
      if (found) {
        found.status = "sent";
        found.lastSentAt = new Date().toISOString();
        pushActivityLog(state, {
          type: "invoice.sent",
          action: "invoice.sent",
          entityType: "invoice",
          entityId: invoiceId,
          metadata: toJson({
            deliveryStatus: "emailed",
            recipient: found.client?.email ?? null,
          }),
        });
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: toJson({ deliveryStatus: "emailed", id: invoiceId }),
      });
      return;
    }

    if (path.match(/^\/invoices\/[^/]+\/void$/) && method === "POST") {
      const invoiceId = path.split("/")[2];
      const found = state.invoices.find((invoice) => invoice.id === invoiceId);
      if (!found) {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: toJson({ message: "Invoice not found" }),
        });
        return;
      }

      found.status = "void";
      found.paidAt = null;
      found.lastPaidAt = null;
      pushActivityLog(state, {
        type: "invoice.voided",
        action: "invoice.voided",
        entityType: "invoice",
        entityId: invoiceId,
        metadata: toJson({
          invoiceNumber: found.invoiceNumber,
          status: "void",
        }),
      });

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: toJson(found),
      });
      return;
    }

    if (path === "/payments" && method === "POST") {
      const payload = parseBody(route);
      const invoice = state.invoices.find((entry) => entry.id === payload.invoiceId);
      const amount = currency(Number(payload.amount ?? 0) || 0);
      const payment: PaymentRecord = {
        id: `payment-${state.payments.length + 1}`,
        amount,
        method: String(payload.method ?? "cash"),
        paidAt: String(payload.paidAt ?? new Date().toISOString()),
        createdAt: new Date().toISOString(),
        notes: payload.notes ? String(payload.notes) : null,
        reversedAt: null,
      };
      state.payments.push(payment);
      if (invoice) {
        invoice.payments = [...invoice.payments, payment];
        const totalPaid = paidTotal(invoice);
        invoice.lastPaidAt = payment.paidAt;
        if (totalPaid >= invoice.total) {
          invoice.status = "paid";
          invoice.paidAt = payment.paidAt;
        } else if (totalPaid > 0) {
          invoice.status = "partial";
        }
      }
      await route.fulfill({ status: 201, contentType: "application/json", body: toJson(payment) });
      return;
    }

    if (path.match(/^\/payments\/[^/]+\/reverse$/) && method === "POST") {
      const paymentId = path.split("/")[2];
      const payment = state.payments.find((entry) => entry.id === paymentId);
      if (!payment) {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: toJson({ message: "Payment not found" }),
        });
        return;
      }

      if (!payment.reversedAt) {
        payment.reversedAt = new Date().toISOString();
      }

      const invoice = state.invoices.find((entry) => entry.payments.some((candidate) => candidate.id === paymentId));
      if (invoice) {
        invoice.payments = invoice.payments.map((entry) => (entry.id === paymentId ? payment : entry));
        const totalPaid = paidTotal(invoice);
        if (totalPaid >= invoice.total) {
          invoice.status = "paid";
        } else if (totalPaid > 0) {
          invoice.status = "partial";
          invoice.paidAt = null;
        } else {
          invoice.status = invoice.lastSentAt ? "sent" : "draft";
          invoice.paidAt = null;
          invoice.lastPaidAt = null;
        }
        pushActivityLog(state, {
          type: "payment.reversed",
          action: "payment.reversed",
          entityType: "invoice",
          entityId: invoice.id,
          metadata: toJson({
            paymentId: payment.id,
            amount: payment.amount,
            method: payment.method,
          }),
        });
      }

      await route.fulfill({ status: 200, contentType: "application/json", body: toJson(payment) });
      return;
    }

    if (path === "/invoice-line-items") {
      await route.fulfill({ status: 200, contentType: "application/json", body: toJson({ records: [] }) });
      return;
    }

    if (path === "/activity-logs") {
      const entityType = url.searchParams.get("entityType");
      const entityId = url.searchParams.get("entityId");
      const records = state.activityLogs.filter((entry) => {
        if (entityType && entry.entityType !== entityType) return false;
        if (entityId && entry.entityId !== entityId) return false;
        return true;
      });
      await route.fulfill({ status: 200, contentType: "application/json", body: toJson({ records }) });
      return;
    }

    await route.fulfill({ status: 200, contentType: "application/json", body: toJson({ records: [] }) });
  });

  return state;
}

export async function signIn(page: Page) {
  await page.addInitScript(
    ({ businessId }) => {
      window.localStorage.setItem("authToken", "qa-token");
      window.localStorage.setItem("currentBusinessId", businessId);
    },
    { businessId: BUSINESS_ID }
  );
}

export async function interactiveSignIn(page: Page) {
  await page.goto("/sign-in");
  await expect(page.locator("#email")).toBeVisible();
  await page.locator("#email").fill("owner@example.com");
  await page.locator("#password").fill("TestPassword123!");
  await page.getByRole("button", { name: /sign in with email/i }).click();
  await page.waitForURL(/\/(signed-in|onboarding)/);
  await page.waitForLoadState("networkidle");
  await page.evaluate(
    ({ businessId }) => {
      window.localStorage.setItem("authToken", "qa-token");
      window.localStorage.setItem("currentBusinessId", businessId);
    },
    { businessId: BUSINESS_ID }
  );
}

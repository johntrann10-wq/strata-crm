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
  expiresAt?: string | null;
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

type BillingMockState = {
  quotes: QuoteRecord[];
  invoices: InvoiceRecord[];
  payments: PaymentRecord[];
};

const BUSINESS_ID = "biz-billing";
const USER_ID = "owner-1";
const QA_PERMISSIONS = [
  "quotes.write",
  "invoices.write",
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
    expiresAt: payload.expiresAt ? String(payload.expiresAt) : null,
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

function paidTotal(invoice: InvoiceRecord): number {
  return currency(
    invoice.payments.reduce((sum, payment) => sum + (payment.reversedAt ? 0 : payment.amount), 0)
  );
}

export async function mockBillingFlowApp(page: Page): Promise<BillingMockState> {
  const state: BillingMockState = {
    quotes: [],
    invoices: [],
    payments: [],
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
      await route.fulfill({ status: 200, contentType: "application/json", body: toJson({ records: [] }) });
      return;
    }

    if (path === "/quotes" && method === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: toJson({ records: state.quotes }) });
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
      const found = state.quotes.find((quote) => quote.id === quoteId);
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

    if (path === "/invoices" && method === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: toJson({ records: state.invoices }) });
      return;
    }

    if (path === "/invoices" && method === "POST") {
      const payload = parseBody(route);
      const created = buildInvoiceRecord(`invoice-${state.invoices.length + 1}`, payload);
      state.invoices.push(created);
      await route.fulfill({ status: 201, contentType: "application/json", body: toJson(created) });
      return;
    }

    if (path.startsWith("/invoices/") && method === "GET") {
      const invoiceId = path.split("/")[2];
      const found = state.invoices.find((invoice) => invoice.id === invoiceId);
      await route.fulfill({
        status: found ? 200 : 404,
        contentType: "application/json",
        body: toJson(found ?? { message: "Invoice not found" }),
      });
      return;
    }

    if (path.endsWith("/sendToClient") && path.startsWith("/invoices/") && method === "POST") {
      const invoiceId = path.split("/")[2];
      const found = state.invoices.find((invoice) => invoice.id === invoiceId);
      if (found) {
        found.status = "sent";
        found.lastSentAt = new Date().toISOString();
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: toJson({ deliveryStatus: "emailed", id: invoiceId }),
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

    if (path === "/invoice-line-items") {
      await route.fulfill({ status: 200, contentType: "application/json", body: toJson({ records: [] }) });
      return;
    }

    if (path === "/activity-logs") {
      await route.fulfill({ status: 200, contentType: "application/json", body: toJson({ records: [] }) });
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

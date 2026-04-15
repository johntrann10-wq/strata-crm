import { expect, type Page } from "@playwright/test";

type ClientRecord = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  notes: string | null;
  internalNotes: string | null;
  marketingOptIn: boolean;
  createdAt: string;
};

type VehicleRecord = {
  id: string;
  clientId: string;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  bodyStyle: string | null;
  engine: string | null;
  displayName: string | null;
  source: string | null;
  sourceVehicleId: string | null;
  color: string | null;
  vin: string | null;
  licensePlate: string | null;
  mileage: number | null;
  notes: string | null;
  client?: { id: string; firstName: string; lastName: string };
};

type AppointmentRecord = {
  id: string;
  clientId: string;
  vehicleId: string;
  title: string | null;
  startTime: string;
  status: string;
  totalPrice: number;
  vehicle: { year: number | null; make: string | null; model: string | null } | null;
};

type QuoteRecord = {
  id: string;
  clientId: string;
  vehicleId: string;
  total: number;
  status: string;
  sentAt: string | null;
  followUpSentAt: string | null;
  createdAt: string;
};

type InvoiceRecord = {
  id: string;
  clientId: string;
  vehicleId: string;
  invoiceNumber: string;
  total: number;
  remainingBalance: number;
  status: string;
  dueDate: string | null;
  lastSentAt: string | null;
  lastPaidAt: string | null;
  createdAt: string;
};

type JobRecord = {
  id: string;
  clientId: string;
  vehicleId: string;
  title: string;
  status: string;
  scheduledStart: string | null;
  createdAt: string;
};

export type ClientVehicleMockState = {
  client: ClientRecord;
  vehicle: VehicleRecord;
  clientArchived: boolean;
  vehicleArchived: boolean;
};

type ClientVehicleMockOptions = {
  permissions?: string[];
};

const BUSINESS_ID = "biz-client-vehicle";
const USER_ID = "owner-1";
const CLIENT_ID = "client-1";
const VEHICLE_ID = "vehicle-1";
const QA_PERMISSIONS = [
  "dashboard.view",
  "customers.read",
  "customers.write",
  "clients.write",
  "vehicles.read",
  "vehicles.write",
  "appointments.read",
  "appointments.write",
  "quotes.read",
  "quotes.write",
  "invoices.read",
  "invoices.write",
];

function toJson(body: unknown) {
  return JSON.stringify(body);
}

function parseBody(route: Parameters<Page["route"]>[1] extends (args: infer A) => any ? A : never): Record<string, unknown> {
  const postData = route.request().postData();
  return postData ? (JSON.parse(postData) as Record<string, unknown>) : {};
}

export async function mockClientVehicleApp(page: Page, options: ClientVehicleMockOptions = {}): Promise<ClientVehicleMockState> {
  const permissions = options.permissions ?? QA_PERMISSIONS;
  const state: ClientVehicleMockState = {
    client: {
      id: CLIENT_ID,
      firstName: "Avery",
      lastName: "Detail",
      email: "avery@example.com",
      phone: "555-111-2222",
      address: "123 Detail Ave",
      city: "Seattle",
      state: "WA",
      zip: "98101",
      notes: "Prefers text message reminders.",
      internalNotes: "VIP client with fleet referrals.",
      marketingOptIn: true,
      createdAt: "2026-01-15T18:00:00.000Z",
    },
    vehicle: {
      id: VEHICLE_ID,
      clientId: CLIENT_ID,
      year: 2024,
      make: "BMW",
      model: "M3",
      trim: "Competition",
      bodyStyle: "Sedan",
      engine: "3.0L Twin Turbo",
      displayName: "2024 BMW M3 Competition",
      source: "manual",
      sourceVehicleId: null,
      color: "Black Sapphire",
      vin: "WBS43AY09RFS12345",
      licensePlate: "DETAIL1",
      mileage: 11800,
      notes: "Customer asked for ceramic maintenance notes on handoff.",
      client: { id: CLIENT_ID, firstName: "Avery", lastName: "Detail" },
    },
    clientArchived: false,
    vehicleArchived: false,
  };

  const appointments: AppointmentRecord[] = [
    {
      id: "appt-1",
      clientId: CLIENT_ID,
      vehicleId: VEHICLE_ID,
      title: "Spring detail",
      startTime: "2026-04-07T16:00:00.000Z",
      status: "confirmed",
      totalPrice: 425,
      vehicle: { year: 2024, make: "BMW", model: "M3" },
    },
    {
      id: "appt-2",
      clientId: CLIENT_ID,
      vehicleId: VEHICLE_ID,
      title: "Ceramic maintenance",
      startTime: "2026-02-18T18:00:00.000Z",
      status: "completed",
      totalPrice: 310,
      vehicle: { year: 2024, make: "BMW", model: "M3" },
    },
  ];

  const quotes: QuoteRecord[] = [
    {
      id: "quote-1",
      clientId: CLIENT_ID,
      vehicleId: VEHICLE_ID,
      total: 899,
      status: "sent",
      sentAt: "2026-03-27T17:00:00.000Z",
      followUpSentAt: "2026-03-29T17:00:00.000Z",
      createdAt: "2026-03-26T17:00:00.000Z",
    },
  ];

  const invoices: InvoiceRecord[] = [
    {
      id: "invoice-1",
      clientId: CLIENT_ID,
      vehicleId: VEHICLE_ID,
      invoiceNumber: "INV-1001",
      total: 425,
      remainingBalance: 125,
      status: "partial",
      dueDate: "2026-03-20T08:00:00.000Z",
      lastSentAt: "2026-03-10T18:00:00.000Z",
      lastPaidAt: "2026-03-12T18:00:00.000Z",
      createdAt: "2026-03-10T17:00:00.000Z",
    },
  ];

  const jobs: JobRecord[] = [
    {
      id: "job-1",
      clientId: CLIENT_ID,
      vehicleId: VEHICLE_ID,
      title: "Tint follow-up",
      status: "in_progress",
      scheduledStart: "2026-04-06T16:00:00.000Z",
      createdAt: "2026-04-01T16:00:00.000Z",
    },
  ];

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
              permissions,
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

    if (path === "/billing/status" || path === "/billing/refresh-state") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: toJson({
          status: "active",
          accessState: "active_paid",
          trialStartedAt: null,
          trialEndsAt: null,
          currentPeriodEnd: null,
          billingHasPaymentMethod: true,
          billingPaymentMethodAddedAt: "2026-04-01T12:00:00.000Z",
          billingSetupError: null,
          billingSetupFailedAt: null,
          activationMilestone: { reached: false, type: null, occurredAt: null, detail: null },
          billingPrompt: {
            stage: "none",
            visible: false,
            daysLeftInTrial: null,
            dismissedUntil: null,
            cooldownDays: 5,
          },
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

    if (path === "/clients" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: toJson({ records: state.clientArchived ? [] : [state.client] }),
      });
      return;
    }

    if (path === `/clients/${CLIENT_ID}` && method === "GET") {
      await route.fulfill({
        status: state.clientArchived ? 404 : 200,
        contentType: "application/json",
        body: toJson(state.clientArchived ? { message: "Client not found" } : state.client),
      });
      return;
    }

    if (path === `/clients/${CLIENT_ID}` && method === "DELETE") {
      state.clientArchived = true;
      state.vehicleArchived = true;
      await route.fulfill({ status: 200, contentType: "application/json", body: toJson({ success: true, id: CLIENT_ID }) });
      return;
    }

    if (path === `/clients/${CLIENT_ID}` && method !== "GET") {
      const payload = parseBody(route);
      state.client = {
        ...state.client,
        ...payload,
        id: CLIENT_ID,
      } as ClientRecord;
      await route.fulfill({ status: 200, contentType: "application/json", body: toJson(state.client) });
      return;
    }

    if (path === "/vehicles" && method === "GET") {
      const clientId = url.searchParams.get("clientId");
      const records =
        state.vehicleArchived || state.clientArchived || (clientId && clientId !== CLIENT_ID) ? [] : [state.vehicle];
      await route.fulfill({ status: 200, contentType: "application/json", body: toJson({ records }) });
      return;
    }

    if (path === `/vehicles/${VEHICLE_ID}` && method === "GET") {
      await route.fulfill({
        status: state.vehicleArchived || state.clientArchived ? 404 : 200,
        contentType: "application/json",
        body: toJson(state.vehicleArchived || state.clientArchived ? { message: "Vehicle not found" } : state.vehicle),
      });
      return;
    }

    if (path === `/vehicles/${VEHICLE_ID}` && method === "DELETE") {
      state.vehicleArchived = true;
      await route.fulfill({ status: 200, contentType: "application/json", body: toJson({ success: true, id: VEHICLE_ID }) });
      return;
    }

    if (path === `/vehicles/${VEHICLE_ID}` && method !== "GET") {
      const payload = parseBody(route);
      state.vehicle = {
        ...state.vehicle,
        ...payload,
        id: VEHICLE_ID,
        clientId: CLIENT_ID,
        client: state.vehicle.client,
      } as VehicleRecord;
      await route.fulfill({ status: 200, contentType: "application/json", body: toJson(state.vehicle) });
      return;
    }

    if (path === "/appointments") {
      const clientId = url.searchParams.get("clientId");
      const vehicleId = url.searchParams.get("vehicleId");
      const records = appointments.filter((appointment) => {
        if (clientId && appointment.clientId !== clientId) return false;
        if (vehicleId && appointment.vehicleId !== vehicleId) return false;
        return true;
      });
      await route.fulfill({ status: 200, contentType: "application/json", body: toJson({ records }) });
      return;
    }

    if (path === "/quotes") {
      const clientId = url.searchParams.get("clientId");
      const vehicleId = url.searchParams.get("vehicleId");
      const records = quotes.filter((quote) => {
        if (clientId && quote.clientId !== clientId) return false;
        if (vehicleId && quote.vehicleId !== vehicleId) return false;
        return true;
      });
      await route.fulfill({ status: 200, contentType: "application/json", body: toJson({ records }) });
      return;
    }

    if (path === "/invoices") {
      const clientId = url.searchParams.get("clientId");
      const vehicleId = url.searchParams.get("vehicleId");
      const records = invoices.filter((invoice) => {
        if (clientId && invoice.clientId !== clientId) return false;
        if (vehicleId && invoice.vehicleId !== vehicleId) return false;
        return true;
      });
      await route.fulfill({ status: 200, contentType: "application/json", body: toJson({ records }) });
      return;
    }

    if (path === "/jobs") {
      const clientId = url.searchParams.get("clientId");
      const vehicleId = url.searchParams.get("vehicleId");
      const records = jobs.filter((job) => {
        if (clientId && job.clientId !== clientId) return false;
        if (vehicleId && job.vehicleId !== vehicleId) return false;
        return true;
      });
      await route.fulfill({ status: 200, contentType: "application/json", body: toJson({ records }) });
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
}

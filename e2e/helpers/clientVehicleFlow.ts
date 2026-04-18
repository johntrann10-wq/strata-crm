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

type ServiceRecord = {
  id: string;
  businessId: string;
  name: string;
  price: number;
  durationMinutes: number;
  category: string;
  categoryId: string | null;
  categoryLabel: string;
  notes: string | null;
  active: boolean;
  isAddon: boolean;
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

function toSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
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
  const clients: ClientRecord[] = [state.client];
  const vehicles: VehicleRecord[] = [state.vehicle];

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
  const services: ServiceRecord[] = [
    {
      id: "service-1",
      businessId: BUSINESS_ID,
      name: "Ceramic Maintenance",
      price: 225,
      durationMinutes: 120,
      category: "detailing",
      categoryId: null,
      categoryLabel: "Detailing",
      notes: "Maintenance wash and topper refresh.",
      active: true,
      isAddon: false,
    },
  ];
  let nextClientNumber = 2;
  let nextVehicleNumber = 2;
  let nextAppointmentNumber = 3;

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
      const search = url.searchParams.get("search")?.trim().toLowerCase() ?? "";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: toJson({
          records: clients.filter((client) => {
            if (client.id === CLIENT_ID && state.clientArchived) return false;
            if (!search) return true;
            return [client.firstName, client.lastName, client.email, client.phone].filter(Boolean).join(" ").toLowerCase().includes(search);
          }),
        }),
      });
      return;
    }

    if (path === "/clients" && method === "POST") {
      const payload = parseBody(route);
      const createdClient: ClientRecord = {
        id: `client-${nextClientNumber++}`,
        firstName: String(payload.firstName ?? "New"),
        lastName: String(payload.lastName ?? "Client"),
        email: String(payload.email ?? ""),
        phone: String(payload.phone ?? ""),
        address: typeof payload.address === "string" ? payload.address : null,
        city: typeof payload.city === "string" ? payload.city : null,
        state: typeof payload.state === "string" ? payload.state : null,
        zip: typeof payload.zip === "string" ? payload.zip : null,
        notes: typeof payload.notes === "string" ? payload.notes : null,
        internalNotes: typeof payload.internalNotes === "string" ? payload.internalNotes : null,
        marketingOptIn: payload.marketingOptIn !== false,
        createdAt: new Date().toISOString(),
      };
      clients.push(createdClient);
      await route.fulfill({ status: 201, contentType: "application/json", body: toJson(createdClient) });
      return;
    }

    if (/^\/clients\/[^/]+$/.test(path) && method === "GET") {
      const clientId = path.split("/").at(-1) ?? "";
      const client = clients.find((entry) => entry.id === clientId);
      await route.fulfill({
        status: !client || (client.id === CLIENT_ID && state.clientArchived) ? 404 : 200,
        contentType: "application/json",
        body: toJson(!client || (client.id === CLIENT_ID && state.clientArchived) ? { message: "Client not found" } : client),
      });
      return;
    }

    if (/^\/clients\/[^/]+$/.test(path) && method === "DELETE") {
      const clientId = path.split("/").at(-1) ?? "";
      if (clientId === CLIENT_ID) {
        state.clientArchived = true;
        state.vehicleArchived = true;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: toJson({ success: true, id: clientId }) });
      return;
    }

    if (/^\/clients\/[^/]+$/.test(path) && method !== "GET") {
      const clientId = path.split("/").at(-1) ?? "";
      const payload = parseBody(route);
      const index = clients.findIndex((entry) => entry.id === clientId);
      if (index === -1) {
        await route.fulfill({ status: 404, contentType: "application/json", body: toJson({ message: "Client not found" }) });
        return;
      }
      const updatedClient = {
        ...clients[index],
        ...payload,
        id: clientId,
      } as ClientRecord;
      clients[index] = updatedClient;
      if (clientId === CLIENT_ID) {
        state.client = updatedClient;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: toJson(updatedClient) });
      return;
    }

    if (path === "/vehicles" && method === "GET") {
      const clientId = url.searchParams.get("clientId");
      const records = vehicles.filter((vehicle) => {
        if (vehicle.id === VEHICLE_ID && (state.vehicleArchived || state.clientArchived)) return false;
        if (clientId && vehicle.clientId !== clientId) return false;
        return true;
      });
      await route.fulfill({ status: 200, contentType: "application/json", body: toJson({ records }) });
      return;
    }

    if (path === "/vehicles" && method === "POST") {
      const payload = parseBody(route);
      const clientId = String(payload.clientId ?? "");
      const client = clients.find((entry) => entry.id === clientId);
      const createdVehicle: VehicleRecord = {
        id: `vehicle-${nextVehicleNumber++}`,
        clientId,
        year: payload.year == null || payload.year === "" ? null : Number(payload.year),
        make: typeof payload.make === "string" ? payload.make : null,
        model: typeof payload.model === "string" ? payload.model : null,
        trim: typeof payload.trim === "string" ? payload.trim : null,
        bodyStyle: typeof payload.bodyStyle === "string" ? payload.bodyStyle : null,
        engine: typeof payload.engine === "string" ? payload.engine : null,
        displayName: typeof payload.displayName === "string" ? payload.displayName : null,
        source: typeof payload.source === "string" ? payload.source : "manual",
        sourceVehicleId: typeof payload.sourceVehicleId === "string" ? payload.sourceVehicleId : null,
        color: typeof payload.color === "string" ? payload.color : null,
        vin: typeof payload.vin === "string" ? payload.vin : null,
        licensePlate: typeof payload.licensePlate === "string" ? payload.licensePlate : null,
        mileage: payload.mileage == null || payload.mileage === "" ? null : Number(payload.mileage),
        notes: typeof payload.notes === "string" ? payload.notes : null,
        client: client ? { id: client.id, firstName: client.firstName, lastName: client.lastName } : undefined,
      };
      vehicles.push(createdVehicle);
      await route.fulfill({ status: 201, contentType: "application/json", body: toJson(createdVehicle) });
      return;
    }

    if (/^\/vehicles\/[^/]+$/.test(path) && method === "GET") {
      const vehicleId = path.split("/").at(-1) ?? "";
      const vehicle = vehicles.find((entry) => entry.id === vehicleId);
      await route.fulfill({
        status: !vehicle || (vehicle.id === VEHICLE_ID && (state.vehicleArchived || state.clientArchived)) ? 404 : 200,
        contentType: "application/json",
        body: toJson(!vehicle || (vehicle.id === VEHICLE_ID && (state.vehicleArchived || state.clientArchived)) ? { message: "Vehicle not found" } : vehicle),
      });
      return;
    }

    if (/^\/vehicles\/[^/]+$/.test(path) && method === "DELETE") {
      const vehicleId = path.split("/").at(-1) ?? "";
      if (vehicleId === VEHICLE_ID) {
        state.vehicleArchived = true;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: toJson({ success: true, id: vehicleId }) });
      return;
    }

    if (/^\/vehicles\/[^/]+$/.test(path) && method !== "GET") {
      const vehicleId = path.split("/").at(-1) ?? "";
      const payload = parseBody(route);
      const index = vehicles.findIndex((entry) => entry.id === vehicleId);
      if (index === -1) {
        await route.fulfill({ status: 404, contentType: "application/json", body: toJson({ message: "Vehicle not found" }) });
        return;
      }
      const updatedVehicle = {
        ...vehicles[index],
        ...payload,
        id: vehicleId,
        client: vehicles[index].client,
      } as VehicleRecord;
      vehicles[index] = updatedVehicle;
      if (vehicleId === VEHICLE_ID) {
        state.vehicle = updatedVehicle;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: toJson(updatedVehicle) });
      return;
    }

    if (path === "/appointments" && method === "POST") {
      const payload = parseBody(route);
      const clientId = typeof payload.clientId === "string" ? payload.clientId : "";
      const vehicleId = typeof payload.vehicleId === "string" ? payload.vehicleId : "";
      const client = clients.find((entry) => entry.id === clientId) ?? null;
      const vehicle = vehicles.find((entry) => entry.id === vehicleId) ?? null;
      const selectedServices = Array.isArray(payload.serviceIds)
        ? services.filter((service) => (payload.serviceIds as unknown[]).includes(service.id))
        : [];
      const appointmentTitle =
        typeof payload.title === "string" && payload.title.trim()
          ? payload.title
          : selectedServices.length > 0
            ? selectedServices.map((service) => service.name).join(" + ")
            : "Appointment";
      const totalPrice = selectedServices.reduce((sum, service) => sum + service.price, 0);
      const createdAppointment: AppointmentRecord & {
        endTime?: string | null;
        assignedStaffId?: string | null;
        depositAmount?: number | null;
        totalPrice?: number;
        client?: { id: string; firstName: string; lastName: string } | null;
        vehicle?: { id: string; year: number | null; make: string | null; model: string | null } | null;
        services?: Array<{ id: string; name: string; price: number; durationMinutes: number }>;
      } = {
        id: `appt-${nextAppointmentNumber++}`,
        clientId,
        vehicleId,
        title: appointmentTitle,
        startTime: String(payload.startTime ?? new Date().toISOString()),
        endTime: typeof payload.endTime === "string" ? payload.endTime : null,
        status: "scheduled",
        totalPrice,
        assignedStaffId: typeof payload.assignedStaffId === "string" ? payload.assignedStaffId : null,
        depositAmount: payload.depositAmount == null ? null : Number(payload.depositAmount),
        client: client ? { id: client.id, firstName: client.firstName, lastName: client.lastName } : null,
        vehicle: vehicle
          ? { id: vehicle.id, year: vehicle.year, make: vehicle.make, model: vehicle.model }
          : null,
        services: selectedServices.map((service) => ({
          id: service.id,
          name: service.name,
          price: service.price,
          durationMinutes: service.durationMinutes,
        })),
      };
      appointments.push(createdAppointment);
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: toJson({ ...createdAppointment, deliveryStatus: "smtp_disabled" }),
      });
      return;
    }

    if (/^\/appointments\/[^/]+$/.test(path) && method === "GET") {
      const appointmentId = path.split("/").at(-1) ?? "";
      const appointment = appointments.find((entry) => entry.id === appointmentId);
      await route.fulfill({
        status: appointment ? 200 : 404,
        contentType: "application/json",
        body: toJson(
          appointment
            ? appointment
            : { message: "Appointment not found" }
        ),
      });
      return;
    }

    if (path === "/appointments" && method === "GET") {
      const clientId = url.searchParams.get("clientId");
      const vehicleId = url.searchParams.get("vehicleId");
      const startGte = url.searchParams.get("startGte");
      const startLte = url.searchParams.get("startLte");
      const records = appointments.filter((appointment) => {
        if (clientId && appointment.clientId !== clientId) return false;
        if (vehicleId && appointment.vehicleId !== vehicleId) return false;
        if (startGte && new Date(appointment.startTime).getTime() < new Date(startGte).getTime()) return false;
        if (startLte && new Date(appointment.startTime).getTime() > new Date(startLte).getTime()) return false;
        return true;
      });
      await route.fulfill({ status: 200, contentType: "application/json", body: toJson({ records }) });
      return;
    }

    if (path === "/services") {
      await route.fulfill({ status: 200, contentType: "application/json", body: toJson({ records: services }) });
      return;
    }

    if (path === "/service-addon-links") {
      await route.fulfill({ status: 200, contentType: "application/json", body: toJson({ records: [] }) });
      return;
    }

    if (path === "/staff") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: toJson({
          records: [
            { id: "staff-1", firstName: "Owner", lastName: "QA", role: "owner" },
          ],
        }),
      });
      return;
    }

    if (path === "/vehicle-catalog/years") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: toJson({
          records: [{ id: "2024", year: 2024, label: "2024" }],
        }),
      });
      return;
    }

    if (path === "/vehicle-catalog/makes") {
      const year = url.searchParams.get("year") ?? "2024";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: toJson({
          records: [
            { id: `${year}-bmw`, label: "BMW", value: "BMW", source: "manual", sourceVehicleId: `${year}-bmw` },
          ],
        }),
      });
      return;
    }

    if (path === "/vehicle-catalog/models") {
      const make = url.searchParams.get("make") ?? "BMW";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: toJson({
          records: [
            { id: `${toSlug(make)}-m3`, label: "M3", value: "M3", source: "manual", sourceVehicleId: `${toSlug(make)}-m3` },
          ],
        }),
      });
      return;
    }

    if (path === "/vehicle-catalog/trims") {
      const model = url.searchParams.get("model") ?? "M3";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: toJson({
          records: [
            {
              id: `${toSlug(model)}-competition`,
              label: "Competition",
              value: "Competition",
              source: "manual",
              sourceVehicleId: `${toSlug(model)}-competition`,
              bodyStyle: "Sedan",
              engine: "3.0L Twin Turbo",
            },
          ],
        }),
      });
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

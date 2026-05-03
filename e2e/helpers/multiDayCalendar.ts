import { expect, type Page } from "@playwright/test";

type AppointmentRecord = {
  id: string;
  businessId: string;
  clientId: string;
  vehicleId: string;
  assignedStaffId?: string | null;
  locationId?: string | null;
  title: string | null;
  startTime: string;
  endTime: string | null;
  jobStartTime?: string | null;
  expectedCompletionTime?: string | null;
  pickupReadyTime?: string | null;
  vehicleOnSite?: boolean | null;
  jobPhase?: string | null;
  status: string;
  totalPrice?: number | null;
  depositAmount?: number | null;
  depositPaid?: boolean | null;
  notes?: string | null;
  internalNotes?: string | null;
  cancelledAt?: string | null;
  completedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  isMobile?: boolean | null;
  mobileAddress?: string | null;
  client: { id?: string; firstName: string; lastName: string; phone?: string | null; email?: string | null } | null;
  vehicle: { id?: string; year?: number | null; make: string; model: string; color?: string | null; licensePlate?: string | null } | null;
  assignedStaff: { id?: string; firstName: string; lastName: string } | null;
  business?: { id: string };
};

type MockState = {
  appointments: AppointmentRecord[];
  createPayloads: Record<string, unknown>[];
  updatePayloads: Record<string, unknown>[];
};

const BUSINESS_ID = "biz-multiday";
const LOCATION_ID = "loc-main";

const clients = [
  { id: "client-1", firstName: "Ava", lastName: "Lopez", phone: "555-111-1111", email: "ava@example.com" },
  { id: "client-2", firstName: "Marcus", lastName: "Stone", phone: "555-222-2222", email: "marcus@example.com" },
];

const vehicles = [
  { id: "veh-1", clientId: "client-1", year: 2023, make: "Tesla", model: "Model Y", color: "Blue", licensePlate: "WRAP123" },
  { id: "veh-2", clientId: "client-2", year: 2022, make: "Porsche", model: "911", color: "White", licensePlate: "PPF911" },
];

const staff = [
  { id: "staff-1", firstName: "Mia", lastName: "Chen", role: "Technician" },
  { id: "staff-2", firstName: "Jay", lastName: "Morgan", role: "Installer" },
];

const services = [
  { id: "svc-wrap", name: "Color Change Wrap", price: 2500, durationMinutes: 240, category: "ppf", active: true },
  { id: "svc-ppf", name: "Full Front PPF", price: 1800, durationMinutes: 180, category: "ppf", active: true },
  { id: "svc-coat", name: "Ceramic Coating", price: 1200, durationMinutes: 120, category: "detail", active: true },
  { id: "svc-paint", name: "Paint Correction", price: 900, durationMinutes: 180, category: "detail", active: true },
];

function iso(value: string): string {
  return new Date(value).toISOString();
}

function makeAppointment(partial: Partial<AppointmentRecord> & Pick<AppointmentRecord, "id" | "title" | "startTime" | "status" | "client" | "vehicle" | "assignedStaff">): AppointmentRecord {
  return {
    businessId: BUSINESS_ID,
    clientId: partial.client?.id ?? "client-1",
    vehicleId: partial.vehicle?.id ?? "veh-1",
    assignedStaffId: partial.assignedStaff?.id ?? null,
    locationId: LOCATION_ID,
    endTime: partial.endTime ?? null,
    jobStartTime: partial.jobStartTime ?? partial.startTime,
    expectedCompletionTime: partial.expectedCompletionTime ?? partial.endTime ?? partial.startTime,
    pickupReadyTime: partial.pickupReadyTime ?? null,
    vehicleOnSite: partial.vehicleOnSite ?? false,
    jobPhase: partial.jobPhase ?? "scheduled",
    totalPrice: partial.totalPrice ?? 0,
    depositAmount: partial.depositAmount ?? 0,
    depositPaid: partial.depositPaid ?? false,
    notes: partial.notes ?? null,
    internalNotes: partial.internalNotes ?? null,
    cancelledAt: null,
    completedAt: null,
    createdAt: iso("2026-03-01T08:00:00-07:00"),
    updatedAt: iso("2026-03-01T08:00:00-07:00"),
    isMobile: partial.isMobile ?? false,
    mobileAddress: partial.mobileAddress ?? null,
    business: { id: BUSINESS_ID },
    ...partial,
  };
}

function baseAppointments(): AppointmentRecord[] {
  const ava = clients[0];
  const marcus = clients[1];
  const tesla = vehicles[0];
  const porsche = vehicles[1];
  const mia = staff[0];
  const jay = staff[1];

  return [
    makeAppointment({
      id: "apt-wrap-5d",
      title: "Wrap Titan 5d",
      startTime: iso("2026-03-30T09:00:00-07:00"),
      endTime: iso("2026-03-30T13:00:00-07:00"),
      jobStartTime: iso("2026-03-29T08:00:00-07:00"),
      expectedCompletionTime: iso("2026-04-02T17:00:00-07:00"),
      pickupReadyTime: iso("2026-04-03T10:00:00-07:00"),
      vehicleOnSite: true,
      jobPhase: "active_work",
      status: "in_progress",
      totalPrice: 2500,
      client: { ...ava },
      vehicle: { ...tesla },
      assignedStaff: { ...mia },
    }),
    makeAppointment({
      id: "apt-ppf-3d",
      title: "PPF Carrera 3d",
      startTime: iso("2026-03-31T10:00:00-07:00"),
      endTime: iso("2026-03-31T12:30:00-07:00"),
      jobStartTime: iso("2026-03-31T08:00:00-07:00"),
      expectedCompletionTime: iso("2026-04-02T16:00:00-07:00"),
      vehicleOnSite: true,
      jobPhase: "curing",
      status: "confirmed",
      totalPrice: 1800,
      client: { ...marcus },
      vehicle: { ...porsche },
      assignedStaff: { ...jay },
    }),
    makeAppointment({
      id: "apt-coat-2d",
      title: "Ceramic Atlas 2d",
      startTime: iso("2026-03-30T14:00:00-07:00"),
      endTime: iso("2026-03-30T16:00:00-07:00"),
      jobStartTime: iso("2026-03-30T13:00:00-07:00"),
      expectedCompletionTime: iso("2026-03-31T18:00:00-07:00"),
      vehicleOnSite: true,
      jobPhase: "waiting",
      status: "scheduled",
      totalPrice: 1200,
      client: { ...ava },
      vehicle: { ...tesla, id: "veh-3", model: "Ranger", make: "Ford", year: 2021 },
      assignedStaff: { ...mia },
    }),
    makeAppointment({
      id: "apt-paint-week-cross",
      title: "Paint Nova 3d",
      startTime: iso("2026-03-28T11:00:00-07:00"),
      endTime: iso("2026-03-28T14:00:00-07:00"),
      jobStartTime: iso("2026-03-28T09:00:00-07:00"),
      expectedCompletionTime: iso("2026-03-30T15:00:00-07:00"),
      vehicleOnSite: true,
      jobPhase: "hold",
      status: "confirmed",
      totalPrice: 900,
      client: { ...marcus },
      vehicle: { ...porsche, id: "veh-4", model: "M4", make: "BMW", year: 2024 },
      assignedStaff: { ...jay },
    }),
    makeAppointment({
      id: "apt-single-detail",
      title: "Interior Detail",
      startTime: iso("2026-03-31T09:00:00-07:00"),
      endTime: iso("2026-03-31T11:00:00-07:00"),
      status: "scheduled",
      totalPrice: 240,
      client: { ...ava },
      vehicle: { ...tesla, id: "veh-5", model: "Civic", make: "Honda", year: 2020 },
      assignedStaff: { ...mia },
    }),
    makeAppointment({
      id: "apt-single-tint",
      title: "Window Tint Sedan",
      startTime: iso("2026-03-31T12:00:00-07:00"),
      endTime: iso("2026-03-31T15:00:00-07:00"),
      status: "confirmed",
      totalPrice: 400,
      client: { ...marcus },
      vehicle: { ...porsche, id: "veh-6", model: "A4", make: "Audi", year: 2019 },
      assignedStaff: { ...jay },
    }),
    makeAppointment({
      id: "apt-single-mobile",
      title: "Mobile Wash",
      startTime: iso("2026-04-01T08:00:00-07:00"),
      endTime: iso("2026-04-01T09:30:00-07:00"),
      status: "scheduled",
      totalPrice: 150,
      isMobile: true,
      mobileAddress: "123 Detail Lane",
      client: { ...ava },
      vehicle: { ...tesla, id: "veh-7", model: "Sprinter", make: "Mercedes", year: 2021 },
      assignedStaff: { ...mia },
    }),
  ];
}

function parseBody(requestBody: string | null): Record<string, unknown> {
  if (!requestBody) return {};
  return JSON.parse(requestBody) as Record<string, unknown>;
}

function filterAppointmentsForRange(appointments: AppointmentRecord[], startGte?: string | null, startLte?: string | null): AppointmentRecord[] {
  const rangeStart = startGte ? new Date(startGte).getTime() : null;
  const rangeEnd = startLte ? new Date(startLte).getTime() : null;
  return appointments.filter((appointment) => {
    const spanStart = new Date(appointment.jobStartTime ?? appointment.startTime).getTime();
    const spanEnd = new Date(
      appointment.pickupReadyTime ?? appointment.expectedCompletionTime ?? appointment.endTime ?? appointment.startTime
    ).getTime();
    if (rangeStart != null && spanEnd < rangeStart) return false;
    if (rangeEnd != null && spanStart > rangeEnd) return false;
    return true;
  });
}

export async function mockMultiDayApp(page: Page): Promise<MockState> {
  const context = page.context();
  const state: MockState = {
    appointments: baseAppointments(),
    createPayloads: [],
    updatePayloads: [],
  };

  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("/api/")) {
      console.log("[multi-day-qa][request]", request.method(), url);
    }
  });

  page.on("response", async (response) => {
    const url = response.url();
    if (url.includes("/api/")) {
      console.log("[multi-day-qa][response]", response.status(), url);
    }
  });

  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      console.log("[multi-day-qa][console]", message.type(), message.text());
    }
  });

  page.on("pageerror", (error) => {
    console.log("[multi-day-qa][pageerror]", error.message);
  });

  await context.route(/.*\/api\/notifications(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ records: [] }),
    });
  });

  await context.route(/.*\/api\/notifications\/unread-count(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ total: 0, leads: 0, calendar: 0 }),
    });
  });

  await context.route("**/api/notifications/read-all", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  await context.route(/.*\/api\/notifications\/[^/]+\/read$/, async (route) => {
    const url = new URL(route.request().url());
    const id = url.pathname.split("/").at(-2) ?? "";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, id }),
    });
  });

  await page.route("**/api/auth/sign-in", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          id: "owner-1",
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
      body: JSON.stringify({
        data: {
          id: "owner-1",
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
      body: JSON.stringify({
        data: {
          currentBusinessId: BUSINESS_ID,
          businesses: [
            {
              id: BUSINESS_ID,
              name: "QA Shop",
              type: "auto_detailing",
              role: "owner",
              status: "active",
              isDefault: true,
              permissions: [
                "settings.write",
                "clients.write",
                "vehicles.write",
                "services.write",
                "appointments.write",
                "appointments.read",
              ],
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

    if (path === "/businesses") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ records: [{ id: BUSINESS_ID, defaultTaxRate: 8.5 }] }) });
      return;
    }

    if (path === `/businesses/${BUSINESS_ID}`) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: BUSINESS_ID, name: "QA Shop", type: "auto_detailing", onboardingComplete: true, defaultTaxRate: 8.5 }),
      });
      return;
    }

    if (path === "/users/owner-1") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "owner-1", firstName: "Owner", lastName: "QA", email: "owner@example.com" }),
      });
      return;
    }

    if (path === "/billing/status" || path === "/billing/refresh-state") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
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
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ records: [{ id: LOCATION_ID, name: "Main Bay", address: "123 Shop Way" }] }) });
      return;
    }

    if (path === "/clients") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ records: clients }) });
      return;
    }

    if (path === "/vehicles") {
      const clientId = url.searchParams.get("clientId");
      const filtered = clientId ? vehicles.filter((vehicle) => vehicle.clientId === clientId) : vehicles;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ records: filtered }) });
      return;
    }

    if (path === "/services") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ records: services }) });
      return;
    }

    if (path === "/service-addon-links") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ records: [] }) });
      return;
    }

    if (path === "/staff") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ records: staff }) });
      return;
    }

    if (path === "/quotes" || path === "/invoices" || path === "/activity-logs" || path === "/appointment-services") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ records: [] }) });
      return;
    }

    if (path === "/notifications") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ records: [] }),
      });
      return;
    }

    if (path === "/notifications/unread-count") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ total: 0, leads: 0, calendar: 0 }),
      });
      return;
    }

    if (path === "/notifications/read-all" && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
      return;
    }

    if (/^\/notifications\/[^/]+\/read$/.test(path) && method === "POST") {
      const id = path.split("/")[2] ?? "";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, id }),
      });
      return;
    }

    if (path === "/appointments" && method === "GET") {
      const records = filterAppointmentsForRange(
        state.appointments,
        url.searchParams.get("startGte"),
        url.searchParams.get("startLte")
      );
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ records }) });
      return;
    }

    if (path === "/appointments" && method === "POST") {
      const payload = parseBody(route.request().postData());
      state.createPayloads.push(payload);
      const client = clients.find((entry) => entry.id === payload.clientId) ?? clients[0];
      const vehicle = vehicles.find((entry) => entry.id === payload.vehicleId) ?? vehicles[0];
      const assignee = staff.find((entry) => entry.id === payload.assignedStaffId) ?? staff[0];
      const created = makeAppointment({
        id: `created-${state.createPayloads.length}`,
        title: String(payload.title ?? "Created appointment"),
        startTime: String(payload.startTime),
        endTime: payload.endTime ? String(payload.endTime) : null,
        jobStartTime: payload.jobStartTime ? String(payload.jobStartTime) : String(payload.startTime),
        expectedCompletionTime: payload.expectedCompletionTime ? String(payload.expectedCompletionTime) : (payload.endTime ? String(payload.endTime) : String(payload.startTime)),
        pickupReadyTime: payload.pickupReadyTime ? String(payload.pickupReadyTime) : null,
        vehicleOnSite: Boolean(payload.vehicleOnSite),
        jobPhase: String(payload.jobPhase ?? "scheduled"),
        status: "scheduled",
        client: { ...client },
        vehicle: { ...vehicle },
        assignedStaff: assignee ? { id: assignee.id, firstName: assignee.firstName, lastName: assignee.lastName } : null,
      });
      state.appointments.push(created);
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(created) });
      return;
    }

    if (path.startsWith("/appointments/") && method === "GET") {
      const id = path.split("/")[2];
      const found = state.appointments.find((appointment) => appointment.id === id);
      await route.fulfill({
        status: found ? 200 : 404,
        contentType: "application/json",
        body: JSON.stringify(found ?? { message: "Not found" }),
      });
      return;
    }

    if (path.startsWith("/appointments/") && method === "PATCH") {
      const id = path.split("/")[2];
      const payload = parseBody(route.request().postData());
      state.updatePayloads.push(payload);
      const index = state.appointments.findIndex((appointment) => appointment.id === id);
      if (index >= 0) {
        state.appointments[index] = {
          ...state.appointments[index],
          ...payload,
          startTime: String(payload.startTime ?? state.appointments[index].startTime),
          endTime: payload.endTime !== undefined ? (payload.endTime ? String(payload.endTime) : null) : state.appointments[index].endTime,
          jobStartTime:
            payload.jobStartTime !== undefined
              ? (payload.jobStartTime ? String(payload.jobStartTime) : null)
              : state.appointments[index].jobStartTime,
          expectedCompletionTime:
            payload.expectedCompletionTime !== undefined
              ? (payload.expectedCompletionTime ? String(payload.expectedCompletionTime) : null)
              : state.appointments[index].expectedCompletionTime,
          pickupReadyTime:
            payload.pickupReadyTime !== undefined
              ? (payload.pickupReadyTime ? String(payload.pickupReadyTime) : null)
              : state.appointments[index].pickupReadyTime,
          title: payload.title !== undefined ? String(payload.title) : state.appointments[index].title,
        };
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(state.appointments.find((appointment) => appointment.id === id) ?? {}),
      });
      return;
    }

    if (path.includes("/updateStatus") || path.includes("/sendConfirmation") || path.includes("/complete") || path.includes("/cancel")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      return;
    }

    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ records: [] }) });
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
  await page.evaluate(
    ({ businessId }) => {
      window.localStorage.setItem("authToken", "qa-token");
      window.localStorage.setItem("currentBusinessId", businessId);
    },
    { businessId: BUSINESS_ID }
  );
}

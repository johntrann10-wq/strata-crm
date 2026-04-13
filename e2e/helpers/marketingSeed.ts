import type { Page } from "@playwright/test";

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

type InvoiceRecord = {
  id: string;
  invoiceNumber: string;
  status: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  notes: string | null;
  createdAt: string;
  dueDate: string | null;
  paidAt: string | null;
  business: { id: string };
  client: { id: string; firstName: string; lastName: string; email: string; phone: string };
  appointment: { id: string; startTime: string; vehicle: { year: number; make: string; model: string } };
  lineItems: { edges: Array<{ node: { id: string; description: string; quantity: number; unitPrice: number; total: number } }> };
  payments: { edges: Array<{ node: { id: string; amount: number; method: string; createdAt: string } }> };
};

const BUSINESS_ID = "biz-coastline";
const USER_ID = "owner-jake";
const LOCATION_ID = "loc-coastline";

const STAFF = [
  { id: "staff-jake", firstName: "Jake", lastName: "Holloway", role: "owner", status: "active", membershipRole: "owner" },
  { id: "staff-marco", firstName: "Marco", lastName: "Silva", role: "technician", status: "active", membershipRole: "member" },
];

const CLIENTS: ClientRecord[] = [
  {
    id: "client-elena",
    firstName: "Elena",
    lastName: "Torres",
    email: "elena@coastlineclients.com",
    phone: "555-210-8890",
    address: "742 Seaside Blvd",
    city: "Santa Monica",
    state: "CA",
    zip: "90401",
    notes: "Prefers morning drop-offs. Loves ceramic maintenance reminders.",
    internalNotes: "Referral from Marco.",
    marketingOptIn: true,
    createdAt: "2026-04-02T16:00:00.000Z",
  },
  {
    id: "client-miles",
    firstName: "Miles",
    lastName: "Carter",
    email: "miles.carter@example.com",
    phone: "555-987-4412",
    address: "1120 Harbor Way",
    city: "Long Beach",
    state: "CA",
    zip: "90802",
    notes: "Wants a quote for full front PPF next visit.",
    internalNotes: null,
    marketingOptIn: true,
    createdAt: "2026-03-28T19:00:00.000Z",
  },
  {
    id: "client-priya",
    firstName: "Priya",
    lastName: "Singh",
    email: "priya.singh@example.com",
    phone: "555-551-7720",
    address: "318 Ocean Crest",
    city: "Irvine",
    state: "CA",
    zip: "92618",
    notes: "Vehicle stays overnight for coating cure.",
    internalNotes: "Always pay by card.",
    marketingOptIn: true,
    createdAt: "2026-04-05T18:30:00.000Z",
  },
  {
    id: "client-noah",
    firstName: "Noah",
    lastName: "Martinez",
    email: "noah.martinez@example.com",
    phone: "555-440-9013",
    address: "51 Marina Dr",
    city: "San Pedro",
    state: "CA",
    zip: "90731",
    notes: "Mobile service only.",
    internalNotes: null,
    marketingOptIn: false,
    createdAt: "2026-03-20T14:15:00.000Z",
  },
  {
    id: "client-harper",
    firstName: "Harper",
    lastName: "Brooks",
    email: "harper.brooks@example.com",
    phone: "555-771-0988",
    address: "860 Grand Ave",
    city: "Pasadena",
    state: "CA",
    zip: "91101",
    notes: "Needs fleet wash reminders every 3 weeks.",
    internalNotes: "Prefers text updates.",
    marketingOptIn: true,
    createdAt: "2026-03-18T10:05:00.000Z",
  },
];

const VEHICLES: VehicleRecord[] = [
  {
    id: "veh-elena",
    clientId: "client-elena",
    year: 2023,
    make: "Tesla",
    model: "Model Y",
    trim: "Long Range",
    bodyStyle: "SUV",
    engine: "EV",
    displayName: "2023 Tesla Model Y",
    source: "manual",
    sourceVehicleId: null,
    color: "Pearl White",
    vin: "5YJYGDEE3PF123456",
    licensePlate: "DETAILY",
    mileage: 16400,
    notes: "Coating warranty on file.",
    client: { id: "client-elena", firstName: "Elena", lastName: "Torres" },
  },
  {
    id: "veh-miles",
    clientId: "client-miles",
    year: 2022,
    make: "Ford",
    model: "Bronco",
    trim: "Wildtrak",
    bodyStyle: "SUV",
    engine: "2.7L V6",
    displayName: "2022 Ford Bronco Wildtrak",
    source: "manual",
    sourceVehicleId: null,
    color: "Cyber Orange",
    vin: "1FMEE5DP9NLA01234",
    licensePlate: "BRONCO22",
    mileage: 22150,
    notes: null,
    client: { id: "client-miles", firstName: "Miles", lastName: "Carter" },
  },
  {
    id: "veh-priya",
    clientId: "client-priya",
    year: 2024,
    make: "BMW",
    model: "X3",
    trim: "M40i",
    bodyStyle: "SUV",
    engine: "3.0L Turbo",
    displayName: "2024 BMW X3 M40i",
    source: "manual",
    sourceVehicleId: null,
    color: "Brooklyn Gray",
    vin: "5UX43DP05R9X12345",
    licensePlate: "COASTX3",
    mileage: 4800,
    notes: "Requires low-dust delivery.",
    client: { id: "client-priya", firstName: "Priya", lastName: "Singh" },
  },
  {
    id: "veh-noah",
    clientId: "client-noah",
    year: 2021,
    make: "Toyota",
    model: "Tacoma",
    trim: "TRD",
    bodyStyle: "Truck",
    engine: "3.5L V6",
    displayName: "2021 Toyota Tacoma TRD",
    source: "manual",
    sourceVehicleId: null,
    color: "Cement",
    vin: "3TMCZ5AN6MM123456",
    licensePlate: "TACO21",
    mileage: 30210,
    notes: "Mobile detail only.",
    client: { id: "client-noah", firstName: "Noah", lastName: "Martinez" },
  },
  {
    id: "veh-harper",
    clientId: "client-harper",
    year: 2020,
    make: "Audi",
    model: "Q7",
    trim: "Premium",
    bodyStyle: "SUV",
    engine: "3.0L Turbo",
    displayName: "2020 Audi Q7 Premium",
    source: "manual",
    sourceVehicleId: null,
    color: "Navarra Blue",
    vin: "WA1VXAF79LD123456",
    licensePlate: "Q7FLEET",
    mileage: 41200,
    notes: "Fleet wash contract.",
    client: { id: "client-harper", firstName: "Harper", lastName: "Brooks" },
  },
];

const SERVICES = [
  { id: "svc-detail", name: "Full Detail", price: 220, durationMinutes: 180, category: "detail", active: true },
  { id: "svc-ceramic", name: "Ceramic Coating", price: 1200, durationMinutes: 360, category: "detail", active: true },
  { id: "svc-correction", name: "Paint Correction", price: 650, durationMinutes: 240, category: "detail", active: true },
  { id: "svc-maintenance", name: "Maintenance Wash", price: 85, durationMinutes: 60, category: "detail", active: true },
  { id: "svc-interior", name: "Interior Refresh", price: 160, durationMinutes: 120, category: "detail", active: true },
  { id: "svc-mobile", name: "Mobile Detail", price: 140, durationMinutes: 90, category: "detail", active: true },
];

function iso(value: string): string {
  return new Date(value).toISOString();
}

function makeAppointment(partial: Partial<AppointmentRecord> & Pick<AppointmentRecord, "id" | "title" | "startTime" | "status" | "client" | "vehicle" | "assignedStaff">): AppointmentRecord {
  return {
    businessId: BUSINESS_ID,
    clientId: partial.client?.id ?? CLIENTS[0].id,
    vehicleId: partial.vehicle?.id ?? VEHICLES[0].id,
    assignedStaffId: partial.assignedStaff?.id ?? STAFF[0].id,
    locationId: LOCATION_ID,
    endTime: partial.endTime ?? null,
    jobStartTime: partial.jobStartTime ?? partial.startTime,
    expectedCompletionTime: partial.expectedCompletionTime ?? partial.endTime ?? partial.startTime,
    pickupReadyTime: partial.pickupReadyTime ?? null,
    vehicleOnSite: partial.vehicleOnSite ?? true,
    jobPhase: partial.jobPhase ?? "scheduled",
    totalPrice: partial.totalPrice ?? 0,
    depositAmount: partial.depositAmount ?? 0,
    depositPaid: partial.depositPaid ?? false,
    notes: partial.notes ?? null,
    internalNotes: partial.internalNotes ?? null,
    cancelledAt: null,
    completedAt: partial.completedAt ?? null,
    createdAt: iso("2026-04-01T08:00:00-07:00"),
    updatedAt: iso("2026-04-03T08:00:00-07:00"),
    isMobile: partial.isMobile ?? false,
    mobileAddress: partial.mobileAddress ?? null,
    business: { id: BUSINESS_ID },
    ...partial,
  };
}

const APPOINTMENTS: AppointmentRecord[] = [
  makeAppointment({
    id: "appt-ceramic-1",
    title: "Ceramic Coating",
    startTime: iso("2026-04-08T09:00:00-07:00"),
    endTime: iso("2026-04-08T12:30:00-07:00"),
    jobStartTime: iso("2026-04-08T09:00:00-07:00"),
    expectedCompletionTime: iso("2026-04-08T13:00:00-07:00"),
    status: "confirmed",
    totalPrice: 1200,
    depositAmount: 300,
    depositPaid: true,
    jobPhase: "in_progress",
    client: { id: "client-elena", firstName: "Elena", lastName: "Torres", phone: "555-210-8890", email: "elena@coastlineclients.com" },
    vehicle: { id: "veh-elena", year: 2023, make: "Tesla", model: "Model Y", color: "Pearl White", licensePlate: "DETAILY" },
    assignedStaff: { id: "staff-jake", firstName: "Jake", lastName: "Holloway" },
    location: { name: "Coastline Bay" },
  }),
  makeAppointment({
    id: "appt-full-detail",
    title: "Full Detail + Interior Refresh",
    startTime: iso("2026-04-08T13:30:00-07:00"),
    endTime: iso("2026-04-08T16:30:00-07:00"),
    jobStartTime: iso("2026-04-08T13:30:00-07:00"),
    expectedCompletionTime: iso("2026-04-08T17:00:00-07:00"),
    status: "scheduled",
    totalPrice: 380,
    depositAmount: 100,
    depositPaid: false,
    jobPhase: "scheduled",
    client: { id: "client-harper", firstName: "Harper", lastName: "Brooks", phone: "555-771-0988", email: "harper.brooks@example.com" },
    vehicle: { id: "veh-harper", year: 2020, make: "Audi", model: "Q7", color: "Navarra Blue", licensePlate: "Q7FLEET" },
    assignedStaff: { id: "staff-marco", firstName: "Marco", lastName: "Silva" },
    location: { name: "Coastline Bay" },
  }),
  makeAppointment({
    id: "appt-mobile",
    title: "Mobile Detail",
    startTime: iso("2026-04-07T08:30:00-07:00"),
    endTime: iso("2026-04-07T10:00:00-07:00"),
    jobStartTime: iso("2026-04-07T08:30:00-07:00"),
    expectedCompletionTime: iso("2026-04-07T10:30:00-07:00"),
    status: "scheduled",
    totalPrice: 140,
    depositAmount: 0,
    depositPaid: true,
    jobPhase: "scheduled",
    isMobile: true,
    mobileAddress: "51 Marina Dr, San Pedro, CA",
    client: { id: "client-noah", firstName: "Noah", lastName: "Martinez", phone: "555-440-9013", email: "noah.martinez@example.com" },
    vehicle: { id: "veh-noah", year: 2021, make: "Toyota", model: "Tacoma", color: "Cement", licensePlate: "TACO21" },
    assignedStaff: { id: "staff-marco", firstName: "Marco", lastName: "Silva" },
    location: { name: "Mobile Crew" },
  }),
  makeAppointment({
    id: "appt-maintenance",
    title: "Maintenance Wash",
    startTime: iso("2026-04-06T11:00:00-07:00"),
    endTime: iso("2026-04-06T12:00:00-07:00"),
    jobStartTime: iso("2026-04-06T11:00:00-07:00"),
    expectedCompletionTime: iso("2026-04-06T12:30:00-07:00"),
    status: "completed",
    totalPrice: 85,
    depositAmount: 0,
    depositPaid: true,
    completedAt: iso("2026-04-06T13:00:00-07:00"),
    jobPhase: "completed",
    client: { id: "client-priya", firstName: "Priya", lastName: "Singh", phone: "555-551-7720", email: "priya.singh@example.com" },
    vehicle: { id: "veh-priya", year: 2024, make: "BMW", model: "X3", color: "Brooklyn Gray", licensePlate: "COASTX3" },
    assignedStaff: { id: "staff-jake", firstName: "Jake", lastName: "Holloway" },
    location: { name: "Coastline Bay" },
  }),
  makeAppointment({
    id: "appt-correction",
    title: "Paint Correction",
    startTime: iso("2026-04-09T10:00:00-07:00"),
    endTime: iso("2026-04-09T14:30:00-07:00"),
    jobStartTime: iso("2026-04-09T10:00:00-07:00"),
    expectedCompletionTime: iso("2026-04-09T15:00:00-07:00"),
    status: "confirmed",
    totalPrice: 650,
    depositAmount: 150,
    depositPaid: true,
    jobPhase: "in_progress",
    client: { id: "client-miles", firstName: "Miles", lastName: "Carter", phone: "555-987-4412", email: "miles.carter@example.com" },
    vehicle: { id: "veh-miles", year: 2022, make: "Ford", model: "Bronco", color: "Cyber Orange", licensePlate: "BRONCO22" },
    assignedStaff: { id: "staff-marco", firstName: "Marco", lastName: "Silva" },
    location: { name: "Coastline Bay" },
  }),
  makeAppointment({
    id: "appt-interior",
    title: "Interior Refresh",
    startTime: iso("2026-04-10T09:30:00-07:00"),
    endTime: iso("2026-04-10T11:30:00-07:00"),
    jobStartTime: iso("2026-04-10T09:30:00-07:00"),
    expectedCompletionTime: iso("2026-04-10T12:00:00-07:00"),
    status: "scheduled",
    totalPrice: 160,
    depositAmount: 0,
    depositPaid: true,
    jobPhase: "scheduled",
    client: { id: "client-elena", firstName: "Elena", lastName: "Torres", phone: "555-210-8890", email: "elena@coastlineclients.com" },
    vehicle: { id: "veh-elena", year: 2023, make: "Tesla", model: "Model Y", color: "Pearl White", licensePlate: "DETAILY" },
    assignedStaff: { id: "staff-jake", firstName: "Jake", lastName: "Holloway" },
    location: { name: "Coastline Bay" },
  }),
  makeAppointment({
    id: "appt-maintenance-2",
    title: "Maintenance Wash",
    startTime: iso("2026-04-11T08:00:00-07:00"),
    endTime: iso("2026-04-11T09:00:00-07:00"),
    jobStartTime: iso("2026-04-11T08:00:00-07:00"),
    expectedCompletionTime: iso("2026-04-11T09:30:00-07:00"),
    status: "scheduled",
    totalPrice: 85,
    depositAmount: 0,
    depositPaid: true,
    jobPhase: "scheduled",
    client: { id: "client-harper", firstName: "Harper", lastName: "Brooks", phone: "555-771-0988", email: "harper.brooks@example.com" },
    vehicle: { id: "veh-harper", year: 2020, make: "Audi", model: "Q7", color: "Navarra Blue", licensePlate: "Q7FLEET" },
    assignedStaff: { id: "staff-marco", firstName: "Marco", lastName: "Silva" },
    location: { name: "Coastline Bay" },
  }),
  makeAppointment({
    id: "appt-touchup",
    title: "Gloss Enhancement",
    startTime: iso("2026-04-12T10:00:00-07:00"),
    endTime: iso("2026-04-12T12:00:00-07:00"),
    jobStartTime: iso("2026-04-12T10:00:00-07:00"),
    expectedCompletionTime: iso("2026-04-12T12:30:00-07:00"),
    status: "scheduled",
    totalPrice: 190,
    depositAmount: 50,
    depositPaid: false,
    jobPhase: "scheduled",
    client: { id: "client-priya", firstName: "Priya", lastName: "Singh", phone: "555-551-7720", email: "priya.singh@example.com" },
    vehicle: { id: "veh-priya", year: 2024, make: "BMW", model: "X3", color: "Brooklyn Gray", licensePlate: "COASTX3" },
    assignedStaff: { id: "staff-jake", firstName: "Jake", lastName: "Holloway" },
    location: { name: "Coastline Bay" },
  }),
];

const INVOICE: InvoiceRecord = {
  id: "inv-2041",
  invoiceNumber: "INV-2041",
  status: "partial",
  subtotal: 850,
  taxRate: 0.085,
  taxAmount: 72.25,
  discountAmount: 0,
  total: 922.25,
  notes: "Thank you for choosing Coastline Detail Co.",
  createdAt: "2026-04-07T19:00:00.000Z",
  dueDate: "2026-04-15T19:00:00.000Z",
  paidAt: null,
  business: { id: BUSINESS_ID },
  client: { id: "client-elena", firstName: "Elena", lastName: "Torres", email: "elena@coastlineclients.com", phone: "555-210-8890" },
  appointment: { id: "appt-ceramic-1", startTime: "2026-04-08T09:00:00.000Z", vehicle: { year: 2023, make: "Tesla", model: "Model Y" } },
  lineItems: {
    edges: [
      { node: { id: "li-1", description: "Ceramic Coating", quantity: 1, unitPrice: 750, total: 750 } },
      { node: { id: "li-2", description: "Paint Correction", quantity: 1, unitPrice: 100, total: 100 } },
    ],
  },
  payments: {
    edges: [{ node: { id: "pay-1", amount: 200, method: "card", createdAt: "2026-04-07T20:00:00.000Z" } }],
  },
};

const PORTAL_SUMMARY = {
  business: {
    name: "Coastline Detail Co.",
    email: "hello@coastlinedetail.com",
    phone: "555-210-8800",
  },
  client: {
    firstName: "Elena",
    lastName: "Torres",
    email: "elena@coastlineclients.com",
    phone: "555-210-8890",
  },
  currentDocument: {
    kind: "invoice",
    id: "inv-2041",
    title: "Ceramic Coating",
    status: "partial",
    url: "/invoices/inv-2041",
  },
  portalUrl: "https://stratacrm.app/portal/coastline-demo",
  sections: {
    quotes: [
      {
        id: "quote-1",
        status: "sent",
        total: 1450,
        expiresAt: "2026-04-20T19:00:00.000Z",
        createdAt: "2026-04-05T19:00:00.000Z",
        vehicleLabel: "2023 Tesla Model Y",
        url: "/quotes/quote-1",
      },
    ],
    invoices: [
      {
        id: "inv-2041",
        invoiceNumber: "INV-2041",
        status: "partial",
        total: 922.25,
        balance: 722.25,
        dueDate: "2026-04-15T19:00:00.000Z",
        createdAt: "2026-04-07T19:00:00.000Z",
        url: "/invoices/inv-2041",
        payUrl: "https://pay.stripe.com/portal-demo",
      },
    ],
    upcomingAppointments: [
      {
        id: "appt-ceramic-1",
        title: "Ceramic Coating",
        status: "confirmed",
        startTime: "2026-04-08T09:00:00.000Z",
        totalPrice: 1200,
        depositAmount: 300,
        balanceDue: 900,
        paidInFull: false,
        depositSatisfied: true,
        vehicleLabel: "2023 Tesla Model Y",
        url: "/appointments/appt-ceramic-1",
        payUrl: "https://pay.stripe.com/portal-demo",
      },
    ],
    recentAppointments: [
      {
        id: "appt-maintenance",
        title: "Maintenance Wash",
        status: "completed",
        startTime: "2026-04-06T11:00:00.000Z",
        totalPrice: 85,
        vehicleLabel: "2024 BMW X3",
        url: "/appointments/appt-maintenance",
      },
    ],
    vehicles: [
      { id: "veh-elena", label: "2023 Tesla Model Y", color: "Pearl White", licensePlate: "DETAILY" },
    ],
  },
};

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

function toJson(body: unknown) {
  return JSON.stringify(body);
}

export async function mockMarketingApp(page: Page) {
  await page.route("**/api/auth/sign-in", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: toJson({
        data: {
          id: USER_ID,
          email: "jake@coastlinedetail.com",
          firstName: "Jake",
          lastName: "Holloway",
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
          email: "jake@coastlinedetail.com",
          firstName: "Jake",
          lastName: "Holloway",
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
              name: "Coastline Detail Co.",
              type: "auto_detailing",
              role: "owner",
              status: "active",
              isDefault: true,
              permissions: [
                "dashboard.view",
                "customers.read",
                "clients.write",
                "vehicles.read",
                "vehicles.write",
                "appointments.read",
                "appointments.write",
                "quotes.read",
                "quotes.write",
                "invoices.read",
                "invoices.write",
                "payments.read",
                "payments.write",
                "settings.read",
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

    if (path.startsWith("/portal/")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: toJson(PORTAL_SUMMARY) });
      return;
    }

    if (path === "/users/owner-jake") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: toJson({ id: USER_ID, firstName: "Jake", lastName: "Holloway", email: "jake@coastlinedetail.com" }),
      });
      return;
    }

    if (path === "/businesses") {
      await route.fulfill({ status: 200, contentType: "application/json", body: toJson({ records: [{ id: BUSINESS_ID, defaultTaxRate: 8.5 }] }) });
      return;
    }

    if (path === `/businesses/${BUSINESS_ID}`) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: toJson({ id: BUSINESS_ID, name: "Coastline Detail Co.", type: "auto_detailing", onboardingComplete: true, defaultTaxRate: 8.5 }),
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
          activationMilestone: { reached: true, type: "first_appointment", occurredAt: "2026-04-06T11:00:00.000Z", detail: "Maintenance Wash" },
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
          stripeConnectReady: true,
          stripeConnectAccountId: "acct_demo",
        }),
      });
      return;
    }

    if (path === "/locations") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: toJson({ records: [{ id: LOCATION_ID, name: "Coastline Bay", address: "742 Seaside Blvd" }] }),
      });
      return;
    }

    if (path === "/clients" && method === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: toJson({ records: CLIENTS }) });
      return;
    }

    if (path.startsWith("/clients/") && method === "GET") {
      const id = path.split("/")[2];
      const client = CLIENTS.find((record) => record.id === id);
      await route.fulfill({ status: client ? 200 : 404, contentType: "application/json", body: toJson(client ?? { message: "Not found" }) });
      return;
    }

    if (path === "/vehicles" && method === "GET") {
      const clientId = url.searchParams.get("clientId");
      const filtered = clientId ? VEHICLES.filter((vehicle) => vehicle.clientId === clientId) : VEHICLES;
      await route.fulfill({ status: 200, contentType: "application/json", body: toJson({ records: filtered }) });
      return;
    }

    if (path.startsWith("/vehicles/") && method === "GET") {
      const id = path.split("/")[2];
      const vehicle = VEHICLES.find((record) => record.id === id);
      await route.fulfill({ status: vehicle ? 200 : 404, contentType: "application/json", body: toJson(vehicle ?? { message: "Not found" }) });
      return;
    }

    if (path === "/services") {
      await route.fulfill({ status: 200, contentType: "application/json", body: toJson({ records: SERVICES }) });
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
          records: STAFF.map((member) => ({
            id: member.id,
            firstName: member.firstName,
            lastName: member.lastName,
            email: member.id === "staff-jake" ? "jake@coastlinedetail.com" : "marco@coastlinedetail.com",
            role: member.role,
            membershipRole: member.membershipRole,
            status: member.status,
            active: true,
            inviteSentAt: "2026-04-01T17:00:00.000Z",
          })),
        }),
      });
      return;
    }

    if (path === "/integrations/status") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: toJson({
          infrastructure: {
            vaultConfigured: true,
            cronSecretConfigured: true,
            providerConfiguration: {
              quickbooks_online: false,
              google_calendar: false,
              twilio_sms: false,
              outbound_webhooks: false,
            },
          },
          registry: [],
          connections: [],
        }),
      });
      return;
    }

    if (path === "/integrations/failures" || path === "/integrations" || path === "/integrations/outbound-webhooks/recent-events") {
      await route.fulfill({ status: 200, contentType: "application/json", body: toJson({ records: [] }) });
      return;
    }

    if (path === "/appointments" && method === "GET") {
      const records = filterAppointmentsForRange(APPOINTMENTS, url.searchParams.get("startGte"), url.searchParams.get("startLte"));
      await route.fulfill({ status: 200, contentType: "application/json", body: toJson({ records }) });
      return;
    }

    if (path.startsWith("/appointments/") && method === "GET") {
      const id = path.split("/")[2];
      const appointment = APPOINTMENTS.find((record) => record.id === id);
      await route.fulfill({ status: appointment ? 200 : 404, contentType: "application/json", body: toJson(appointment ?? { message: "Not found" }) });
      return;
    }

    if (path === "/appointment-services") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: toJson({
          records: [
            { id: "as-1", appointmentId: "appt-ceramic-1", serviceId: "svc-ceramic", name: "Ceramic Coating", price: 1200, quantity: 1 },
          ],
        }),
      });
      return;
    }

    if (path === "/quotes") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: toJson({
          records: [
            {
              id: "quote-1",
              clientId: "client-elena",
              vehicleId: "veh-elena",
              total: 1450,
              status: "sent",
              sentAt: "2026-04-05T19:00:00.000Z",
              createdAt: "2026-04-04T19:00:00.000Z",
            },
          ],
        }),
      });
      return;
    }

    if (path === "/invoices" && method === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: toJson({ records: [INVOICE] }) });
      return;
    }

    if (path.startsWith("/invoices/") && method === "GET") {
      const id = path.split("/")[2];
      if (id === INVOICE.id) {
        await route.fulfill({ status: 200, contentType: "application/json", body: toJson(INVOICE) });
        return;
      }
      await route.fulfill({ status: 404, contentType: "application/json", body: toJson({ message: "Not found" }) });
      return;
    }

    if (path === "/invoice-line-items") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: toJson({
          records: [
            { id: "li-1", invoiceId: INVOICE.id, description: "Ceramic Coating", quantity: 1, unitPrice: 750, total: 750 },
            { id: "li-2", invoiceId: INVOICE.id, description: "Paint Correction", quantity: 1, unitPrice: 100, total: 100 },
          ],
        }),
      });
      return;
    }

    if (path === "/payments") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: toJson({ records: [{ id: "pay-1", invoiceId: INVOICE.id, amount: 200, method: "card", createdAt: "2026-04-07T20:00:00.000Z" }] }),
      });
      return;
    }

    if (path === "/activity-logs") {
      await route.fulfill({ status: 200, contentType: "application/json", body: toJson({ records: [] }) });
      return;
    }

    await route.fulfill({ status: 200, contentType: "application/json", body: toJson({ records: [] }) });
  });
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

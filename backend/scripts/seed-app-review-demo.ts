import { createHash, randomUUID } from "crypto";
import { config as loadEnv } from "dotenv";
import bcrypt from "bcryptjs";
import { and, eq, inArray } from "drizzle-orm";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const SEED_NAMESPACE = "app-review-demo-v1";
const DEFAULT_REVIEW_EMAIL = "appreview@stratacrm.app";
const DEFAULT_BUSINESS_NAME = "Northline Auto Studio";
const TAX_RATE = 8.25;

const scriptDir = dirname(fileURLToPath(import.meta.url));
for (const path of [
  resolve(scriptDir, "../.env.local"),
  resolve(scriptDir, "../.env"),
  resolve(scriptDir, "../../.env.local"),
  resolve(scriptDir, "../../.env"),
]) {
  loadEnv({ path, override: false });
}

const [{ closeDb, db }, schemaModule, { applyBusinessPreset }] = await Promise.all([
  import("../src/db/index.js"),
  import("../src/db/schema.js"),
  import("../src/lib/businessPresets.js"),
]);

const {
  activityLogs,
  appointmentServices,
  appointmentSources,
  appointments,
  businesses,
  businessMemberships,
  clients,
  dashboardPreferences,
  invoiceLineItems,
  invoices,
  locations,
  mediaAssets,
  membershipPermissionGrants,
  notificationLogs,
  notifications,
  payments,
  quoteLineItems,
  quotes,
  rolePermissionGrants,
  serviceAddonLinks,
  serviceCategories,
  services,
  staff,
  users,
  vehicles,
} = schemaModule;

type SeedLineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
};

type AppointmentServiceSeed = {
  name: string;
  quantity: number;
  unitPrice: number;
};

type AppointmentSeed = {
  id: string;
  clientId: string;
  vehicleId: string;
  assignedStaffId: string;
  locationId: string;
  title: string;
  startTime: Date;
  endTime: Date;
  status: "confirmed" | "in_progress" | "completed";
  jobPhase: "scheduled" | "active_work";
  vehicleOnSite: boolean;
  notes: string | null;
  internalNotes: string | null;
  jobStartTime?: Date | null;
  expectedCompletionTime?: Date | null;
  pickupReadyTime?: Date | null;
  completedAt?: Date | null;
  depositAmount: number;
  services: AppointmentServiceSeed[];
  createdAt: Date;
  updatedAt: Date;
};

type QuoteSeed = {
  id: string;
  clientId: string;
  vehicleId: string | null;
  appointmentId: string | null;
  status: "sent" | "accepted";
  lineItems: SeedLineItem[];
  sentAt: Date;
  followUpSentAt: Date | null;
  expiresAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type InvoiceSeed = {
  id: string;
  clientId: string;
  appointmentId: string | null;
  invoiceNumber: string;
  status: "partial" | "paid";
  lineItems: SeedLineItem[];
  dueDate: Date | null;
  paidAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type PaymentSeed = {
  id: string;
  invoiceId: string;
  amount: number;
  method: "card" | "cash" | "zelle";
  paidAt: Date;
  notes: string | null;
  referenceNumber: string | null;
};

type NotificationSeed = {
  id: string;
  type: string;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  metadata: Record<string, unknown>;
  createdAt: Date;
};

function readArg(name: string): string | null {
  const withEquals = process.argv.find((entry) => entry.startsWith(`${name}=`));
  if (withEquals) return withEquals.slice(name.length + 1).trim() || null;
  const index = process.argv.indexOf(name);
  if (index >= 0) {
    const value = process.argv[index + 1];
    return value?.trim() ? value.trim() : null;
  }
  return null;
}

function deterministicUuid(seed: string): string {
  const hex = createHash("sha256").update(`${SEED_NAMESPACE}:${seed}`).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ["8", "9", "a", "b"][parseInt(hex[16] ?? "0", 16) % 4] ?? "8";
  const compact = hex.join("");
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20, 32)}`;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function money(value: number): string {
  return roundMoney(value).toFixed(2);
}

function buildFinance(lineItems: SeedLineItem[], taxRate = TAX_RATE) {
  const subtotal = roundMoney(
    lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  );
  const taxAmount = roundMoney((subtotal * taxRate) / 100);
  const total = roundMoney(subtotal + taxAmount);
  return { subtotal, taxAmount, total, taxRate };
}

function offsetDate(days: number, hours: number, minutes = 0): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function svgDataUrl(params: { label: string; accent: string; secondary: string }) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900" role="img" aria-label="${params.label}">
  <defs>
    <linearGradient id="bg" x1="0%" x2="100%" y1="0%" y2="100%">
      <stop offset="0%" stop-color="${params.secondary}"/>
      <stop offset="100%" stop-color="#f8fafc"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="900" rx="48" fill="url(#bg)"/>
  <rect x="72" y="72" width="1056" height="756" rx="40" fill="#ffffff" stroke="${params.accent}" stroke-width="8"/>
  <rect x="132" y="148" width="936" height="320" rx="28" fill="${params.accent}" opacity="0.12"/>
  <circle cx="228" cy="308" r="68" fill="${params.accent}" opacity="0.88"/>
  <rect x="332" y="236" width="536" height="42" rx="21" fill="#0f172a" opacity="0.9"/>
  <rect x="332" y="310" width="416" height="28" rx="14" fill="#475569" opacity="0.75"/>
  <rect x="332" y="364" width="286" height="28" rx="14" fill="#94a3b8" opacity="0.68"/>
  <rect x="132" y="542" width="936" height="56" rx="20" fill="#0f172a" opacity="0.08"/>
  <rect x="132" y="628" width="712" height="42" rx="18" fill="#0f172a" opacity="0.06"/>
  <rect x="132" y="694" width="516" height="42" rx="18" fill="#0f172a" opacity="0.05"/>
  <text x="132" y="110" fill="#0f172a" font-family="Helvetica, Arial, sans-serif" font-size="42" font-weight="700">${params.label}</text>
</svg>`;
  return {
    dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    byteSize: Buffer.byteLength(svg, "utf8"),
    width: 1200,
    height: 900,
  };
}

async function main() {
  const reviewEmail = (readArg("--email") ?? process.env.APP_REVIEW_DEMO_EMAIL ?? DEFAULT_REVIEW_EMAIL).trim().toLowerCase();
  const reviewPassword = (readArg("--password") ?? process.env.APP_REVIEW_DEMO_PASSWORD ?? "").trim();
  const businessName = (readArg("--business-name") ?? process.env.APP_REVIEW_DEMO_BUSINESS_NAME ?? DEFAULT_BUSINESS_NAME).trim();

  if (!reviewPassword) {
    throw new Error("Provide APP_REVIEW_DEMO_PASSWORD or pass --password so the seeded review account can be recreated deterministically.");
  }

  const demoBusinessId = deterministicUuid("business");
  const demoLocationId = deterministicUuid("location:main");
  const ownerStaffId = deterministicUuid("staff:owner");
  const leadTechId = deterministicUuid("staff:lead-tech");

  const clientIds = {
    maya: deterministicUuid("client:maya-chen"),
    daniel: deterministicUuid("client:daniel-rivera"),
    olivia: deterministicUuid("client:olivia-brooks"),
    jordan: deterministicUuid("client:jordan-kim"),
  };

  const vehicleIds = {
    mayaTesla: deterministicUuid("vehicle:maya-tesla"),
    danielTruck: deterministicUuid("vehicle:daniel-f150"),
    oliviaBmw: deterministicUuid("vehicle:olivia-bmw"),
    jordanSubaru: deterministicUuid("vehicle:jordan-subaru"),
  };

  const appointmentIds = {
    mayaUpcoming: deterministicUuid("appointment:maya-upcoming-mobile"),
    danielActive: deterministicUuid("appointment:daniel-active"),
    oliviaCompleted: deterministicUuid("appointment:olivia-completed"),
    mayaPaidHistory: deterministicUuid("appointment:maya-paid-history"),
  };

  const quoteIds = {
    jordanSent: deterministicUuid("quote:jordan-sent"),
    mayaAccepted: deterministicUuid("quote:maya-accepted"),
  };

  const invoiceIds = {
    oliviaPartial: deterministicUuid("invoice:olivia-partial"),
    mayaPaid: deterministicUuid("invoice:maya-paid"),
  };

  const paymentIds = {
    oliviaDeposit: deterministicUuid("payment:olivia-partial"),
    mayaPaid: deterministicUuid("payment:maya-paid"),
  };

  const now = new Date();
  const mayaUpcomingStart = offsetDate(1, 10, 30);
  const mayaUpcomingEnd = addMinutes(mayaUpcomingStart, 120);
  const danielActiveStart = addMinutes(now, -45);
  const danielActiveEnd = addMinutes(now, 135);
  const oliviaCompletedStart = offsetDate(-3, 8, 30);
  const oliviaCompletedEnd = addMinutes(oliviaCompletedStart, 240);
  const mayaPaidHistoryStart = offsetDate(-12, 9, 0);
  const mayaPaidHistoryEnd = addMinutes(mayaPaidHistoryStart, 150);

  const appointmentSeeds: AppointmentSeed[] = [
    {
      id: appointmentIds.mayaUpcoming,
      clientId: clientIds.maya,
      vehicleId: vehicleIds.mayaTesla,
      assignedStaffId: leadTechId,
      locationId: demoLocationId,
      title: "Mobile maintenance wash",
      startTime: mayaUpcomingStart,
      endTime: mayaUpcomingEnd,
      status: "confirmed",
      jobPhase: "scheduled",
      vehicleOnSite: false,
      notes: "Mobile service address: 1450 R Street, Sacramento, CA 95811\nCustomer requested a quieter arrival before the apartment gate opens.",
      internalNotes: "App Review path: open this appointment from Calendar to test call, text, email, Maps, reminders, quick actions, and photo intake.",
      depositAmount: 50,
      services: [
        { name: "Maintenance Wash", quantity: 1, unitPrice: 69 },
        { name: "Rush Service", quantity: 1, unitPrice: 75 },
      ],
      createdAt: offsetDate(-4, 14, 20),
      updatedAt: offsetDate(-1, 16, 10),
    },
    {
      id: appointmentIds.danielActive,
      clientId: clientIds.daniel,
      vehicleId: vehicleIds.danielTruck,
      assignedStaffId: leadTechId,
      locationId: demoLocationId,
      title: "Ceramic coating install",
      startTime: danielActiveStart,
      endTime: danielActiveEnd,
      status: "in_progress",
      jobPhase: "active_work",
      vehicleOnSite: true,
      notes: "Customer asked for a quick text update when curing starts.",
      internalNotes: "Bay 2. Paint already corrected yesterday.",
      jobStartTime: addMinutes(now, -30),
      expectedCompletionTime: addMinutes(now, 150),
      depositAmount: 200,
      services: [
        { name: "Ceramic Coating Installation", quantity: 1, unitPrice: 899 },
        { name: "Wheel Coating", quantity: 1, unitPrice: 149 },
      ],
      createdAt: offsetDate(-6, 11, 5),
      updatedAt: addMinutes(now, -20),
    },
    {
      id: appointmentIds.oliviaCompleted,
      clientId: clientIds.olivia,
      vehicleId: vehicleIds.oliviaBmw,
      assignedStaffId: leadTechId,
      locationId: demoLocationId,
      title: "Full detail with engine bay",
      startTime: oliviaCompletedStart,
      endTime: oliviaCompletedEnd,
      status: "completed",
      jobPhase: "active_work",
      vehicleOnSite: false,
      notes: "Customer approved mild stain extraction if needed.",
      internalNotes: "Before/after interior photos attached.",
      jobStartTime: addMinutes(oliviaCompletedStart, 20),
      expectedCompletionTime: addMinutes(oliviaCompletedStart, 220),
      pickupReadyTime: addMinutes(oliviaCompletedStart, 250),
      completedAt: addMinutes(oliviaCompletedStart, 260),
      depositAmount: 0,
      services: [
        { name: "Full Interior + Exterior Detail", quantity: 1, unitPrice: 279 },
        { name: "Engine Bay Detail", quantity: 1, unitPrice: 59 },
      ],
      createdAt: offsetDate(-10, 13, 10),
      updatedAt: offsetDate(-3, 13, 20),
    },
    {
      id: appointmentIds.mayaPaidHistory,
      clientId: clientIds.maya,
      vehicleId: vehicleIds.mayaTesla,
      assignedStaffId: ownerStaffId,
      locationId: demoLocationId,
      title: "Interior refresh and decon",
      startTime: mayaPaidHistoryStart,
      endTime: mayaPaidHistoryEnd,
      status: "completed",
      jobPhase: "active_work",
      vehicleOnSite: false,
      notes: "Repeat client. Marked as paid and completed for dashboard history.",
      internalNotes: "Use this visit to show completed history on the customer record.",
      jobStartTime: addMinutes(mayaPaidHistoryStart, 10),
      expectedCompletionTime: addMinutes(mayaPaidHistoryStart, 130),
      pickupReadyTime: addMinutes(mayaPaidHistoryStart, 145),
      completedAt: addMinutes(mayaPaidHistoryStart, 150),
      depositAmount: 0,
      services: [
        { name: "Standard Interior Detail", quantity: 1, unitPrice: 159 },
        { name: "Clay Bar Decontamination", quantity: 1, unitPrice: 89 },
      ],
      createdAt: offsetDate(-20, 15, 40),
      updatedAt: offsetDate(-12, 12, 30),
    },
  ];

  const quoteSeeds: QuoteSeed[] = [
    {
      id: quoteIds.jordanSent,
      clientId: clientIds.jordan,
      vehicleId: vehicleIds.jordanSubaru,
      appointmentId: null,
      status: "sent",
      lineItems: [
        { description: "Paint Enhancement Polish", quantity: 1, unitPrice: 249 },
        { description: "Glass Coating", quantity: 1, unitPrice: 99 },
      ],
      sentAt: offsetDate(-1, 11, 15),
      followUpSentAt: offsetDate(0, 9, 10),
      expiresAt: offsetDate(7, 17, 0),
      notes: "Jordan is comparing one more quote. Good estimate example for App Review.",
      createdAt: offsetDate(-2, 16, 0),
      updatedAt: offsetDate(0, 9, 10),
    },
    {
      id: quoteIds.mayaAccepted,
      clientId: clientIds.maya,
      vehicleId: vehicleIds.mayaTesla,
      appointmentId: appointmentIds.mayaUpcoming,
      status: "accepted",
      lineItems: [
        { description: "Maintenance Wash", quantity: 1, unitPrice: 69 },
        { description: "Rush Service", quantity: 1, unitPrice: 75 },
      ],
      sentAt: offsetDate(-3, 10, 45),
      followUpSentAt: null,
      expiresAt: offsetDate(4, 18, 0),
      notes: "Accepted estimate that converted into the upcoming mobile appointment.",
      createdAt: offsetDate(-3, 9, 30),
      updatedAt: offsetDate(-2, 14, 15),
    },
  ];

  const invoiceSeeds: InvoiceSeed[] = [
    {
      id: invoiceIds.oliviaPartial,
      clientId: clientIds.olivia,
      appointmentId: appointmentIds.oliviaCompleted,
      invoiceNumber: "INV-2107",
      status: "partial",
      lineItems: [
        { description: "Full Interior + Exterior Detail", quantity: 1, unitPrice: 279 },
        { description: "Engine Bay Detail", quantity: 1, unitPrice: 59 },
      ],
      dueDate: offsetDate(-1, 17, 0),
      paidAt: null,
      notes: "Balance due after partial card payment. Good finance example for App Review.",
      createdAt: offsetDate(-3, 14, 0),
      updatedAt: addMinutes(now, -90),
    },
    {
      id: invoiceIds.mayaPaid,
      clientId: clientIds.maya,
      appointmentId: appointmentIds.mayaPaidHistory,
      invoiceNumber: "INV-2108",
      status: "paid",
      lineItems: [
        { description: "Standard Interior Detail", quantity: 1, unitPrice: 159 },
        { description: "Clay Bar Decontamination", quantity: 1, unitPrice: 89 },
      ],
      dueDate: offsetDate(-10, 17, 0),
      paidAt: offsetDate(-10, 15, 30),
      notes: "Paid invoice to keep the customer history and dashboard revenue widgets populated.",
      createdAt: offsetDate(-12, 14, 0),
      updatedAt: offsetDate(-10, 15, 30),
    },
  ];

  const paymentSeeds: PaymentSeed[] = [
    {
      id: paymentIds.oliviaDeposit,
      invoiceId: invoiceIds.oliviaPartial,
      amount: 150,
      method: "card",
      paidAt: addMinutes(now, -120),
      notes: "Captured during pickup.",
      referenceNumber: "demo-olivia-150",
    },
    {
      id: paymentIds.mayaPaid,
      invoiceId: invoiceIds.mayaPaid,
      amount: buildFinance(invoiceSeeds[1]?.lineItems ?? []).total,
      method: "card",
      paidAt: offsetDate(-10, 15, 30),
      notes: "Paid in full on pickup.",
      referenceNumber: "demo-maya-paid",
    },
  ];

  const passwordHash = await bcrypt.hash(reviewPassword, 10);

  const userId = await db.transaction(async (tx) => {
    const [existingUser] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, reviewEmail))
      .limit(1);

    const resolvedUserId = existingUser?.id ?? randomUUID();
    const sharedUserFields = {
      email: reviewEmail,
      passwordHash,
      firstName: "App",
      lastName: "Review",
      emailVerified: true,
      googleProfileId: null,
      appleSubject: null,
      appleEmail: null,
      appleEmailIsPrivateRelay: false,
      authTokenVersion: 1,
      accountDeletionRequestedAt: null,
      accountDeletionRequestNote: null,
      deletedAt: null,
      updatedAt: now,
    };

    if (existingUser) {
      await tx.update(users).set(sharedUserFields).where(eq(users.id, existingUser.id));
    } else {
      await tx.insert(users).values({
        id: resolvedUserId,
        ...sharedUserFields,
        createdAt: now,
      });
    }

    await tx.update(businessMemberships).set({ isDefault: false, updatedAt: now }).where(eq(businessMemberships.userId, resolvedUserId));

    const businessFields = {
      ownerId: resolvedUserId,
      name: businessName,
      type: "auto_detailing" as const,
      email: reviewEmail,
      phone: "(916) 555-0148",
      address: "820 Power Inn Road",
      city: "Sacramento",
      state: "CA",
      zip: "95826",
      timezone: "America/Los_Angeles",
      currency: "USD",
      defaultTaxRate: money(TAX_RATE),
      defaultAdminFee: money(0),
      defaultAdminFeeEnabled: false,
      defaultAppointmentStartTime: "09:00",
      appointmentBufferMinutes: 15,
      calendarBlockCapacityPerSlot: 1,
      leadCaptureEnabled: true,
      leadAutoResponseEnabled: true,
      leadAutoResponseEmailEnabled: true,
      leadAutoResponseSmsEnabled: false,
      notificationAppointmentConfirmationEmailEnabled: true,
      notificationAppointmentReminderEmailEnabled: true,
      notificationAbandonedQuoteEmailEnabled: true,
      notificationReviewRequestEmailEnabled: true,
      notificationLapsedClientEmailEnabled: false,
      missedCallTextBackEnabled: false,
      automationUncontactedLeadsEnabled: true,
      automationUncontactedLeadHours: 2,
      automationAppointmentRemindersEnabled: true,
      automationAppointmentReminderHours: 24,
      automationSendWindowStartHour: 8,
      automationSendWindowEndHour: 18,
      automationReviewRequestsEnabled: true,
      automationReviewRequestDelayHours: 24,
      reviewRequestUrl: "https://g.page/r/Cdemo-review",
      automationAbandonedQuotesEnabled: true,
      automationAbandonedQuoteHours: 48,
      automationLapsedClientsEnabled: false,
      automationLapsedClientMonths: 6,
      bookingRequestUrl: null,
      bookingEnabled: true,
      bookingDefaultFlow: "request",
      bookingPageTitle: "Book your next detail",
      bookingPageSubtitle: "Pick a service and send a few vehicle details so the shop can lock in the right slot.",
      bookingRequireEmail: true,
      bookingRequirePhone: true,
      bookingRequireVehicle: true,
      bookingAllowCustomerNotes: true,
      bookingShowPrices: true,
      bookingShowDurations: true,
      bookingAvailableDays: JSON.stringify([1, 2, 3, 4, 5, 6]),
      bookingAvailableStartTime: "08:00",
      bookingAvailableEndTime: "17:30",
      bookingSlotIntervalMinutes: 15,
      monthlyRevenueGoal: money(18000),
      monthlyJobsGoal: 48,
      integrationWebhookEnabled: false,
      integrationWebhookUrl: null,
      integrationWebhookSecret: null,
      integrationWebhookEvents: "[]",
      nextInvoiceNumber: 2109,
      onboardingComplete: true,
      staffCount: 2,
      operatingHours: JSON.stringify({
        monday: ["08:00", "17:30"],
        tuesday: ["08:00", "17:30"],
        wednesday: ["08:00", "17:30"],
        thursday: ["08:00", "17:30"],
        friday: ["08:00", "17:30"],
        saturday: ["09:00", "15:00"],
      }),
      subscriptionStatus: "active",
      billingAccessState: "active_paid",
      trialStartedAt: offsetDate(-60, 9, 0),
      trialEndsAt: offsetDate(-30, 9, 0),
      currentPeriodEnd: offsetDate(30, 9, 0),
      billingHasPaymentMethod: true,
      billingPaymentMethodAddedAt: offsetDate(-29, 10, 0),
      billingSetupError: null,
      billingSetupFailedAt: null,
      billingLastStripeEventId: null,
      billingLastStripeEventType: null,
      billingLastStripeEventAt: null,
      billingLastStripeSyncStatus: "succeeded",
      billingLastStripeSyncError: null,
      stripeConnectAccountId: null,
      stripeConnectDetailsSubmitted: false,
      stripeConnectChargesEnabled: false,
      stripeConnectPayoutsEnabled: false,
      stripeConnectOnboardedAt: null,
      updatedAt: now,
    };

    const [existingBusiness] = await tx
      .select({ id: businesses.id })
      .from(businesses)
      .where(eq(businesses.id, demoBusinessId))
      .limit(1);

    if (existingBusiness) {
      await tx.update(businesses).set(businessFields).where(eq(businesses.id, demoBusinessId));
    } else {
      await tx.insert(businesses).values({
        id: demoBusinessId,
        ...businessFields,
        createdAt: now,
      });
    }

    const existingAppointmentRows = await tx
      .select({ id: appointments.id })
      .from(appointments)
      .where(eq(appointments.businessId, demoBusinessId));
    const existingInvoiceRows = await tx
      .select({ id: invoices.id })
      .from(invoices)
      .where(eq(invoices.businessId, demoBusinessId));
    const existingQuoteRows = await tx
      .select({ id: quotes.id })
      .from(quotes)
      .where(eq(quotes.businessId, demoBusinessId));

    const existingAppointmentIds = existingAppointmentRows.map((row) => row.id);
    const existingInvoiceIds = existingInvoiceRows.map((row) => row.id);
    const existingQuoteIds = existingQuoteRows.map((row) => row.id);

    await tx.delete(notificationLogs).where(eq(notificationLogs.businessId, demoBusinessId));
    await tx.delete(notifications).where(eq(notifications.businessId, demoBusinessId));
    await tx.delete(activityLogs).where(eq(activityLogs.businessId, demoBusinessId));
    await tx.delete(mediaAssets).where(eq(mediaAssets.businessId, demoBusinessId));
    await tx.delete(dashboardPreferences).where(eq(dashboardPreferences.businessId, demoBusinessId));
    await tx.delete(appointmentSources).where(eq(appointmentSources.businessId, demoBusinessId));

    if (existingInvoiceIds.length > 0) {
      await tx.delete(payments).where(inArray(payments.invoiceId, existingInvoiceIds));
      await tx.delete(invoiceLineItems).where(inArray(invoiceLineItems.invoiceId, existingInvoiceIds));
    }
    if (existingQuoteIds.length > 0) {
      await tx.delete(quoteLineItems).where(inArray(quoteLineItems.quoteId, existingQuoteIds));
    }
    if (existingAppointmentIds.length > 0) {
      await tx.delete(appointmentServices).where(inArray(appointmentServices.appointmentId, existingAppointmentIds));
    }

    await tx.delete(invoices).where(eq(invoices.businessId, demoBusinessId));
    await tx.delete(quotes).where(eq(quotes.businessId, demoBusinessId));
    await tx.delete(appointments).where(eq(appointments.businessId, demoBusinessId));
    await tx.delete(vehicles).where(eq(vehicles.businessId, demoBusinessId));
    await tx.delete(clients).where(eq(clients.businessId, demoBusinessId));
    await tx.delete(staff).where(eq(staff.businessId, demoBusinessId));
    await tx.delete(locations).where(eq(locations.businessId, demoBusinessId));
    await tx.delete(membershipPermissionGrants).where(eq(membershipPermissionGrants.businessId, demoBusinessId));
    await tx.delete(rolePermissionGrants).where(eq(rolePermissionGrants.businessId, demoBusinessId));
    await tx.delete(serviceAddonLinks).where(eq(serviceAddonLinks.businessId, demoBusinessId));
    await tx.delete(services).where(eq(services.businessId, demoBusinessId));
    await tx.delete(serviceCategories).where(eq(serviceCategories.businessId, demoBusinessId));
    await tx.delete(businessMemberships).where(eq(businessMemberships.businessId, demoBusinessId));

    return resolvedUserId;
  });

  await applyBusinessPreset(demoBusinessId);

  const requiredServiceNames = Array.from(
    new Set(appointmentSeeds.flatMap((seed) => seed.services.map((service) => service.name)))
  );
  const seededServices = await db
    .select({ id: services.id, name: services.name })
    .from(services)
    .where(and(eq(services.businessId, demoBusinessId), inArray(services.name, requiredServiceNames)));

  const serviceIdByName = new Map(
    seededServices
      .filter((service) => service.name)
      .map((service) => [String(service.name), service.id])
  );

  for (const serviceName of requiredServiceNames) {
    if (!serviceIdByName.has(serviceName)) {
      throw new Error(`Missing seeded service "${serviceName}" after applying the business preset.`);
    }
  }

  const ownerMembershipId = deterministicUuid("membership:owner");
  const ownerStaffCreatedAt = offsetDate(-120, 8, 30);
  const leadTechCreatedAt = offsetDate(-60, 10, 0);

  const clientRows = [
    {
      id: clientIds.maya,
      businessId: demoBusinessId,
      firstName: "Maya",
      lastName: "Chen",
      email: "maya.chen@example.com",
      phone: "(916) 555-0182",
      address: "1450 R Street",
      city: "Sacramento",
      state: "CA",
      zip: "95811",
      notes: "Prefers text confirmations and morning appointments.",
      internalNotes: "Strong repeat customer. Good record for reviewing customer detail + native actions.",
      marketingOptIn: true,
      createdAt: offsetDate(-180, 14, 0),
      updatedAt: offsetDate(-1, 16, 0),
    },
    {
      id: clientIds.daniel,
      businessId: demoBusinessId,
      firstName: "Daniel",
      lastName: "Rivera",
      email: "daniel.rivera@example.com",
      phone: "(916) 555-0104",
      address: "7800 Laguna Boulevard",
      city: "Elk Grove",
      state: "CA",
      zip: "95758",
      notes: "Wants a progress update before lunch.",
      internalNotes: "Use this account for the in-progress work example.",
      marketingOptIn: true,
      createdAt: offsetDate(-120, 12, 30),
      updatedAt: addMinutes(now, -20),
    },
    {
      id: clientIds.olivia,
      businessId: demoBusinessId,
      firstName: "Olivia",
      lastName: "Brooks",
      email: "olivia.brooks@example.com",
      phone: "(916) 555-0135",
      address: "401 Sutter Street",
      city: "Folsom",
      state: "CA",
      zip: "95630",
      notes: "Pickup available after 5 PM.",
      internalNotes: "Use this customer for the partial invoice example.",
      marketingOptIn: true,
      createdAt: offsetDate(-90, 11, 45),
      updatedAt: addMinutes(now, -90),
    },
    {
      id: clientIds.jordan,
      businessId: demoBusinessId,
      firstName: "Jordan",
      lastName: "Kim",
      email: "jordan.kim@example.com",
      phone: "(916) 555-0190",
      address: "9297 Greenback Lane",
      city: "Orangevale",
      state: "CA",
      zip: "95662",
      notes: "Requested a paint-enhancement estimate from the public inquiry form.",
      internalNotes: "Acts as the fresh lead / estimate example and drives the lead notification.",
      marketingOptIn: true,
      createdAt: offsetDate(-2, 10, 5),
      updatedAt: offsetDate(0, 9, 10),
    },
  ];

  const vehicleRows = [
    {
      id: vehicleIds.mayaTesla,
      businessId: demoBusinessId,
      clientId: clientIds.maya,
      make: "Tesla",
      model: "Model Y",
      year: 2022,
      trim: "Long Range",
      color: "Midnight Silver",
      licensePlate: "9LST482",
      displayName: "2022 Tesla Model Y",
      mileage: 22410,
      notes: "Garage-kept. Customer is particular about tire dressing sling.",
      createdAt: offsetDate(-180, 14, 10),
      updatedAt: offsetDate(-1, 16, 0),
    },
    {
      id: vehicleIds.danielTruck,
      businessId: demoBusinessId,
      clientId: clientIds.daniel,
      make: "Ford",
      model: "F-150",
      year: 2021,
      trim: "Lariat",
      color: "Oxford White",
      licensePlate: "8TRK541",
      displayName: "2021 Ford F-150",
      mileage: 31850,
      notes: "Truck sees weekly job-site use. Good before/after candidate.",
      createdAt: offsetDate(-120, 12, 35),
      updatedAt: addMinutes(now, -20),
    },
    {
      id: vehicleIds.oliviaBmw,
      businessId: demoBusinessId,
      clientId: clientIds.olivia,
      make: "BMW",
      model: "X5",
      year: 2020,
      trim: "xDrive40i",
      color: "Black Sapphire",
      licensePlate: "7BMW150",
      displayName: "2020 BMW X5",
      mileage: 41205,
      notes: "Dog-hair-heavy interior. Good invoice example.",
      createdAt: offsetDate(-90, 12, 0),
      updatedAt: offsetDate(-3, 13, 20),
    },
    {
      id: vehicleIds.jordanSubaru,
      businessId: demoBusinessId,
      clientId: clientIds.jordan,
      make: "Subaru",
      model: "Crosstrek",
      year: 2023,
      trim: "Sport",
      color: "Horizon Blue",
      licensePlate: "9SUB208",
      displayName: "2023 Subaru Crosstrek",
      mileage: 12480,
      notes: "New lead asking about gloss improvement before a road trip.",
      createdAt: offsetDate(-2, 10, 8),
      updatedAt: offsetDate(0, 9, 10),
    },
  ];

  const appointmentRows = appointmentSeeds.map((seed) => {
    const finance = buildFinance(seed.services.map((service) => ({
      description: service.name,
      quantity: service.quantity,
      unitPrice: service.unitPrice,
    })));
    return {
      id: seed.id,
      businessId: demoBusinessId,
      clientId: seed.clientId,
      vehicleId: seed.vehicleId,
      assignedStaffId: seed.assignedStaffId,
      locationId: seed.locationId,
      title: seed.title,
      startTime: seed.startTime,
      endTime: seed.endTime,
      jobStartTime: seed.jobStartTime ?? null,
      expectedCompletionTime: seed.expectedCompletionTime ?? null,
      pickupReadyTime: seed.pickupReadyTime ?? null,
      vehicleOnSite: seed.vehicleOnSite,
      jobPhase: seed.jobPhase,
      status: seed.status,
      subtotal: money(finance.subtotal),
      taxRate: money(finance.taxRate),
      taxAmount: money(finance.taxAmount),
      applyTax: true,
      adminFeeRate: money(0),
      adminFeeAmount: money(0),
      applyAdminFee: false,
      totalPrice: money(finance.total),
      depositAmount: money(seed.depositAmount),
      depositPaid: seed.depositAmount > 0 && seed.status === "in_progress",
      notes: seed.notes,
      internalNotes: seed.internalNotes,
      completedAt: seed.completedAt ?? null,
      createdAt: seed.createdAt,
      updatedAt: seed.updatedAt,
    };
  });

  const quoteRows = quoteSeeds.map((seed) => {
    const finance = buildFinance(seed.lineItems);
    return {
      id: seed.id,
      businessId: demoBusinessId,
      clientId: seed.clientId,
      vehicleId: seed.vehicleId,
      appointmentId: seed.appointmentId,
      status: seed.status,
      subtotal: money(finance.subtotal),
      taxRate: money(finance.taxRate),
      taxAmount: money(finance.taxAmount),
      total: money(finance.total),
      expiresAt: seed.expiresAt,
      sentAt: seed.sentAt,
      followUpSentAt: seed.followUpSentAt,
      notes: seed.notes,
      createdAt: seed.createdAt,
      updatedAt: seed.updatedAt,
    };
  });

  const invoiceRows = invoiceSeeds.map((seed) => {
    const finance = buildFinance(seed.lineItems);
    return {
      id: seed.id,
      businessId: demoBusinessId,
      clientId: seed.clientId,
      appointmentId: seed.appointmentId,
      invoiceNumber: seed.invoiceNumber,
      status: seed.status,
      subtotal: money(finance.subtotal),
      taxRate: money(finance.taxRate),
      taxAmount: money(finance.taxAmount),
      discountAmount: money(0),
      total: money(finance.total),
      dueDate: seed.dueDate,
      paidAt: seed.paidAt,
      notes: seed.notes,
      createdAt: seed.createdAt,
      updatedAt: seed.updatedAt,
    };
  });

  const notificationSeeds: NotificationSeed[] = [
    {
      id: deterministicUuid("notification:new-lead"),
      type: "new_lead",
      title: "New lead from the booking form",
      message: "Jordan Kim requested a paint-enhancement estimate for a 2023 Subaru Crosstrek.",
      entityType: "client",
      entityId: clientIds.jordan,
      isRead: false,
      metadata: {
        notificationBucket: "leads",
        path: `/clients/${clientIds.jordan}?from=${encodeURIComponent("/leads")}`,
      },
      createdAt: offsetDate(0, 8, 55),
    },
    {
      id: deterministicUuid("notification:appointment"),
      type: "appointment_created",
      title: "Upcoming mobile job is ready to review",
      message: "Maya Chen's mobile maintenance wash is scheduled for tomorrow at 10:30 AM.",
      entityType: "appointment",
      entityId: appointmentIds.mayaUpcoming,
      isRead: false,
      metadata: {
        notificationBucket: "calendar",
        path: `/appointments/${appointmentIds.mayaUpcoming}`,
      },
      createdAt: offsetDate(0, 9, 20),
    },
    {
      id: deterministicUuid("notification:payment"),
      type: "payment_received",
      title: "Payment received",
      message: "Olivia Brooks paid $150.00 toward invoice INV-2107.",
      entityType: "payment",
      entityId: paymentIds.oliviaDeposit,
      isRead: true,
      metadata: {
        notificationBucket: "finance",
        invoiceId: invoiceIds.oliviaPartial,
        path: `/invoices/${invoiceIds.oliviaPartial}`,
        amount: 150,
      },
      createdAt: addMinutes(now, -100),
    },
  ];

  const vehiclePhoto = svgDataUrl({
    label: "Vehicle intake photo",
    accent: "#f97316",
    secondary: "#ffedd5",
  });
  const appointmentPhoto = svgDataUrl({
    label: "Appointment progress photo",
    accent: "#0f766e",
    secondary: "#ccfbf1",
  });
  const clientPhoto = svgDataUrl({
    label: "Customer record attachment",
    accent: "#1d4ed8",
    secondary: "#dbeafe",
  });

  await db.transaction(async (tx) => {
    await tx.insert(businessMemberships).values({
      id: ownerMembershipId,
      businessId: demoBusinessId,
      userId,
      role: "owner",
      status: "active",
      isDefault: true,
      invitedAt: offsetDate(-120, 8, 0),
      joinedAt: offsetDate(-120, 8, 30),
      lastActiveAt: now,
      createdAt: offsetDate(-120, 8, 30),
      updatedAt: now,
    });

    await tx.insert(locations).values({
      id: demoLocationId,
      businessId: demoBusinessId,
      name: "Sacramento Studio",
      address: "820 Power Inn Road, Sacramento, CA 95826",
      phone: "(916) 555-0148",
      timezone: "America/Los_Angeles",
      active: true,
      createdAt: offsetDate(-120, 9, 0),
      updatedAt: now,
    });

    await tx.insert(staff).values([
      {
        id: ownerStaffId,
        businessId: demoBusinessId,
        userId,
        firstName: "App",
        lastName: "Review",
        email: reviewEmail,
        role: "owner",
        active: true,
        createdAt: ownerStaffCreatedAt,
        updatedAt: now,
      },
      {
        id: leadTechId,
        businessId: demoBusinessId,
        userId: null,
        firstName: "Ava",
        lastName: "Martinez",
        email: "ava.martinez@example.com",
        role: "technician",
        active: true,
        createdAt: leadTechCreatedAt,
        updatedAt: now,
      },
    ]);

    await tx.insert(clients).values(clientRows);
    await tx.insert(vehicles).values(vehicleRows);
    await tx.insert(appointments).values(appointmentRows);

    await tx.insert(appointmentServices).values(
      appointmentSeeds.flatMap((appointmentSeed) =>
        appointmentSeed.services.map((service, index) => ({
          id: deterministicUuid(`appointment-service:${appointmentSeed.id}:${index}:${service.name}`),
          appointmentId: appointmentSeed.id,
          serviceId: serviceIdByName.get(service.name)!,
          quantity: service.quantity,
          unitPrice: money(service.unitPrice),
          createdAt: appointmentSeed.createdAt,
          updatedAt: appointmentSeed.updatedAt,
        }))
      )
    );

    await tx.insert(quotes).values(quoteRows);
    await tx.insert(quoteLineItems).values(
      quoteSeeds.flatMap((quoteSeed) =>
        quoteSeed.lineItems.map((item, index) => ({
          id: deterministicUuid(`quote-line:${quoteSeed.id}:${index}`),
          quoteId: quoteSeed.id,
          description: item.description,
          quantity: item.quantity.toFixed(2),
          unitPrice: money(item.unitPrice),
          total: money(item.quantity * item.unitPrice),
          createdAt: quoteSeed.createdAt,
          updatedAt: quoteSeed.updatedAt,
        }))
      )
    );

    await tx.insert(invoices).values(invoiceRows);
    await tx.insert(invoiceLineItems).values(
      invoiceSeeds.flatMap((invoiceSeed) =>
        invoiceSeed.lineItems.map((item, index) => ({
          id: deterministicUuid(`invoice-line:${invoiceSeed.id}:${index}`),
          invoiceId: invoiceSeed.id,
          description: item.description,
          quantity: item.quantity.toFixed(2),
          unitPrice: money(item.unitPrice),
          total: money(item.quantity * item.unitPrice),
          createdAt: invoiceSeed.createdAt,
          updatedAt: invoiceSeed.updatedAt,
        }))
      )
    );

    await tx.insert(payments).values(
      paymentSeeds.map((paymentSeed) => ({
        id: paymentSeed.id,
        businessId: demoBusinessId,
        invoiceId: paymentSeed.invoiceId,
        amount: money(paymentSeed.amount),
        method: paymentSeed.method,
        paidAt: paymentSeed.paidAt,
        notes: paymentSeed.notes,
        referenceNumber: paymentSeed.referenceNumber,
        idempotencyKey: null,
        createdAt: paymentSeed.paidAt,
        updatedAt: paymentSeed.paidAt,
      }))
    );

    await tx.insert(mediaAssets).values([
      {
        id: deterministicUuid("media:vehicle:maya"),
        businessId: demoBusinessId,
        entityType: "vehicle",
        entityId: vehicleIds.mayaTesla,
        label: "Vehicle condition photo",
        fileName: "maya-tesla-intake.svg",
        contentType: "image/svg+xml",
        byteSize: vehiclePhoto.byteSize,
        width: vehiclePhoto.width,
        height: vehiclePhoto.height,
        dataUrl: vehiclePhoto.dataUrl,
        createdByUserId: userId,
        createdAt: offsetDate(-1, 15, 0),
        updatedAt: offsetDate(-1, 15, 0),
      },
      {
        id: deterministicUuid("media:appointment:daniel"),
        businessId: demoBusinessId,
        entityType: "appointment",
        entityId: appointmentIds.danielActive,
        label: "Coating progress photo",
        fileName: "daniel-f150-progress.svg",
        contentType: "image/svg+xml",
        byteSize: appointmentPhoto.byteSize,
        width: appointmentPhoto.width,
        height: appointmentPhoto.height,
        dataUrl: appointmentPhoto.dataUrl,
        createdByUserId: userId,
        createdAt: addMinutes(now, -70),
        updatedAt: addMinutes(now, -70),
      },
      {
        id: deterministicUuid("media:client:olivia"),
        businessId: demoBusinessId,
        entityType: "client",
        entityId: clientIds.olivia,
        label: "Customer handoff note",
        fileName: "olivia-handoff.svg",
        contentType: "image/svg+xml",
        byteSize: clientPhoto.byteSize,
        width: clientPhoto.width,
        height: clientPhoto.height,
        dataUrl: clientPhoto.dataUrl,
        createdByUserId: userId,
        createdAt: offsetDate(-3, 14, 10),
        updatedAt: offsetDate(-3, 14, 10),
      },
    ]);

    await tx.insert(activityLogs).values([
      {
        id: deterministicUuid("activity:lead-created"),
        businessId: demoBusinessId,
        action: "lead.created",
        entityType: "client",
        entityId: clientIds.jordan,
        userId,
        metadata: JSON.stringify({ source: "booking_form" }),
        createdAt: offsetDate(-2, 10, 5),
      },
      {
        id: deterministicUuid("activity:quote-sent"),
        businessId: demoBusinessId,
        action: "quote.sent",
        entityType: "quote",
        entityId: quoteIds.jordanSent,
        userId,
        metadata: JSON.stringify({ clientId: clientIds.jordan }),
        createdAt: offsetDate(-1, 11, 15),
      },
      {
        id: deterministicUuid("activity:quote-accepted"),
        businessId: demoBusinessId,
        action: "quote.accepted",
        entityType: "quote",
        entityId: quoteIds.mayaAccepted,
        userId,
        metadata: JSON.stringify({ appointmentId: appointmentIds.mayaUpcoming }),
        createdAt: offsetDate(-2, 14, 15),
      },
      {
        id: deterministicUuid("activity:appointment-created"),
        businessId: demoBusinessId,
        action: "appointment.created",
        entityType: "appointment",
        entityId: appointmentIds.mayaUpcoming,
        userId,
        metadata: JSON.stringify({ source: "quote" }),
        createdAt: offsetDate(-2, 14, 20),
      },
      {
        id: deterministicUuid("activity:appointment-reminder"),
        businessId: demoBusinessId,
        action: "automation.appointment_reminder.sent",
        entityType: "appointment",
        entityId: appointmentIds.mayaUpcoming,
        userId,
        metadata: JSON.stringify({ channel: "email" }),
        createdAt: offsetDate(0, 7, 55),
      },
      {
        id: deterministicUuid("activity:appointment-completed"),
        businessId: demoBusinessId,
        action: "appointment.completed",
        entityType: "appointment",
        entityId: appointmentIds.oliviaCompleted,
        userId,
        metadata: JSON.stringify({ invoiceId: invoiceIds.oliviaPartial }),
        createdAt: offsetDate(-3, 13, 20),
      },
      {
        id: deterministicUuid("activity:invoice-created"),
        businessId: demoBusinessId,
        action: "invoice.created",
        entityType: "invoice",
        entityId: invoiceIds.oliviaPartial,
        userId,
        metadata: JSON.stringify({ appointmentId: appointmentIds.oliviaCompleted }),
        createdAt: offsetDate(-3, 14, 0),
      },
      {
        id: deterministicUuid("activity:payment-recorded-olivia"),
        businessId: demoBusinessId,
        action: "payment.recorded",
        entityType: "invoice",
        entityId: invoiceIds.oliviaPartial,
        userId,
        metadata: JSON.stringify({ paymentId: paymentIds.oliviaDeposit, amount: 150, method: "card" }),
        createdAt: addMinutes(now, -120),
      },
      {
        id: deterministicUuid("activity:payment-recorded-maya"),
        businessId: demoBusinessId,
        action: "payment.recorded",
        entityType: "invoice",
        entityId: invoiceIds.mayaPaid,
        userId,
        metadata: JSON.stringify({
          paymentId: paymentIds.mayaPaid,
          amount: paymentSeeds[1]?.amount ?? 0,
          method: "card",
        }),
        createdAt: offsetDate(-10, 15, 30),
      },
      {
        id: deterministicUuid("activity:review-request"),
        businessId: demoBusinessId,
        action: "automation.review_request.sent",
        entityType: "appointment",
        entityId: appointmentIds.mayaPaidHistory,
        userId,
        metadata: JSON.stringify({ channel: "email" }),
        createdAt: offsetDate(-9, 11, 10),
      },
    ]);

    await tx.insert(notificationLogs).values([
      {
        id: deterministicUuid("notification-log:appointment-reminder"),
        businessId: demoBusinessId,
        integrationJobId: null,
        channel: "email",
        recipient: "maya.chen@example.com",
        subject: "Tomorrow's mobile maintenance wash",
        sentAt: offsetDate(0, 7, 55),
        providerMessageId: "app-review-demo-appointment-reminder",
        providerStatus: "delivered",
        providerStatusAt: offsetDate(0, 7, 58),
        deliveredAt: offsetDate(0, 7, 58),
        providerErrorCode: null,
        error: null,
        metadata: JSON.stringify({ template: "appointment_reminder" }),
        retryCount: 0,
        lastRetryAt: null,
      },
      {
        id: deterministicUuid("notification-log:quote-followup"),
        businessId: demoBusinessId,
        integrationJobId: null,
        channel: "email",
        recipient: "jordan.kim@example.com",
        subject: "Quick follow-up on your estimate",
        sentAt: offsetDate(0, 9, 10),
        providerMessageId: "app-review-demo-quote-followup",
        providerStatus: "delivered",
        providerStatusAt: offsetDate(0, 9, 12),
        deliveredAt: offsetDate(0, 9, 12),
        providerErrorCode: null,
        error: null,
        metadata: JSON.stringify({ template: "abandoned_quote" }),
        retryCount: 0,
        lastRetryAt: null,
      },
      {
        id: deterministicUuid("notification-log:review-request"),
        businessId: demoBusinessId,
        integrationJobId: null,
        channel: "sms",
        recipient: "(916) 555-0182",
        subject: null,
        sentAt: offsetDate(-9, 11, 10),
        providerMessageId: "app-review-demo-review-request",
        providerStatus: "delivered",
        providerStatusAt: offsetDate(-9, 11, 11),
        deliveredAt: offsetDate(-9, 11, 11),
        providerErrorCode: null,
        error: null,
        metadata: JSON.stringify({ template: "review_request" }),
        retryCount: 0,
        lastRetryAt: null,
      },
    ]);

    await tx.insert(notifications).values(
      notificationSeeds.map((seed) => ({
        id: seed.id,
        businessId: demoBusinessId,
        userId,
        type: seed.type,
        title: seed.title,
        message: seed.message,
        entityType: seed.entityType,
        entityId: seed.entityId,
        isRead: seed.isRead,
        metadata: JSON.stringify(seed.metadata),
        createdAt: seed.createdAt,
        updatedAt: seed.createdAt,
      }))
    );

    await tx.insert(dashboardPreferences).values({
      id: deterministicUuid("dashboard-preferences"),
      businessId: demoBusinessId,
      userId,
      widgetOrder: "[]",
      hiddenWidgets: "[]",
      defaultRange: "week",
      defaultTeamMemberId: null,
      dismissedQueueItems: "{}",
      snoozedQueueItems: "{}",
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    });
  });

  console.log("[seed-app-review-demo] App Review demo account is ready.");
  console.table({
    businessId: demoBusinessId,
    businessName,
    email: reviewEmail,
    customers: clientRows.length,
    vehicles: vehicleRows.length,
    appointments: appointmentRows.length,
    quotes: quoteRows.length,
    invoices: invoiceRows.length,
    notifications: notificationSeeds.length,
    mediaAssets: 3,
  });

  console.log("[seed-app-review-demo] Reviewer path highlights");
  console.table([
    { step: 1, surface: "Dashboard", target: businessName, note: "Revenue, jobs, notifications, and recent activity are preloaded." },
    { step: 2, surface: "Calendar", target: "Maya Chen - Mobile maintenance wash", note: "Upcoming mobile appointment with native actions and map address." },
    { step: 3, surface: "Appointment detail", target: "Maya Chen", note: "Use call, text, email, Maps, reminder, quick actions, and photo intake." },
    { step: 4, surface: "Customer detail", target: "Maya Chen / 2022 Tesla Model Y", note: "Customer tools, vehicle history, invoices, and photos are populated." },
    { step: 5, surface: "Notifications", target: "Bell icon", note: "Lead, calendar, and finance examples are seeded." },
    { step: 6, surface: "Settings > Account", target: "Delete account", note: "Keep deletion as the last reviewer step because it signs the user out." },
  ]);
}

main()
  .catch((error) => {
    console.error("[seed-app-review-demo] Failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });

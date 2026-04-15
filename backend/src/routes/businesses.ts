import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  appointmentServices,
  appointments,
  bookingDrafts,
  businessMemberships,
  businesses,
  clients,
  locations,
  serviceCategories,
  serviceAddonLinks,
  services,
  users,
  vehicles,
} from "../db/schema.js";
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { NotFoundError, ForbiddenError, BadRequestError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { randomUUID } from "crypto";
import { getBusinessTypeDefaults } from "../lib/businessTypeDefaults.js";
import { roleHasPermission } from "../lib/permissions.js";
import { warnOnce } from "../lib/warnOnce.js";
import { wrapAsync } from "../lib/asyncHandler.js";
import { syncOutboundWebhookConnectionForBusiness } from "../lib/integrations.js";
import { isIntegrationVaultConfigured } from "../lib/integrationVault.js";
import {
  isLegacyPlaintextWebhookSecret,
  normalizeBusinessWebhookSecretForStorage,
  readBusinessWebhookSecret,
} from "../lib/businessWebhookSecret.js";
import { createRateLimiter } from "../middleware/security.js";
import { createActivityLog } from "../lib/activity.js";
import { buildLeadNotes } from "../lib/leads.js";
import { enqueueTwilioTemplateSms } from "../lib/twilio.js";
import { isEmailConfigured, isStripeConfigured } from "../lib/env.js";
import { sendAppointmentConfirmation, sendLeadAutoResponse, sendLeadFollowUpAlert } from "../lib/email.js";
import { ensureBusinessTrialSubscription } from "../lib/billingLifecycle.js";
import { hasFullBillingAccess } from "../lib/billingAccess.js";
import {
  buildSlotsForDate,
  normalizeBookingDayIndexes,
  normalizeBookingServiceMode,
  parseTimeToMinutes,
  resolveCustomerBookingMode,
  resolveBookingFlow,
  toBookingBufferMinutes,
  toBookingDurationMinutes,
  toBookingLeadTimeHours,
  toBookingWindowDays,
  type BookingDefaultFlow,
} from "../lib/booking.js";
import { countOverlappingAppointments } from "../lib/appointmentOverlap.js";
import { buildPublicAppUrl, buildPublicDocumentUrl, createPublicDocumentToken } from "../lib/publicDocumentAccess.js";
import { buildVehicleDisplayName } from "../lib/vehicleFormatting.js";
import { calculateAppointmentFinanceTotals } from "../lib/revenueTotals.js";
import {
  buildBookingDraftComparableSignature,
  deriveBookingDraftStatus,
  hasMeaningfulBookingDraftIntent,
  type BookingDraftStatus,
} from "../lib/bookingDrafts.js";

export const businessesRouter = Router({ mergeParams: true });
type BusinessRecord = typeof businesses.$inferSelect;

const createSchema = z.object({
  name: z.string().min(1),
  type: z.enum([
    "auto_detailing",
    "mobile_detailing",
    "wrap_ppf",
    "window_tinting",
    "performance",
    "mechanic",
    "tire_shop",
    "muffler_shop",
  ]),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  zip: z.string().nullable().optional(),
  staffCount: z.number().int().min(0).max(500).nullable().optional(),
  operatingHours: z.string().max(1000).nullable().optional(),
  timezone: z.string().nullable().optional(),
  currency: z.string().length(3).nullable().optional(),
  defaultTaxRate: z.coerce.number().min(0).max(100).optional(),
  defaultAdminFee: z.coerce.number().min(0).max(100).optional(),
  defaultAdminFeeEnabled: z.boolean().optional(),
  defaultAppointmentStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  appointmentBufferMinutes: z.number().int().min(0).max(1440).optional(),
  calendarBlockCapacityPerSlot: z.number().int().min(1).max(12).optional(),
  leadCaptureEnabled: z.boolean().optional(),
  leadAutoResponseEnabled: z.boolean().optional(),
  leadAutoResponseEmailEnabled: z.boolean().optional(),
  leadAutoResponseSmsEnabled: z.boolean().optional(),
  notificationAppointmentConfirmationEmailEnabled: z.boolean().optional(),
  notificationAppointmentReminderEmailEnabled: z.boolean().optional(),
  notificationAbandonedQuoteEmailEnabled: z.boolean().optional(),
  notificationReviewRequestEmailEnabled: z.boolean().optional(),
  notificationLapsedClientEmailEnabled: z.boolean().optional(),
  missedCallTextBackEnabled: z.boolean().optional(),
  automationUncontactedLeadsEnabled: z.boolean().optional(),
  automationUncontactedLeadHours: z.number().int().min(1).max(168).optional(),
  automationAppointmentRemindersEnabled: z.boolean().optional(),
  automationAppointmentReminderHours: z.number().int().min(1).max(336).optional(),
  automationSendWindowStartHour: z.number().int().min(0).max(23).optional(),
  automationSendWindowEndHour: z.number().int().min(0).max(23).optional(),
  automationReviewRequestsEnabled: z.boolean().optional(),
  automationReviewRequestDelayHours: z.number().int().min(1).max(336).optional(),
  reviewRequestUrl: z.string().url().nullable().optional(),
  automationAbandonedQuotesEnabled: z.boolean().optional(),
  automationAbandonedQuoteHours: z.number().int().min(1).max(336).optional(),
  automationLapsedClientsEnabled: z.boolean().optional(),
  automationLapsedClientMonths: z.number().int().min(1).max(36).optional(),
  bookingRequestUrl: z.string().url().nullable().optional(),
  bookingEnabled: z.boolean().optional(),
  bookingDefaultFlow: z.enum(["request", "self_book"]).optional(),
  bookingPageTitle: z.string().max(120).nullable().optional(),
  bookingPageSubtitle: z.string().max(280).nullable().optional(),
  bookingConfirmationMessage: z.string().max(280).nullable().optional(),
  bookingTrustBulletPrimary: z.string().max(80).nullable().optional(),
  bookingTrustBulletSecondary: z.string().max(80).nullable().optional(),
  bookingTrustBulletTertiary: z.string().max(80).nullable().optional(),
  bookingNotesPrompt: z.string().max(160).nullable().optional(),
  bookingBrandLogoUrl: z.string().url().max(1000).nullable().optional(),
  bookingBrandPrimaryColorToken: z.enum(["orange", "sky", "emerald", "rose", "slate"]).optional(),
  bookingBrandAccentColorToken: z.enum(["amber", "blue", "mint", "violet", "stone"]).optional(),
  bookingBrandBackgroundToneToken: z.enum(["ivory", "mist", "sand", "slate"]).optional(),
  bookingBrandButtonStyleToken: z.enum(["solid", "soft", "outline"]).optional(),
  bookingRequireEmail: z.boolean().optional(),
  bookingRequirePhone: z.boolean().optional(),
  bookingRequireVehicle: z.boolean().optional(),
  bookingAllowCustomerNotes: z.boolean().optional(),
  bookingShowPrices: z.boolean().optional(),
  bookingShowDurations: z.boolean().optional(),
  bookingAvailableDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  bookingAvailableStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  bookingAvailableEndTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  bookingBlackoutDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(90).optional(),
  bookingSlotIntervalMinutes: z.number().int().min(15).max(120).optional(),
  bookingBufferMinutes: z.number().int().min(0).max(240).nullable().optional(),
  bookingCapacityPerSlot: z.number().int().min(1).max(12).nullable().optional(),
  monthlyRevenueGoal: z.coerce.number().min(0).max(100000000).nullable().optional(),
  monthlyJobsGoal: z.number().int().min(0).max(100000).nullable().optional(),
  integrationWebhookEnabled: z.boolean().optional(),
  integrationWebhookUrl: z.string().url().nullable().optional(),
  integrationWebhookSecret: z.string().max(255).nullable().optional(),
  integrationWebhookEvents: z.array(z.string().min(1).max(120)).max(24).optional(),
});

const updateSchema = createSchema
  .partial()
  .extend({
    website: z.string().nullable().optional(),
    bio: z.string().nullable().optional(),
    instagram: z.string().nullable().optional(),
    facebook: z.string().nullable().optional(),
    googleReviewLink: z.string().nullable().optional(),
    yelpReviewLink: z.string().nullable().optional(),
    facebookReviewLink: z.string().nullable().optional(),
  })
  .strict();

const publicLeadConfigParamsSchema = z.object({
  id: z.string().uuid("Invalid business id."),
});

const publicLeadCaptureSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required.").max(80),
  lastName: z.string().trim().min(1, "Last name is required.").max(80),
  email: z.string().trim().email("Enter a valid email address.").optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  vehicle: z.string().trim().max(160).optional().or(z.literal("")),
  serviceInterest: z.string().trim().max(160).optional().or(z.literal("")),
  summary: z.string().trim().max(1200).optional().or(z.literal("")),
  source: z.string().trim().max(120).optional().or(z.literal("")),
  campaign: z.string().trim().max(120).optional().or(z.literal("")),
  marketingOptIn: z.boolean().optional(),
  website: z.string().max(0).optional(), // honeypot
});

const publicBookingConfigLimiter = createRateLimiter({
  id: "public_booking_config",
  windowMs: 60 * 1000,
  max: 90,
  message: "Please try again shortly.",
});

const publicBookingAvailabilityLimiter = createRateLimiter({
  id: "public_booking_availability",
  windowMs: 60 * 1000,
  max: 120,
  message: "Please refresh availability in a moment.",
});

const publicBookingSubmitLimiter = createRateLimiter({
  id: "public_booking_submit",
  windowMs: 15 * 60 * 1000,
  max: 12,
  key: ({ ip, path, body }) => {
    const email =
      body && typeof body === "object" && typeof (body as Record<string, unknown>).email === "string"
        ? String((body as Record<string, unknown>).email).trim().toLowerCase()
        : "";
    return `${path}:${ip}:${email}`;
  },
  message: "Too many booking attempts. Please wait a few minutes and try again.",
});

const publicBookingAvailabilityQuerySchema = z.object({
  serviceId: z.string().uuid("Select a valid service."),
  addonServiceIds: z.string().trim().optional(),
  locationId: z.string().uuid().optional(),
  serviceMode: z.enum(["in_shop", "mobile"]).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Select a valid date."),
});

const publicBookingSubmitSchema = z.object({
  serviceId: z.string().uuid("Select a valid service."),
  addonServiceIds: z.array(z.string().uuid()).optional(),
  draftResumeToken: z.string().trim().max(255).optional().or(z.literal("")),
  locationId: z.string().uuid().optional(),
  serviceMode: z.enum(["in_shop", "mobile"]).optional(),
  startTime: z.string().datetime().optional(),
  firstName: z.string().trim().min(1, "First name is required.").max(80),
  lastName: z.string().trim().min(1, "Last name is required.").max(80),
  email: z.string().trim().email("Enter a valid email address.").optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  vehicleYear: z.preprocess((value) => (value === "" ? undefined : value), z.coerce.number().int().min(1900).max(2100).optional()),
  vehicleMake: z.string().trim().max(80).optional().or(z.literal("")),
  vehicleModel: z.string().trim().max(80).optional().or(z.literal("")),
  vehicleColor: z.string().trim().max(80).optional().or(z.literal("")),
  serviceAddress: z.string().trim().max(120).optional().or(z.literal("")),
  serviceCity: z.string().trim().max(80).optional().or(z.literal("")),
  serviceState: z.string().trim().max(40).optional().or(z.literal("")),
  serviceZip: z.string().trim().max(20).optional().or(z.literal("")),
  notes: z.string().trim().max(1200).optional().or(z.literal("")),
  marketingOptIn: z.boolean().optional(),
  source: z.string().trim().max(120).optional().or(z.literal("")),
  campaign: z.string().trim().max(120).optional().or(z.literal("")),
  website: z.string().max(0).optional(),
});

const publicBookingDraftLimiter = createRateLimiter({
  id: "public_booking_draft",
  windowMs: 15 * 60 * 1000,
  max: 60,
  key: ({ ip, path, body }) => {
    const resumeToken =
      body && typeof body === "object" && typeof (body as Record<string, unknown>).resumeToken === "string"
        ? String((body as Record<string, unknown>).resumeToken).trim()
        : "";
    return `${path}:${ip}:${resumeToken}`;
  },
  message: "Please wait a moment before saving again.",
});

const publicBookingDraftResumeLimiter = createRateLimiter({
  id: "public_booking_draft_resume",
  windowMs: 5 * 60 * 1000,
  max: 40,
  message: "Please refresh the booking page in a moment.",
});

const publicBookingDraftAbandonLimiter = createRateLimiter({
  id: "public_booking_draft_abandon",
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: "Please try again shortly.",
});

const publicBookingDraftParamsSchema = z.object({
  id: z.string().uuid("Invalid business id."),
  resumeToken: z.string().trim().min(16, "Invalid draft token.").max(255),
});

const publicBookingDraftSaveSchema = z.object({
  resumeToken: z.string().trim().min(16).max(255).optional(),
  serviceId: z.string().uuid("Select a valid service."),
  addonServiceIds: z.array(z.string().uuid()).optional(),
  serviceMode: z.enum(["in_shop", "mobile"]).optional(),
  locationId: z.string().uuid().optional().or(z.literal("")),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  startTime: z.string().datetime().optional().or(z.literal("")),
  firstName: z.string().trim().max(80).optional().or(z.literal("")),
  lastName: z.string().trim().max(80).optional().or(z.literal("")),
  email: z.string().trim().email("Enter a valid email address.").optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  vehicleYear: z.preprocess((value) => (value === "" ? undefined : value), z.coerce.number().int().min(1900).max(2100).optional()),
  vehicleMake: z.string().trim().max(80).optional().or(z.literal("")),
  vehicleModel: z.string().trim().max(80).optional().or(z.literal("")),
  vehicleColor: z.string().trim().max(80).optional().or(z.literal("")),
  serviceAddress: z.string().trim().max(120).optional().or(z.literal("")),
  serviceCity: z.string().trim().max(80).optional().or(z.literal("")),
  serviceState: z.string().trim().max(40).optional().or(z.literal("")),
  serviceZip: z.string().trim().max(20).optional().or(z.literal("")),
  notes: z.string().trim().max(1200).optional().or(z.literal("")),
  marketingOptIn: z.boolean().optional(),
  source: z.string().trim().max(120).optional().or(z.literal("")),
  campaign: z.string().trim().max(120).optional().or(z.literal("")),
  currentStep: z.number().int().min(0).max(4).optional(),
  serviceCategoryFilter: z.string().trim().max(80).optional().or(z.literal("")),
  expandedServiceId: z.string().trim().max(120).optional().or(z.literal("")),
});

const publicLeadConfigLimiter = createRateLimiter({
  id: "public_lead_config",
  windowMs: 60 * 1000,
  max: 60,
  message: "Please try again shortly.",
});

const publicLeadSubmitLimiter = createRateLimiter({
  id: "public_lead_submit",
  windowMs: 15 * 60 * 1000,
  max: 10,
  key: ({ ip, path, body }) => {
    const email =
      body && typeof body === "object" && typeof (body as Record<string, unknown>).email === "string"
        ? String((body as Record<string, unknown>).email).trim().toLowerCase()
        : "";
    return `${path}:${ip}:${email}`;
  },
  message: "Too many lead submissions. Please wait a few minutes and try again.",
});

async function loadPublicLeadBusiness(id: string) {
  const selectBusiness = () =>
    db
      .select({
        id: businesses.id,
        ownerId: businesses.ownerId,
        name: businesses.name,
        type: businesses.type,
        timezone: businesses.timezone,
        email: businesses.email,
        phone: businesses.phone,
        leadCaptureEnabled: businesses.leadCaptureEnabled,
        leadAutoResponseEnabled: businesses.leadAutoResponseEnabled,
        leadAutoResponseEmailEnabled: businesses.leadAutoResponseEmailEnabled,
        leadAutoResponseSmsEnabled: businesses.leadAutoResponseSmsEnabled,
        missedCallTextBackEnabled: businesses.missedCallTextBackEnabled,
        automationUncontactedLeadHours: businesses.automationUncontactedLeadHours,
        subscriptionStatus: businesses.subscriptionStatus,
        billingAccessState: businesses.billingAccessState,
        ownerEmail: users.email,
        ownerFirstName: users.firstName,
      })
      .from(businesses)
      .leftJoin(users, eq(users.id, businesses.ownerId))
      .where(eq(businesses.id, id))
      .limit(1);

  let business;
  try {
    [business] = await selectBusiness();
  } catch (error) {
    if (!isBusinessSchemaDriftError(error)) throw error;
    warnOnce("businesses:public-lead:schema", "repairing missing business automation columns", {
      businessId: id,
      error: error instanceof Error ? error.message : String(error),
    });
    await ensureBusinessAutomationColumns();
    [business] = await selectBusiness();
  }

  if (!business) return null;
  if (process.env.BILLING_ENFORCED === "true" && isStripeConfigured()) {
    if (
      !hasFullBillingAccess(business.billingAccessState) &&
      business.subscriptionStatus !== "active" &&
      business.subscriptionStatus !== "trialing"
    ) {
      return null;
    }
  }
  return business;
}

function cleanOptionalText(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeBookingDefaultFlowValue(value: string | null | undefined): BookingDefaultFlow {
  return value === "self_book" ? "self_book" : "request";
}

function normalizeBookingTrustBullet(
  value: string | null | undefined,
  fallback: string,
): string {
  return cleanOptionalText(value ?? undefined) ?? fallback;
}

function normalizeBookingNotesPrompt(value: string | null | undefined): string {
  return cleanOptionalText(value ?? undefined) ?? "Add timing, questions, or anything the shop should know.";
}

function parseStoredNumberArray(raw: string | null | undefined): number[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item));
  } catch {
    return [];
  }
}

function parseStoredStringArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => String(item).trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function normalizeBlackoutDates(raw: string | null | undefined): Set<string> {
  return new Set(
    parseStoredStringArray(raw).filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
  );
}

type BookingDraftRecord = typeof bookingDrafts.$inferSelect;

function isBookingDraftSchemaDriftError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown; cause?: unknown };
  const cause =
    candidate.cause && typeof candidate.cause === "object"
      ? (candidate.cause as { code?: unknown; message?: unknown })
      : candidate;
  const code = String(cause.code ?? "");
  const message = String(cause.message ?? "").toLowerCase();
  return code === "42P01" || code === "42703" || message.includes("booking_drafts");
}

function buildPublicBookingDraftComparable(input: {
  serviceId?: string | null;
  addonServiceIds?: string[] | null;
  serviceMode?: string | null;
  locationId?: string | null;
  bookingDate?: string | null;
  startTime?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  vehicleYear?: number | string | null;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  vehicleColor?: string | null;
  serviceAddress?: string | null;
  serviceCity?: string | null;
  serviceState?: string | null;
  serviceZip?: string | null;
  notes?: string | null;
  marketingOptIn?: boolean | null;
  source?: string | null;
  campaign?: string | null;
  currentStep?: number | null;
  serviceCategoryFilter?: string | null;
  expandedServiceId?: string | null;
}) {
  return {
    serviceId: input.serviceId ?? "",
    addonServiceIds: input.addonServiceIds ?? [],
    serviceMode: input.serviceMode ?? "in_shop",
    locationId: input.locationId ?? "",
    bookingDate: input.bookingDate ?? "",
    startTime: input.startTime ?? "",
    firstName: input.firstName ?? "",
    lastName: input.lastName ?? "",
    email: input.email ?? "",
    phone: input.phone ?? "",
    vehicleYear: input.vehicleYear ?? "",
    vehicleMake: input.vehicleMake ?? "",
    vehicleModel: input.vehicleModel ?? "",
    vehicleColor: input.vehicleColor ?? "",
    serviceAddress: input.serviceAddress ?? "",
    serviceCity: input.serviceCity ?? "",
    serviceState: input.serviceState ?? "",
    serviceZip: input.serviceZip ?? "",
    notes: input.notes ?? "",
    marketingOptIn: input.marketingOptIn ?? true,
    source: input.source ?? "",
    campaign: input.campaign ?? "",
    currentStep: input.currentStep ?? 0,
    serviceCategoryFilter: input.serviceCategoryFilter ?? "",
    expandedServiceId: input.expandedServiceId ?? "",
  };
}

function serializePublicBookingDraft(draft: BookingDraftRecord) {
  return {
    draftId: draft.id,
    resumeToken: draft.resumeToken,
    status: draft.status,
    savedAt: draft.updatedAt?.toISOString?.() ?? new Date(draft.updatedAt).toISOString(),
    currentStep: draft.currentStep ?? 0,
    serviceCategoryFilter: draft.serviceCategoryFilter ?? "",
    expandedServiceId: draft.expandedServiceId ?? "",
    form: {
      serviceId: draft.serviceId ?? "",
      addonServiceIds: parseStoredStringArray(draft.addonServiceIds ?? "[]"),
      serviceMode: normalizeBookingServiceMode(draft.serviceMode),
      locationId: draft.locationId ?? "",
      bookingDate: draft.bookingDate ?? "",
      startTime: draft.startTime ? draft.startTime.toISOString() : "",
      firstName: draft.firstName ?? "",
      lastName: draft.lastName ?? "",
      email: draft.email ?? "",
      phone: draft.phone ?? "",
      vehicleYear: draft.vehicleYear != null ? String(draft.vehicleYear) : "",
      vehicleMake: draft.vehicleMake ?? "",
      vehicleModel: draft.vehicleModel ?? "",
      vehicleColor: draft.vehicleColor ?? "",
      serviceAddress: draft.serviceAddress ?? "",
      serviceCity: draft.serviceCity ?? "",
      serviceState: draft.serviceState ?? "",
      serviceZip: draft.serviceZip ?? "",
      notes: draft.notes ?? "",
      marketingOptIn: draft.marketingOptIn ?? true,
      website: "",
    },
  };
}

async function findPublicBookingDraftByResumeToken(params: { businessId: string; resumeToken: string }) {
  try {
    const [draft] = await db
      .select()
      .from(bookingDrafts)
      .where(
        and(
          eq(bookingDrafts.businessId, params.businessId),
          eq(bookingDrafts.resumeToken, params.resumeToken)
        )
      )
      .limit(1);
    return draft ?? null;
  } catch (error) {
    if (!isBookingDraftSchemaDriftError(error)) throw error;
    warnOnce("booking-drafts:schema", "booking draft schema unavailable; falling back to local-only save", {
      businessId: params.businessId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function finalizePublicBookingDraft(params: {
  businessId: string;
  resumeToken: string | null;
  finalStatus: Extract<BookingDraftStatus, "submitted_request" | "confirmed_booking">;
  metadata: Record<string, unknown>;
}) {
  if (!params.resumeToken) return;

  try {
    const existing = await findPublicBookingDraftByResumeToken({
      businessId: params.businessId,
      resumeToken: params.resumeToken,
    });
    if (!existing) return;

    const now = new Date();
    const updates: Record<string, unknown> = {
      status: params.finalStatus,
      submittedAt: params.finalStatus === "submitted_request" ? now : existing.submittedAt ?? null,
      confirmedAt: params.finalStatus === "confirmed_booking" ? now : existing.confirmedAt ?? null,
      abandonedAt: null,
      lastClientEventAt: now,
      updatedAt: now,
    };

    await db
      .update(bookingDrafts)
      .set(updates)
      .where(eq(bookingDrafts.id, existing.id));

    await createActivityLog({
      businessId: params.businessId,
      action: params.finalStatus === "confirmed_booking" ? "booking.draft_confirmed" : "booking.draft_submitted",
      entityType: "booking_draft",
      entityId: existing.id,
      metadata: {
        draftStatus: params.finalStatus,
        ...params.metadata,
      },
    });
  } catch (error) {
    if (isBookingDraftSchemaDriftError(error)) return;
    throw error;
  }
}

function resolveBookingSchedule(business: {
  operatingHours?: string | null;
  bookingAvailableDays?: string | null;
  bookingAvailableStartTime?: string | null;
  bookingAvailableEndTime?: string | null;
  bookingBlackoutDates?: string | null;
  bookingSlotIntervalMinutes?: number | null;
  bookingBufferMinutes?: number | null;
  appointmentBufferMinutes?: number | null;
  bookingCapacityPerSlot?: number | null;
  calendarBlockCapacityPerSlot?: number | null;
}) {
  const dayIndexes = normalizeBookingDayIndexes(parseStoredNumberArray(business.bookingAvailableDays));
  const openTime =
    parseTimeToMinutes(business.bookingAvailableStartTime ?? "") != null
      ? business.bookingAvailableStartTime ?? null
      : null;
  const closeTime =
    parseTimeToMinutes(business.bookingAvailableEndTime ?? "") != null
      ? business.bookingAvailableEndTime ?? null
      : null;
  return {
    availableDayIndexes: dayIndexes,
    openTime,
    closeTime,
    incrementMinutes: Math.max(15, Math.min(Number(business.bookingSlotIntervalMinutes ?? 15), 120)),
    bufferMinutes: Math.max(
      0,
      Math.min(Number(business.bookingBufferMinutes ?? business.appointmentBufferMinutes ?? 15), 240)
    ),
    slotCapacity: Math.max(
      1,
      Math.min(Number(business.bookingCapacityPerSlot ?? business.calendarBlockCapacityPerSlot ?? 1), 12)
    ),
    blackoutDates: normalizeBlackoutDates(business.bookingBlackoutDates),
  };
}

function normalizeLeadSourceValue(source: string | null | undefined): Parameters<typeof buildLeadNotes>[0]["source"] {
  const normalized = (source ?? "").trim().toLowerCase();
  if (!normalized) return "website";
  if (["website", "phone", "walk_in", "referral", "instagram", "facebook", "google", "repeat_customer", "other"].includes(normalized)) {
    return normalized as Parameters<typeof buildLeadNotes>[0]["source"];
  }
  if (normalized.includes("instagram")) return "instagram";
  if (normalized.includes("facebook")) return "facebook";
  if (normalized.includes("google")) return "google";
  if (normalized.includes("referral")) return "referral";
  if (normalized.includes("phone")) return "phone";
  return "website";
}

function parsePublicBookingDate(value: string): Date {
  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const parsed = new Date(year, month - 1, day);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    throw new BadRequestError("Select a valid booking date.");
  }
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

function startOfLocalDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildBookingPageTitle(business: { bookingPageTitle?: string | null; name?: string | null }): string {
  return business.bookingPageTitle?.trim() || `Book with ${business.name?.trim() || "the shop"}`;
}

function normalizeBookingBrandLogoUrl(value: string | null | undefined) {
  return cleanOptionalText(value ?? undefined);
}

function normalizeBookingBrandPrimaryColorToken(value: string | null | undefined) {
  return value === "sky" || value === "emerald" || value === "rose" || value === "slate" ? value : "orange";
}

function normalizeBookingBrandAccentColorToken(value: string | null | undefined) {
  return value === "blue" || value === "mint" || value === "violet" || value === "stone" ? value : "amber";
}

function normalizeBookingBrandBackgroundToneToken(value: string | null | undefined) {
  return value === "mist" || value === "sand" || value === "slate" ? value : "ivory";
}

function normalizeBookingBrandButtonStyleToken(value: string | null | undefined) {
  return value === "soft" || value === "outline" ? value : "solid";
}

function buildBookingPageSubtitle(business: { bookingPageSubtitle?: string | null }): string {
  return business.bookingPageSubtitle?.trim() || "Choose the service you need, share your vehicle details, and lock in the next step without the back-and-forth.";
}

async function loadPublicBookingBusiness(id: string) {
  const business = await loadBusinessById(id);
  if (!business) return null;
  if (process.env.BILLING_ENFORCED === "true" && isStripeConfigured()) {
    if (
      !hasFullBillingAccess(business.billingAccessState) &&
      business.subscriptionStatus !== "active" &&
      business.subscriptionStatus !== "trialing"
    ) {
      return null;
    }
  }
  return business;
}

type PublicBookingServiceRecord = {
  id: string;
  name: string;
  price: string | null;
  durationMinutes: number | null;
  categoryId: string | null;
  categoryLabel: string | null;
  sortOrder: number | null;
  isAddon: boolean | null;
  taxable: boolean | null;
  active: boolean | null;
  bookingEnabled: boolean | null;
  bookingFlowType: string | null;
  bookingDescription: string | null;
  bookingDepositAmount: string | null;
  bookingLeadTimeHours: number | null;
  bookingWindowDays: number | null;
  bookingServiceMode: string | null;
  bookingAvailableDays: string | null;
  bookingAvailableStartTime: string | null;
  bookingAvailableEndTime: string | null;
  bookingBufferMinutes: number | null;
  bookingCapacityPerSlot: number | null;
  bookingFeatured: boolean | null;
  bookingHidePrice: boolean | null;
  bookingHideDuration: boolean | null;
};

type PublicBookingConfigPayload = {
  businessId: string;
  businessName: string;
  businessType: string | null;
  timezone: string;
  title: string;
  subtitle: string;
  confirmationMessage: string | null;
  defaultFlow: "request" | "self_book";
  branding: {
    logoUrl: string | null;
    primaryColorToken: "orange" | "sky" | "emerald" | "rose" | "slate";
    accentColorToken: "amber" | "blue" | "mint" | "violet" | "stone";
    backgroundToneToken: "ivory" | "mist" | "sand" | "slate";
    buttonStyleToken: "solid" | "soft" | "outline";
  };
  trustPoints: [string, string, string];
  notesPrompt: string;
  requireEmail: boolean;
  requirePhone: boolean;
  requireVehicle: boolean;
  allowCustomerNotes: boolean;
  showPrices: boolean;
  showDurations: boolean;
  locations: Array<{ id: string; name: string; address: string | null }>;
  services: Array<{
    id: string;
    name: string;
    categoryId: string | null;
    categoryLabel: string | null;
    description: string | null;
    price: number;
    durationMinutes: number;
    effectiveFlow: "request" | "self_book";
    depositAmount: number;
    leadTimeHours: number;
    bookingWindowDays: number;
    bufferMinutes: number;
    serviceMode: "in_shop" | "mobile" | "both";
    featured: boolean;
    showPrice: boolean;
    showDuration: boolean;
    addons: Array<{
      id: string;
      name: string;
      price: number;
      durationMinutes: number;
      depositAmount: number;
      bufferMinutes: number;
      description: string | null;
      featured: boolean;
      showPrice: boolean;
      showDuration: boolean;
    }>;
  }>;
};

export function buildPublicBookingConfigResponse(params: {
  business: Pick<
    BusinessRecord,
    | "id"
    | "name"
    | "type"
    | "timezone"
    | "bookingDefaultFlow"
    | "bookingPageTitle"
    | "bookingPageSubtitle"
    | "bookingConfirmationMessage"
    | "bookingTrustBulletPrimary"
    | "bookingTrustBulletSecondary"
    | "bookingTrustBulletTertiary"
    | "bookingNotesPrompt"
    | "bookingBrandLogoUrl"
    | "bookingBrandPrimaryColorToken"
    | "bookingBrandAccentColorToken"
    | "bookingBrandBackgroundToneToken"
    | "bookingBrandButtonStyleToken"
    | "bookingRequireEmail"
    | "bookingRequirePhone"
    | "bookingRequireVehicle"
    | "bookingAllowCustomerNotes"
    | "bookingShowPrices"
    | "bookingShowDurations"
  >;
  services: PublicBookingConfigPayload["services"];
  locations: PublicBookingConfigPayload["locations"];
}): PublicBookingConfigPayload {
  const { business, services, locations } = params;
  return {
    businessId: business.id,
    businessName: business.name,
    businessType: business.type,
    timezone: business.timezone ?? "America/Los_Angeles",
    title: buildBookingPageTitle(business),
    subtitle: buildBookingPageSubtitle(business),
    confirmationMessage: cleanOptionalText(business.bookingConfirmationMessage ?? undefined),
    defaultFlow: normalizeBookingDefaultFlowValue(business.bookingDefaultFlow),
    branding: {
      logoUrl: normalizeBookingBrandLogoUrl(business.bookingBrandLogoUrl),
      primaryColorToken: normalizeBookingBrandPrimaryColorToken(business.bookingBrandPrimaryColorToken),
      accentColorToken: normalizeBookingBrandAccentColorToken(business.bookingBrandAccentColorToken),
      backgroundToneToken: normalizeBookingBrandBackgroundToneToken(business.bookingBrandBackgroundToneToken),
      buttonStyleToken: normalizeBookingBrandButtonStyleToken(business.bookingBrandButtonStyleToken),
    },
    trustPoints: [
      normalizeBookingTrustBullet(business.bookingTrustBulletPrimary, "Goes directly to the shop"),
      normalizeBookingTrustBullet(
        business.bookingTrustBulletSecondary,
        business.bookingDefaultFlow === "self_book" ? "Quick confirmation" : "Quick follow-up"
      ),
      normalizeBookingTrustBullet(business.bookingTrustBulletTertiary, "Secure and simple"),
    ],
    notesPrompt: normalizeBookingNotesPrompt(business.bookingNotesPrompt),
    requireEmail: business.bookingRequireEmail ?? false,
    requirePhone: business.bookingRequirePhone ?? false,
    requireVehicle: business.bookingRequireVehicle ?? true,
    allowCustomerNotes: business.bookingAllowCustomerNotes ?? true,
    showPrices: business.bookingShowPrices ?? true,
    showDurations: business.bookingShowDurations ?? true,
    locations,
    services,
  };
}

let publicBookingServiceColumnsPromise: Promise<Set<string>> | null = null;

async function getPublicBookingServiceColumns(): Promise<Set<string>> {
  if (!publicBookingServiceColumnsPromise) {
    publicBookingServiceColumnsPromise = db
      .execute(sql`
        select column_name
        from information_schema.columns
        where table_schema = 'public' and table_name = 'services'
      `)
      .then((result) => {
        const rows = (result as { rows?: Array<{ column_name?: string }> }).rows ?? [];
        return new Set(rows.map((row) => row.column_name).filter((value): value is string => Boolean(value)));
      })
      .catch((error) => {
        publicBookingServiceColumnsPromise = null;
        throw error;
      });
  }
  return publicBookingServiceColumnsPromise;
}

async function listPublicBookingServices(businessId: string): Promise<{
  services: PublicBookingServiceRecord[];
  addonLinks: Array<{ id: string; parentServiceId: string; addonServiceId: string; sortOrder: number | null }>;
}> {
  const columns = await getPublicBookingServiceColumns();
  const rows = await db
    .select({
      id: services.id,
      name: services.name,
      price: services.price,
      durationMinutes: services.durationMinutes,
      categoryId: services.categoryId,
      categoryLabel: sql<string | null>`coalesce(${serviceCategories.name}, null)`,
      sortOrder: services.sortOrder,
      isAddon: services.isAddon,
      taxable: services.taxable,
      active: services.active,
      bookingEnabled: services.bookingEnabled,
      bookingFlowType: services.bookingFlowType,
      bookingDescription: services.bookingDescription,
      bookingDepositAmount: services.bookingDepositAmount,
      bookingLeadTimeHours: services.bookingLeadTimeHours,
      bookingWindowDays: services.bookingWindowDays,
      bookingServiceMode: columns.has("booking_service_mode") ? services.bookingServiceMode : sql<string | null>`'in_shop'`,
      bookingAvailableDays: columns.has("booking_available_days") ? services.bookingAvailableDays : sql<string | null>`null`,
      bookingAvailableStartTime: columns.has("booking_available_start_time") ? services.bookingAvailableStartTime : sql<string | null>`null`,
      bookingAvailableEndTime: columns.has("booking_available_end_time") ? services.bookingAvailableEndTime : sql<string | null>`null`,
      bookingBufferMinutes: columns.has("booking_buffer_minutes") ? services.bookingBufferMinutes : sql<number | null>`null`,
      bookingCapacityPerSlot: columns.has("booking_capacity_per_slot") ? services.bookingCapacityPerSlot : sql<number | null>`null`,
      bookingFeatured: columns.has("booking_featured") ? services.bookingFeatured : sql<boolean | null>`false`,
      bookingHidePrice: columns.has("booking_hide_price") ? services.bookingHidePrice : sql<boolean | null>`false`,
      bookingHideDuration: columns.has("booking_hide_duration") ? services.bookingHideDuration : sql<boolean | null>`false`,
    })
    .from(services)
    .leftJoin(serviceCategories, eq(services.categoryId, serviceCategories.id))
      .where(and(eq(services.businessId, businessId), eq(services.active, true)))
      .orderBy(
        columns.has("booking_featured") ? desc(services.bookingFeatured) : sql`1`,
        asc(serviceCategories.sortOrder),
        asc(services.sortOrder),
        asc(services.name)
      );

  const addonLinkRows = await db
    .select({
      id: serviceAddonLinks.id,
      parentServiceId: serviceAddonLinks.parentServiceId,
      addonServiceId: serviceAddonLinks.addonServiceId,
      sortOrder: serviceAddonLinks.sortOrder,
    })
    .from(serviceAddonLinks)
    .where(eq(serviceAddonLinks.businessId, businessId))
    .orderBy(asc(serviceAddonLinks.sortOrder), asc(serviceAddonLinks.createdAt));

  return {
    services: rows,
    addonLinks: addonLinkRows,
  };
}

function formatBookingDateTime(value: Date, timeZone: string | null | undefined): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone ?? "America/Los_Angeles",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function bookingServicePrice(service: Pick<PublicBookingServiceRecord, "price">): number {
  const numeric = Number(service.price ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function bookingServiceDeposit(service: Pick<PublicBookingServiceRecord, "bookingDepositAmount">): number {
  const numeric = Number(service.bookingDepositAmount ?? 0);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function parseStoredServiceBookingDays(raw: string | null | undefined): Set<number> | null {
  return normalizeBookingDayIndexes(parseStoredNumberArray(raw));
}

function formatBookingTime(value: Date, timeZone: string | null | undefined): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone ?? "America/Los_Angeles",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function buildVehicleSummary(params: {
  year?: number | null;
  make?: string | null;
  model?: string | null;
}): string | null {
  return (
    buildVehicleDisplayName({
      year: params.year ?? null,
      make: params.make ?? null,
      model: params.model ?? null,
    }) || null
  );
}

function resolveBookingServicesSelection(params: {
  businessDefaultFlow: string | null | undefined;
  baseServiceId: string;
  addonServiceIds: string[];
  services: PublicBookingServiceRecord[];
  addonLinks: Array<{ parentServiceId: string; addonServiceId: string }>;
}) {
  const serviceById = new Map(params.services.map((service) => [service.id, service]));
  const baseService = serviceById.get(params.baseServiceId);
  if (!baseService || baseService.active === false || baseService.isAddon === true || baseService.bookingEnabled !== true) {
    throw new BadRequestError("This service is not available for booking.");
  }

  const linkedAddonIds = new Set(
    params.addonLinks.filter((link) => link.parentServiceId === baseService.id).map((link) => link.addonServiceId)
  );
  const addonServices = params.addonServiceIds.map((serviceId) => {
    const addon = serviceById.get(serviceId);
    if (!addon || addon.active === false || !linkedAddonIds.has(serviceId)) {
      throw new BadRequestError("One of the selected add-ons is no longer available.");
    }
    return addon;
  });

  const allServices = [baseService, ...addonServices];
  const effectiveFlow = resolveBookingFlow({
    businessDefaultFlow: params.businessDefaultFlow,
    serviceFlowType: baseService.bookingFlowType,
  });
  const subtotal = allServices.reduce((sum, service) => sum + bookingServicePrice(service), 0);
  const depositAmount = allServices.reduce((sum, service) => sum + bookingServiceDeposit(service), 0);
  const durationMinutes = allServices.reduce(
    (sum, service) => sum + toBookingDurationMinutes(service.durationMinutes),
    0
  );
  const leadTimeHours = Math.max(
    toBookingLeadTimeHours(baseService.bookingLeadTimeHours),
    ...addonServices.map((service) => toBookingLeadTimeHours(service.bookingLeadTimeHours))
  );
  const bookingWindowDays = Math.min(
    toBookingWindowDays(baseService.bookingWindowDays),
    ...addonServices.map((service) => toBookingWindowDays(service.bookingWindowDays))
  );
  const applyTax = allServices.some((service) => service.taxable === true);
  const explicitBufferOverrides = allServices
    .map((service) => service.bookingBufferMinutes)
    .filter((value): value is number => Number.isFinite(value));

  return {
    baseService,
    addonServices,
    allServices,
    effectiveFlow,
    subtotal,
    depositAmount,
    durationMinutes,
    leadTimeHours,
    bookingWindowDays,
    bufferMinutes:
      explicitBufferOverrides.length > 0
        ? Math.max(...explicitBufferOverrides.map((value) => toBookingBufferMinutes(value)))
        : null,
    serviceMode: normalizeBookingServiceMode(baseService.bookingServiceMode),
    availableDayIndexes: parseStoredServiceBookingDays(baseService.bookingAvailableDays),
    openTime:
      parseTimeToMinutes(baseService.bookingAvailableStartTime ?? "") != null
        ? baseService.bookingAvailableStartTime ?? null
        : null,
    closeTime:
      parseTimeToMinutes(baseService.bookingAvailableEndTime ?? "") != null
        ? baseService.bookingAvailableEndTime ?? null
        : null,
    slotCapacity:
      baseService.bookingCapacityPerSlot != null
        ? Math.max(1, Math.min(Number(baseService.bookingCapacityPerSlot ?? 1), 12))
        : null,
    applyTax,
    title: baseService.name,
    serviceSummary: allServices.map((service) => service.name).join(", "),
  };
}

function isSlotAvailable(params: {
  slotStart: Date;
  durationMinutes: number;
  bufferMinutes: number;
  appointmentCapacity: number;
  blockCapacity: number;
  existingRows: Array<{ startTime: Date; endTime: Date | null; internalNotes: string | null }>;
}) {
  const appointmentEnd = new Date(params.slotStart.getTime() + params.durationMinutes * 60 * 1000);
  const blockingEnd = new Date(appointmentEnd.getTime() + params.bufferMinutes * 60 * 1000);

  let overlappingAppointments = 0;
  let overlappingBlocks = 0;
  for (const row of params.existingRows) {
    const rowEnd =
      row.endTime && row.endTime.getTime() > row.startTime.getTime()
        ? row.endTime
        : new Date(row.startTime.getTime() + 60 * 60 * 1000);
    const overlaps = row.startTime.getTime() < blockingEnd.getTime() && rowEnd.getTime() > params.slotStart.getTime();
    if (!overlaps) continue;
    if (String(row.internalNotes ?? "").trim().startsWith("[[calendar-block")) {
      overlappingBlocks += 1;
    } else {
      overlappingAppointments += 1;
    }
  }

  return overlappingAppointments < params.appointmentCapacity && overlappingBlocks < params.blockCapacity;
}

async function findOrCreatePublicClient(params: {
  businessId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  marketingOptIn: boolean;
  notes?: string | null;
  internalNotes?: string | null;
}) {
  const existing =
    params.email || params.phone
      ? await db
          .select()
          .from(clients)
          .where(
            and(
              eq(clients.businessId, params.businessId),
              isNull(clients.deletedAt),
              or(
                params.email ? eq(clients.email, params.email) : sql`false`,
                params.phone ? eq(clients.phone, params.phone) : sql`false`
              )
            )
          )
          .orderBy(desc(clients.updatedAt))
          .limit(1)
      : [];

  if (existing[0]) {
    const client = existing[0];
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (!client.email && params.email) updates.email = params.email;
    if (!client.phone && params.phone) updates.phone = params.phone;
    if (!client.address && params.address) updates.address = params.address;
    if (!client.city && params.city) updates.city = params.city;
    if (!client.state && params.state) updates.state = params.state;
    if (!client.zip && params.zip) updates.zip = params.zip;
    if (!client.notes && params.notes) updates.notes = params.notes;
    if (!client.internalNotes && params.internalNotes) updates.internalNotes = params.internalNotes;
    if (params.marketingOptIn && client.marketingOptIn !== true) updates.marketingOptIn = true;
    if (Object.keys(updates).length > 1) {
      const [updated] = await db
        .update(clients)
        .set(updates)
        .where(and(eq(clients.id, client.id), eq(clients.businessId, params.businessId)))
        .returning();
      return updated ?? client;
    }
    return client;
  }

  const [created] = await db
    .insert(clients)
    .values({
      id: randomUUID(),
      businessId: params.businessId,
      firstName: params.firstName,
      lastName: params.lastName,
      email: params.email,
      phone: params.phone,
      address: params.address ?? null,
      city: params.city ?? null,
      state: params.state ?? null,
      zip: params.zip ?? null,
      notes: params.notes ?? null,
      internalNotes: params.internalNotes ?? null,
      marketingOptIn: params.marketingOptIn,
    })
    .returning();

  if (!created) throw new BadRequestError("Could not save this customer.");
  return created;
}

async function findOrCreatePublicVehicle(params: {
  businessId: string;
  clientId: string;
  year: number | null;
  make: string | null;
  model: string | null;
  color: string | null;
}) {
  if (!params.make || !params.model) return null;

  const existing = await db
    .select()
    .from(vehicles)
    .where(
      and(
        eq(vehicles.businessId, params.businessId),
        eq(vehicles.clientId, params.clientId),
        eq(vehicles.make, params.make),
        eq(vehicles.model, params.model),
        params.year != null ? eq(vehicles.year, params.year) : sql`true`,
        isNull(vehicles.deletedAt)
      )
    )
    .orderBy(desc(vehicles.updatedAt))
    .limit(1);

  if (existing[0]) return existing[0];

  const [created] = await db
    .insert(vehicles)
    .values({
      id: randomUUID(),
      businessId: params.businessId,
      clientId: params.clientId,
      year: params.year ?? null,
      make: params.make,
      model: params.model,
      color: params.color ?? null,
    })
    .returning();

  return created ?? null;
}

async function listPublicBookingLocations(businessId: string) {
  return db
    .select({
      id: locations.id,
      name: locations.name,
      address: locations.address,
      active: locations.active,
    })
    .from(locations)
    .where(and(eq(locations.businessId, businessId), eq(locations.active, true)))
    .orderBy(asc(locations.name));
}

function bookingSuccessMessage(params: {
  businessMessage: string | null | undefined;
  mode: BookingDefaultFlow;
}): string {
  const custom = params.businessMessage?.trim();
  if (custom) return custom;
  return params.mode === "self_book"
    ? "Your appointment is booked. You can review the confirmation details right away."
    : "Your request is with the shop. They can follow up with the next step soon.";
}

function coerceBusinessRecord(
  record: Pick<BusinessRecord, "id" | "ownerId" | "name" | "type"> &
    Partial<BusinessRecord>
): BusinessRecord {
  return {
    id: record.id,
    ownerId: record.ownerId,
    name: record.name,
    type: record.type,
    email: record.email ?? null,
    phone: record.phone ?? null,
    address: record.address ?? null,
    city: record.city ?? null,
    state: record.state ?? null,
    zip: record.zip ?? null,
    timezone: record.timezone ?? "America/Los_Angeles",
    currency: record.currency ?? "USD",
    defaultTaxRate: record.defaultTaxRate ?? "0",
    defaultAdminFee: record.defaultAdminFee ?? "0",
    defaultAdminFeeEnabled: record.defaultAdminFeeEnabled ?? false,
    defaultAppointmentStartTime: record.defaultAppointmentStartTime ?? "09:00",
    appointmentBufferMinutes: record.appointmentBufferMinutes ?? 15,
    calendarBlockCapacityPerSlot: record.calendarBlockCapacityPerSlot ?? 1,
    leadCaptureEnabled: record.leadCaptureEnabled ?? false,
    leadAutoResponseEnabled: record.leadAutoResponseEnabled ?? true,
    leadAutoResponseEmailEnabled: record.leadAutoResponseEmailEnabled ?? true,
    leadAutoResponseSmsEnabled: record.leadAutoResponseSmsEnabled ?? false,
    notificationAppointmentConfirmationEmailEnabled:
      record.notificationAppointmentConfirmationEmailEnabled ?? true,
    notificationAppointmentReminderEmailEnabled: record.notificationAppointmentReminderEmailEnabled ?? true,
    notificationAbandonedQuoteEmailEnabled: record.notificationAbandonedQuoteEmailEnabled ?? true,
    notificationReviewRequestEmailEnabled: record.notificationReviewRequestEmailEnabled ?? true,
    notificationLapsedClientEmailEnabled: record.notificationLapsedClientEmailEnabled ?? true,
    missedCallTextBackEnabled: record.missedCallTextBackEnabled ?? false,
    automationUncontactedLeadsEnabled: record.automationUncontactedLeadsEnabled ?? false,
    automationUncontactedLeadHours: record.automationUncontactedLeadHours ?? 2,
    automationAppointmentRemindersEnabled: record.automationAppointmentRemindersEnabled ?? true,
    automationAppointmentReminderHours: record.automationAppointmentReminderHours ?? 24,
    automationSendWindowStartHour: record.automationSendWindowStartHour ?? 8,
    automationSendWindowEndHour: record.automationSendWindowEndHour ?? 18,
    automationReviewRequestsEnabled: record.automationReviewRequestsEnabled ?? false,
    automationReviewRequestDelayHours: record.automationReviewRequestDelayHours ?? 24,
    reviewRequestUrl: record.reviewRequestUrl ?? null,
    automationAbandonedQuotesEnabled: record.automationAbandonedQuotesEnabled ?? false,
    automationAbandonedQuoteHours: record.automationAbandonedQuoteHours ?? 48,
    automationLapsedClientsEnabled: record.automationLapsedClientsEnabled ?? false,
    automationLapsedClientMonths: record.automationLapsedClientMonths ?? 6,
    bookingRequestUrl: record.bookingRequestUrl ?? null,
    bookingEnabled: record.bookingEnabled ?? false,
    bookingDefaultFlow: record.bookingDefaultFlow ?? "request",
    bookingPageTitle: record.bookingPageTitle ?? null,
    bookingPageSubtitle: record.bookingPageSubtitle ?? null,
    bookingConfirmationMessage: record.bookingConfirmationMessage ?? null,
    bookingTrustBulletPrimary: record.bookingTrustBulletPrimary ?? null,
    bookingTrustBulletSecondary: record.bookingTrustBulletSecondary ?? null,
    bookingTrustBulletTertiary: record.bookingTrustBulletTertiary ?? null,
    bookingNotesPrompt: record.bookingNotesPrompt ?? null,
    bookingBrandLogoUrl: record.bookingBrandLogoUrl ?? null,
    bookingBrandPrimaryColorToken: record.bookingBrandPrimaryColorToken ?? "orange",
    bookingBrandAccentColorToken: record.bookingBrandAccentColorToken ?? "amber",
    bookingBrandBackgroundToneToken: record.bookingBrandBackgroundToneToken ?? "ivory",
    bookingBrandButtonStyleToken: record.bookingBrandButtonStyleToken ?? "solid",
    bookingRequireEmail: record.bookingRequireEmail ?? false,
    bookingRequirePhone: record.bookingRequirePhone ?? false,
    bookingRequireVehicle: record.bookingRequireVehicle ?? true,
    bookingAllowCustomerNotes: record.bookingAllowCustomerNotes ?? true,
    bookingShowPrices: record.bookingShowPrices ?? true,
    bookingShowDurations: record.bookingShowDurations ?? true,
    bookingAvailableDays: record.bookingAvailableDays ?? null,
    bookingAvailableStartTime: record.bookingAvailableStartTime ?? null,
    bookingAvailableEndTime: record.bookingAvailableEndTime ?? null,
    bookingBlackoutDates: record.bookingBlackoutDates ?? null,
    bookingSlotIntervalMinutes: record.bookingSlotIntervalMinutes ?? 15,
    bookingBufferMinutes: record.bookingBufferMinutes ?? null,
    bookingCapacityPerSlot: record.bookingCapacityPerSlot ?? null,
    monthlyRevenueGoal: record.monthlyRevenueGoal ?? null,
    monthlyJobsGoal: record.monthlyJobsGoal ?? null,
    integrationWebhookEnabled: record.integrationWebhookEnabled ?? false,
    integrationWebhookUrl: record.integrationWebhookUrl ?? null,
    integrationWebhookSecret: record.integrationWebhookSecret ?? null,
    integrationWebhookEvents: record.integrationWebhookEvents ?? "[]",
    nextInvoiceNumber: record.nextInvoiceNumber ?? 1,
    onboardingComplete: record.onboardingComplete ?? null,
    staffCount: record.staffCount ?? null,
    operatingHours: record.operatingHours ?? null,
    stripeCustomerId: record.stripeCustomerId ?? null,
    stripeSubscriptionId: record.stripeSubscriptionId ?? null,
    subscriptionStatus: record.subscriptionStatus ?? null,
    billingAccessState: record.billingAccessState ?? null,
    trialStartedAt: record.trialStartedAt ?? null,
    trialEndsAt: record.trialEndsAt ?? null,
    currentPeriodEnd: record.currentPeriodEnd ?? null,
    billingHasPaymentMethod: record.billingHasPaymentMethod ?? false,
    billingPaymentMethodAddedAt: record.billingPaymentMethodAddedAt ?? null,
    billingSetupError: record.billingSetupError ?? null,
    billingSetupFailedAt: record.billingSetupFailedAt ?? null,
    billingLastStripeEventId: record.billingLastStripeEventId ?? null,
    billingLastStripeEventType: record.billingLastStripeEventType ?? null,
    billingLastStripeEventAt: record.billingLastStripeEventAt ?? null,
    billingLastStripeSyncStatus: record.billingLastStripeSyncStatus ?? null,
    billingLastStripeSyncError: record.billingLastStripeSyncError ?? null,
    stripeConnectAccountId: record.stripeConnectAccountId ?? null,
    stripeConnectDetailsSubmitted: record.stripeConnectDetailsSubmitted ?? false,
    stripeConnectChargesEnabled: record.stripeConnectChargesEnabled ?? false,
    stripeConnectPayoutsEnabled: record.stripeConnectPayoutsEnabled ?? false,
    stripeConnectOnboardedAt: record.stripeConnectOnboardedAt ?? null,
    createdAt: record.createdAt ?? new Date(),
    updatedAt: record.updatedAt ?? new Date(),
  };
}

export function serializeBusiness(record: BusinessRecord) {
  const { integrationWebhookSecret: _integrationWebhookSecret, ...rest } = record;
  let integrationWebhookEvents: string[] = [];
  try {
    integrationWebhookEvents = JSON.parse(record.integrationWebhookEvents ?? "[]") as string[];
  } catch {
    integrationWebhookEvents = [];
  }
  return {
    ...rest,
    integrationWebhookEvents,
    reviewRequestUrl: record.reviewRequestUrl ?? null,
    bookingRequestUrl: record.bookingRequestUrl ?? null,
    bookingEnabled: record.bookingEnabled ?? false,
    bookingDefaultFlow: record.bookingDefaultFlow ?? "request",
    bookingPageTitle: record.bookingPageTitle ?? null,
    bookingPageSubtitle: record.bookingPageSubtitle ?? null,
    bookingConfirmationMessage: record.bookingConfirmationMessage ?? null,
    bookingTrustBulletPrimary: record.bookingTrustBulletPrimary ?? null,
    bookingTrustBulletSecondary: record.bookingTrustBulletSecondary ?? null,
    bookingTrustBulletTertiary: record.bookingTrustBulletTertiary ?? null,
    bookingNotesPrompt: record.bookingNotesPrompt ?? null,
    bookingBrandLogoUrl: record.bookingBrandLogoUrl ?? null,
    bookingBrandPrimaryColorToken: record.bookingBrandPrimaryColorToken ?? "orange",
    bookingBrandAccentColorToken: record.bookingBrandAccentColorToken ?? "amber",
    bookingBrandBackgroundToneToken: record.bookingBrandBackgroundToneToken ?? "ivory",
    bookingBrandButtonStyleToken: record.bookingBrandButtonStyleToken ?? "solid",
    bookingRequireEmail: record.bookingRequireEmail ?? false,
    bookingRequirePhone: record.bookingRequirePhone ?? false,
    bookingRequireVehicle: record.bookingRequireVehicle ?? true,
    bookingAllowCustomerNotes: record.bookingAllowCustomerNotes ?? true,
    bookingShowPrices: record.bookingShowPrices ?? true,
    bookingShowDurations: record.bookingShowDurations ?? true,
    bookingAvailableDays: parseStoredNumberArray(record.bookingAvailableDays),
    bookingAvailableStartTime: record.bookingAvailableStartTime ?? null,
    bookingAvailableEndTime: record.bookingAvailableEndTime ?? null,
    bookingBlackoutDates: parseStoredStringArray(record.bookingBlackoutDates),
    bookingSlotIntervalMinutes: record.bookingSlotIntervalMinutes ?? 15,
    bookingBufferMinutes: record.bookingBufferMinutes ?? null,
    bookingCapacityPerSlot: record.bookingCapacityPerSlot ?? null,
    billingAccessState: record.billingAccessState ?? null,
    trialStartedAt: record.trialStartedAt ?? null,
    billingSetupError: record.billingSetupError ?? null,
    billingSetupFailedAt: record.billingSetupFailedAt ?? null,
    website: null,
    bio: null,
    instagram: null,
    facebook: null,
    googleReviewLink: null,
    yelpReviewLink: null,
    facebookReviewLink: null,
    logoUrl: null,
  };
}

function canAccessBusiness(
  req: Request,
  business: Pick<typeof businesses.$inferSelect, "id" | "ownerId">,
  permission?: "settings.read" | "settings.write"
): boolean {
  if (req.userId && business.ownerId === req.userId) return true;
  if (!req.businessId || req.businessId !== business.id || !req.membershipRole) return false;
  return permission ? roleHasPermission(req.membershipRole, permission) : true;
}

function isBusinessSchemaDriftError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown; cause?: unknown };
  const cause =
    candidate.cause && typeof candidate.cause === "object"
      ? (candidate.cause as { code?: unknown; message?: unknown })
      : candidate;
  const code = String(cause.code ?? "");
  const message = String(cause.message ?? "").toLowerCase();
  return code === "42P01" || code === "42703" || message.includes("does not exist");
}

let ensureBusinessAutomationColumnsPromise: Promise<void> | null = null;

async function ensureBusinessAutomationColumns(): Promise<void> {
  if (!ensureBusinessAutomationColumnsPromise) {
    ensureBusinessAutomationColumnsPromise = (async () => {
      await db.execute(sql`
        ALTER TABLE businesses
          ADD COLUMN IF NOT EXISTS lead_capture_enabled boolean DEFAULT false,
          ADD COLUMN IF NOT EXISTS lead_auto_response_enabled boolean DEFAULT true,
          ADD COLUMN IF NOT EXISTS lead_auto_response_email_enabled boolean DEFAULT true,
          ADD COLUMN IF NOT EXISTS lead_auto_response_sms_enabled boolean DEFAULT false,
          ADD COLUMN IF NOT EXISTS default_appointment_start_time text DEFAULT '09:00',
          ADD COLUMN IF NOT EXISTS missed_call_text_back_enabled boolean DEFAULT false,
          ADD COLUMN IF NOT EXISTS automation_uncontacted_leads_enabled boolean DEFAULT false,
          ADD COLUMN IF NOT EXISTS automation_uncontacted_lead_hours integer DEFAULT 2,
          ADD COLUMN IF NOT EXISTS automation_abandoned_quotes_enabled boolean DEFAULT false,
          ADD COLUMN IF NOT EXISTS automation_abandoned_quote_hours integer DEFAULT 48,
          ADD COLUMN IF NOT EXISTS notification_appointment_confirmation_email_enabled boolean DEFAULT true,
          ADD COLUMN IF NOT EXISTS notification_appointment_reminder_email_enabled boolean DEFAULT true,
          ADD COLUMN IF NOT EXISTS notification_abandoned_quote_email_enabled boolean DEFAULT true,
          ADD COLUMN IF NOT EXISTS notification_review_request_email_enabled boolean DEFAULT true,
          ADD COLUMN IF NOT EXISTS notification_lapsed_client_email_enabled boolean DEFAULT true,
          ADD COLUMN IF NOT EXISTS booking_enabled boolean DEFAULT false,
          ADD COLUMN IF NOT EXISTS booking_default_flow text DEFAULT 'request',
          ADD COLUMN IF NOT EXISTS booking_page_title text,
          ADD COLUMN IF NOT EXISTS booking_page_subtitle text,
          ADD COLUMN IF NOT EXISTS booking_confirmation_message text,
          ADD COLUMN IF NOT EXISTS booking_trust_bullet_primary text,
          ADD COLUMN IF NOT EXISTS booking_trust_bullet_secondary text,
          ADD COLUMN IF NOT EXISTS booking_trust_bullet_tertiary text,
          ADD COLUMN IF NOT EXISTS booking_notes_prompt text,
          ADD COLUMN IF NOT EXISTS booking_brand_logo_url text,
          ADD COLUMN IF NOT EXISTS booking_brand_primary_color_token text DEFAULT 'orange',
          ADD COLUMN IF NOT EXISTS booking_brand_accent_color_token text DEFAULT 'amber',
          ADD COLUMN IF NOT EXISTS booking_brand_background_tone_token text DEFAULT 'ivory',
          ADD COLUMN IF NOT EXISTS booking_brand_button_style_token text DEFAULT 'solid',
          ADD COLUMN IF NOT EXISTS booking_require_email boolean DEFAULT false,
          ADD COLUMN IF NOT EXISTS booking_require_phone boolean DEFAULT false,
          ADD COLUMN IF NOT EXISTS booking_require_vehicle boolean DEFAULT true,
          ADD COLUMN IF NOT EXISTS booking_allow_customer_notes boolean DEFAULT true,
          ADD COLUMN IF NOT EXISTS booking_show_prices boolean DEFAULT true,
          ADD COLUMN IF NOT EXISTS booking_show_durations boolean DEFAULT true,
          ADD COLUMN IF NOT EXISTS booking_available_days text,
          ADD COLUMN IF NOT EXISTS booking_available_start_time text,
          ADD COLUMN IF NOT EXISTS booking_available_end_time text,
          ADD COLUMN IF NOT EXISTS booking_blackout_dates text,
          ADD COLUMN IF NOT EXISTS booking_slot_interval_minutes integer DEFAULT 15,
          ADD COLUMN IF NOT EXISTS booking_buffer_minutes integer,
          ADD COLUMN IF NOT EXISTS booking_capacity_per_slot integer,
          ADD COLUMN IF NOT EXISTS monthly_revenue_goal decimal(12, 2) DEFAULT NULL,
          ADD COLUMN IF NOT EXISTS monthly_jobs_goal integer DEFAULT NULL,
          ADD COLUMN IF NOT EXISTS billing_access_state text,
          ADD COLUMN IF NOT EXISTS trial_started_at timestamptz,
          ADD COLUMN IF NOT EXISTS billing_setup_error text,
          ADD COLUMN IF NOT EXISTS billing_setup_failed_at timestamptz
      `);
    })().catch((error) => {
      ensureBusinessAutomationColumnsPromise = null;
      throw error;
    });
  }
  await ensureBusinessAutomationColumnsPromise;
}

async function loadBusinessById(id: string): Promise<BusinessRecord | null> {
  const backfillBusinessWebhookSecretIfNeeded = async (business: BusinessRecord | null): Promise<BusinessRecord | null> => {
    if (!business || !isIntegrationVaultConfigured() || !isLegacyPlaintextWebhookSecret(business.integrationWebhookSecret)) {
      return business;
    }
    try {
      const encryptedSecret = normalizeBusinessWebhookSecretForStorage(business.integrationWebhookSecret);
      const [updated] = await db
        .update(businesses)
        .set({
          integrationWebhookSecret: encryptedSecret,
          updatedAt: new Date(),
        })
        .where(eq(businesses.id, business.id))
        .returning();
      return updated ?? { ...business, integrationWebhookSecret: encryptedSecret, updatedAt: new Date() };
    } catch (error) {
      warnOnce("businesses:webhook-secret-backfill", "business webhook secret backfill skipped", {
        businessId: business.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return business;
    }
  };

  try {
    const [business] = await db.select().from(businesses).where(eq(businesses.id, id)).limit(1);
    return backfillBusinessWebhookSecretIfNeeded(business ?? null);
  } catch (error) {
    if (!isBusinessSchemaDriftError(error)) throw error;
    try {
      await ensureBusinessAutomationColumns();
      const [business] = await db.select().from(businesses).where(eq(businesses.id, id)).limit(1);
      return backfillBusinessWebhookSecretIfNeeded(business ?? null);
    } catch (repairError) {
      if (!isBusinessSchemaDriftError(repairError)) throw repairError;
    }
    warnOnce("businesses:get:schema", "business read falling back without full schema", {
      businessId: id,
      error: error instanceof Error ? error.message : String(error),
    });
    const [legacyBusiness] = await db
      .select({
        id: businesses.id,
        ownerId: businesses.ownerId,
        name: businesses.name,
        type: businesses.type,
        email: businesses.email,
        phone: businesses.phone,
        address: businesses.address,
        city: businesses.city,
        state: businesses.state,
        zip: businesses.zip,
        staffCount: businesses.staffCount,
        operatingHours: businesses.operatingHours,
        createdAt: businesses.createdAt,
      })
      .from(businesses)
      .where(eq(businesses.id, id))
      .limit(1);
    return backfillBusinessWebhookSecretIfNeeded(legacyBusiness ? coerceBusinessRecord(legacyBusiness) : null);
  }
}

async function loadBusinessByOwner(ownerId: string): Promise<BusinessRecord | null> {
  try {
    const [business] = await db.select().from(businesses).where(eq(businesses.ownerId, ownerId)).limit(1);
    return business ?? null;
  } catch (error) {
    if (!isBusinessSchemaDriftError(error)) throw error;
    try {
      await ensureBusinessAutomationColumns();
      const [business] = await db.select().from(businesses).where(eq(businesses.ownerId, ownerId)).limit(1);
      return business ?? null;
    } catch (repairError) {
      if (!isBusinessSchemaDriftError(repairError)) throw repairError;
    }
    warnOnce("businesses:list:schema", "business list falling back without full schema", {
      ownerId,
      error: error instanceof Error ? error.message : String(error),
    });
    const [legacyBusiness] = await db
      .select({
        id: businesses.id,
        ownerId: businesses.ownerId,
        name: businesses.name,
        type: businesses.type,
        email: businesses.email,
        phone: businesses.phone,
        address: businesses.address,
        city: businesses.city,
        state: businesses.state,
        zip: businesses.zip,
        staffCount: businesses.staffCount,
        operatingHours: businesses.operatingHours,
        createdAt: businesses.createdAt,
      })
      .from(businesses)
      .where(eq(businesses.ownerId, ownerId))
      .limit(1);
    return legacyBusiness ? coerceBusinessRecord(legacyBusiness) : null;
  }
}

businessesRouter.get(
  "/:id/public-booking-drafts/:resumeToken",
  publicBookingDraftResumeLimiter.middleware,
  wrapAsync(async (req: Request, res: Response) => {
    const parsed = publicBookingDraftParamsSchema.safeParse(req.params);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? "Invalid draft link.");

    const business = await loadPublicBookingBusiness(parsed.data.id);
    if (!business || business.bookingEnabled !== true) {
      throw new NotFoundError("Online booking is not available for this business.");
    }

    const draft = await findPublicBookingDraftByResumeToken({
      businessId: business.id,
      resumeToken: parsed.data.resumeToken,
    });
    if (!draft || draft.status === "submitted_request" || draft.status === "confirmed_booking") {
      throw new NotFoundError("This booking draft could not be restored.");
    }

    res.json({
      ok: true,
      draft: serializePublicBookingDraft(draft),
    });
  })
);

businessesRouter.post(
  "/:id/public-booking-drafts",
  publicBookingDraftLimiter.middleware,
  wrapAsync(async (req: Request, res: Response) => {
    const parsedParams = publicLeadConfigParamsSchema.safeParse(req.params);
    if (!parsedParams.success) throw new BadRequestError(parsedParams.error.issues[0]?.message ?? "Invalid business.");
    const parsedBody = publicBookingDraftSaveSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) throw new BadRequestError(parsedBody.error.issues[0]?.message ?? "Invalid booking draft.");

    const business = await loadPublicBookingBusiness(parsedParams.data.id);
    if (!business || business.bookingEnabled !== true) {
      throw new NotFoundError("Online booking is not available for this business.");
    }

    const { services: publicServices, addonLinks } = await listPublicBookingServices(business.id);
    const selection = resolveBookingServicesSelection({
      businessDefaultFlow: business.bookingDefaultFlow,
      baseServiceId: parsedBody.data.serviceId,
      addonServiceIds: Array.from(new Set(parsedBody.data.addonServiceIds ?? [])),
      services: publicServices,
      addonLinks,
    });

    const comparable = buildPublicBookingDraftComparable({
      serviceId: selection.baseService.id,
      addonServiceIds: selection.addonServices.map((service) => service.id),
      serviceMode: resolveCustomerBookingMode({
        serviceMode: selection.serviceMode,
        requestedMode: parsedBody.data.serviceMode,
      }),
      locationId: cleanOptionalText(parsedBody.data.locationId),
      bookingDate: cleanOptionalText(parsedBody.data.bookingDate),
      startTime: cleanOptionalText(parsedBody.data.startTime),
      firstName: cleanOptionalText(parsedBody.data.firstName),
      lastName: cleanOptionalText(parsedBody.data.lastName),
      email: cleanOptionalText(parsedBody.data.email),
      phone: cleanOptionalText(parsedBody.data.phone),
      vehicleYear: parsedBody.data.vehicleYear ?? "",
      vehicleMake: cleanOptionalText(parsedBody.data.vehicleMake),
      vehicleModel: cleanOptionalText(parsedBody.data.vehicleModel),
      vehicleColor: cleanOptionalText(parsedBody.data.vehicleColor),
      serviceAddress: cleanOptionalText(parsedBody.data.serviceAddress),
      serviceCity: cleanOptionalText(parsedBody.data.serviceCity),
      serviceState: cleanOptionalText(parsedBody.data.serviceState),
      serviceZip: cleanOptionalText(parsedBody.data.serviceZip),
      notes: cleanOptionalText(parsedBody.data.notes),
      marketingOptIn: parsedBody.data.marketingOptIn ?? true,
      source: cleanOptionalText(parsedBody.data.source),
      campaign: cleanOptionalText(parsedBody.data.campaign),
      currentStep: parsedBody.data.currentStep ?? 0,
      serviceCategoryFilter: cleanOptionalText(parsedBody.data.serviceCategoryFilter),
      expandedServiceId: cleanOptionalText(parsedBody.data.expandedServiceId),
    });

    if (!hasMeaningfulBookingDraftIntent(comparable)) {
      res.status(202).json({
        ok: true,
        accepted: false,
        reason: "not_meaningful_yet",
      });
      return;
    }

    const draftStatus = deriveBookingDraftStatus(comparable);
    if (!draftStatus) {
      res.status(202).json({
        ok: true,
        accepted: false,
        reason: "not_meaningful_yet",
      });
      return;
    }

    const resumeToken = cleanOptionalText(parsedBody.data.resumeToken) ?? randomUUID();

    try {
      const existing = await findPublicBookingDraftByResumeToken({
        businessId: business.id,
        resumeToken,
      });
      const nextSignature = buildBookingDraftComparableSignature(comparable);

      if (existing) {
        const existingSignature = buildBookingDraftComparableSignature({
          serviceId: existing.serviceId,
          addonServiceIds: parseStoredStringArray(existing.addonServiceIds),
          serviceMode: existing.serviceMode,
          locationId: existing.locationId,
          bookingDate: existing.bookingDate,
          startTime: existing.startTime ? existing.startTime.toISOString() : "",
          firstName: existing.firstName,
          lastName: existing.lastName,
          email: existing.email,
          phone: existing.phone,
          vehicleYear: existing.vehicleYear,
          vehicleMake: existing.vehicleMake,
          vehicleModel: existing.vehicleModel,
          vehicleColor: existing.vehicleColor,
          serviceAddress: existing.serviceAddress,
          serviceCity: existing.serviceCity,
          serviceState: existing.serviceState,
          serviceZip: existing.serviceZip,
          notes: existing.notes,
          marketingOptIn: existing.marketingOptIn,
          source: existing.source,
          campaign: existing.campaign,
          currentStep: existing.currentStep,
          serviceCategoryFilter: existing.serviceCategoryFilter,
          expandedServiceId: existing.expandedServiceId,
        });

        if (existingSignature === nextSignature && existing.status === draftStatus) {
          res.json({
            ok: true,
            accepted: true,
            created: false,
            unchanged: true,
            draft: serializePublicBookingDraft(existing),
          });
          return;
        }
      }

      const now = new Date();
      const persistedValues = {
        businessId: business.id,
        serviceId: selection.baseService.id,
        locationId: comparable.locationId || null,
        resumeToken,
        status: draftStatus,
        addonServiceIds: JSON.stringify(comparable.addonServiceIds),
        serviceMode: comparable.serviceMode,
        bookingDate: comparable.bookingDate || null,
        startTime: comparable.startTime ? new Date(comparable.startTime) : null,
        firstName: comparable.firstName || null,
        lastName: comparable.lastName || null,
        email: comparable.email || null,
        phone: comparable.phone || null,
        vehicleYear: comparable.vehicleYear ? Number(comparable.vehicleYear) : null,
        vehicleMake: comparable.vehicleMake || null,
        vehicleModel: comparable.vehicleModel || null,
        vehicleColor: comparable.vehicleColor || null,
        serviceAddress: comparable.serviceAddress || null,
        serviceCity: comparable.serviceCity || null,
        serviceState: comparable.serviceState || null,
        serviceZip: comparable.serviceZip || null,
        notes: comparable.notes || null,
        marketingOptIn: comparable.marketingOptIn !== false,
        source: comparable.source || null,
        campaign: comparable.campaign || null,
        currentStep: comparable.currentStep,
        serviceCategoryFilter: comparable.serviceCategoryFilter || null,
        expandedServiceId: comparable.expandedServiceId || null,
        identifiedAt:
          draftStatus === "identified_lead" || draftStatus === "qualified_booking_intent"
            ? existing?.identifiedAt ?? now
            : existing?.identifiedAt ?? null,
        qualifiedAt:
          draftStatus === "qualified_booking_intent" ? existing?.qualifiedAt ?? now : existing?.qualifiedAt ?? null,
        abandonedAt: null,
        lastClientEventAt: now,
        updatedAt: now,
      };

      let saved: BookingDraftRecord | null = null;
      let created = false;

      if (existing) {
        [saved] = await db
          .update(bookingDrafts)
          .set(persistedValues)
          .where(eq(bookingDrafts.id, existing.id))
          .returning();
      } else {
        created = true;
        [saved] = await db
          .insert(bookingDrafts)
          .values({
            id: randomUUID(),
            ...persistedValues,
            createdAt: now,
          })
          .returning();
      }

      if (!saved) {
        throw new BadRequestError("Could not save this booking draft.");
      }

      await createActivityLog({
        businessId: business.id,
        action: created ? "booking.draft_created" : "booking.draft_updated",
        entityType: "booking_draft",
        entityId: saved.id,
        metadata: {
          draftStatus,
          previousStatus: existing?.status ?? null,
          serviceId: selection.baseService.id,
          addonCount: comparable.addonServiceIds.length,
          currentStep: comparable.currentStep,
          source: comparable.source || null,
          campaign: comparable.campaign || null,
        },
      });

      res.status(created ? 201 : 200).json({
        ok: true,
        accepted: true,
        created,
        unchanged: false,
        draft: serializePublicBookingDraft(saved),
      });
    } catch (error) {
      if (!isBookingDraftSchemaDriftError(error)) throw error;
      res.status(202).json({
        ok: true,
        accepted: false,
        localOnly: true,
      });
    }
  })
);

businessesRouter.post(
  "/:id/public-booking-drafts/:resumeToken/abandon",
  publicBookingDraftAbandonLimiter.middleware,
  wrapAsync(async (req: Request, res: Response) => {
    const parsed = publicBookingDraftParamsSchema.safeParse(req.params);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? "Invalid draft link.");

    const business = await loadPublicBookingBusiness(parsed.data.id);
    if (!business || business.bookingEnabled !== true) {
      throw new NotFoundError("Online booking is not available for this business.");
    }

    try {
      const draft = await findPublicBookingDraftByResumeToken({
        businessId: business.id,
        resumeToken: parsed.data.resumeToken,
      });
      if (!draft || draft.status === "submitted_request" || draft.status === "confirmed_booking") {
        res.json({ ok: true, accepted: false });
        return;
      }

      if (draft.abandonedAt) {
        res.json({ ok: true, accepted: true });
        return;
      }

      const now = new Date();
      await db
        .update(bookingDrafts)
        .set({
          abandonedAt: now,
          lastClientEventAt: now,
          updatedAt: now,
        })
        .where(eq(bookingDrafts.id, draft.id));

      await createActivityLog({
        businessId: business.id,
        action: "booking.draft_abandoned",
        entityType: "booking_draft",
        entityId: draft.id,
        metadata: {
          draftStatus: draft.status,
          currentStep: draft.currentStep ?? 0,
          serviceId: draft.serviceId ?? null,
        },
      });

      res.json({ ok: true, accepted: true });
    } catch (error) {
      if (!isBookingDraftSchemaDriftError(error)) throw error;
      res.status(202).json({
        ok: true,
        accepted: false,
        localOnly: true,
      });
    }
  })
);

businessesRouter.get(
  "/:id/public-booking-config",
  publicBookingConfigLimiter.middleware,
  wrapAsync(async (req: Request, res: Response) => {
    const parsed = publicLeadConfigParamsSchema.safeParse(req.params);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? "Invalid business.");

    const business = await loadPublicBookingBusiness(parsed.data.id);
    if (!business || business.bookingEnabled !== true) {
      throw new NotFoundError("Online booking is not available for this business.");
    }

    const { services: publicServices, addonLinks } = await listPublicBookingServices(business.id);
    const locations = await listPublicBookingLocations(business.id);
    const baseServices = publicServices
      .filter((service) => service.active !== false && service.isAddon !== true && service.bookingEnabled === true)
      .map((service) => ({
        id: service.id,
        name: service.name,
        categoryId: service.categoryId,
        categoryLabel: service.categoryLabel,
        description: cleanOptionalText(service.bookingDescription ?? undefined),
        price: bookingServicePrice(service),
        durationMinutes: toBookingDurationMinutes(service.durationMinutes),
        effectiveFlow: resolveBookingFlow({
          businessDefaultFlow: business.bookingDefaultFlow,
          serviceFlowType: service.bookingFlowType,
        }),
        depositAmount: bookingServiceDeposit(service),
        leadTimeHours: toBookingLeadTimeHours(service.bookingLeadTimeHours),
        bookingWindowDays: toBookingWindowDays(service.bookingWindowDays),
        bufferMinutes: toBookingBufferMinutes(service.bookingBufferMinutes),
        serviceMode: normalizeBookingServiceMode(service.bookingServiceMode),
        featured: service.bookingFeatured === true,
        showPrice: service.bookingHidePrice !== true,
        showDuration: service.bookingHideDuration !== true,
        addons: addonLinks
          .filter((link) => link.parentServiceId === service.id)
          .map((link) => publicServices.find((candidate) => candidate.id === link.addonServiceId))
          .filter((candidate): candidate is PublicBookingServiceRecord => Boolean(candidate))
          .filter((candidate) => candidate.active !== false)
          .map((candidate) => ({
            id: candidate.id,
            name: candidate.name,
            price: bookingServicePrice(candidate),
            durationMinutes: toBookingDurationMinutes(candidate.durationMinutes),
            depositAmount: bookingServiceDeposit(candidate),
            bufferMinutes: toBookingBufferMinutes(candidate.bookingBufferMinutes),
            description: cleanOptionalText(candidate.bookingDescription ?? undefined),
            featured: candidate.bookingFeatured === true,
            showPrice: candidate.bookingHidePrice !== true,
            showDuration: candidate.bookingHideDuration !== true,
          })),
      }));

    if (baseServices.length === 0) {
      throw new NotFoundError("No services are currently available for booking.");
    }

    res.json(
      buildPublicBookingConfigResponse({
        business,
        locations: locations.map((location) => ({
          id: location.id,
          name: location.name,
          address: location.address,
        })),
        services: baseServices,
      })
    );
  })
);

businessesRouter.get(
  "/:id/public-booking-availability",
  publicBookingAvailabilityLimiter.middleware,
  wrapAsync(async (req: Request, res: Response) => {
    const parsedParams = publicLeadConfigParamsSchema.safeParse(req.params);
    if (!parsedParams.success) throw new BadRequestError(parsedParams.error.issues[0]?.message ?? "Invalid business.");
    const parsedQuery = publicBookingAvailabilityQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) throw new BadRequestError(parsedQuery.error.issues[0]?.message ?? "Invalid booking availability request.");

    const business = await loadPublicBookingBusiness(parsedParams.data.id);
    if (!business || business.bookingEnabled !== true) {
      throw new NotFoundError("Online booking is not available for this business.");
    }

    const { services: publicServices, addonLinks } = await listPublicBookingServices(business.id);
    const addonServiceIds = Array.from(
      new Set(
        String(parsedQuery.data.addonServiceIds ?? "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      )
    );
    const selection = resolveBookingServicesSelection({
      businessDefaultFlow: business.bookingDefaultFlow,
      baseServiceId: parsedQuery.data.serviceId,
      addonServiceIds,
      services: publicServices,
      addonLinks,
    });
    const requestedServiceMode = resolveCustomerBookingMode({
      serviceMode: selection.serviceMode,
      requestedMode: parsedQuery.data.serviceMode,
    });

    const date = parsePublicBookingDate(parsedQuery.data.date);
    const today = startOfLocalDay(new Date());
    const lastAllowedDate = addDays(today, selection.bookingWindowDays - 1);
    if (date.getTime() < today.getTime() || date.getTime() > lastAllowedDate.getTime()) {
      throw new BadRequestError("Choose a booking date inside the available window.");
    }
    const bookingSchedule = resolveBookingSchedule(business);
    if (bookingSchedule.blackoutDates.has(toDateKey(date))) {
      res.json({
        effectiveFlow: selection.effectiveFlow,
        serviceMode: requestedServiceMode,
        timezone: business.timezone ?? "America/Los_Angeles",
        date: toDateKey(date),
        slots: [],
        durationMinutes: selection.durationMinutes,
        subtotal: selection.subtotal,
        depositAmount: selection.depositAmount,
      });
      return;
    }

    if (selection.effectiveFlow !== "self_book") {
      res.json({
        effectiveFlow: selection.effectiveFlow,
        serviceMode: requestedServiceMode,
        timezone: business.timezone ?? "America/Los_Angeles",
        date: toDateKey(date),
        slots: [],
      });
      return;
    }

    if (requestedServiceMode === "in_shop" && parsedQuery.data.locationId) {
      const activeLocations = await listPublicBookingLocations(business.id);
      const matchesLocation = activeLocations.some((location) => location.id === parsedQuery.data.locationId);
      if (!matchesLocation) {
        throw new BadRequestError("Select a valid booking location.");
      }
    }

    const dayStart = startOfLocalDay(date);
    const dayEnd = addDays(dayStart, 1);
    const existingRows = await db
      .select({
        startTime: appointments.startTime,
        endTime: appointments.endTime,
        internalNotes: appointments.internalNotes,
      })
      .from(appointments)
      .where(
        and(
          eq(appointments.businessId, business.id),
          sql`${appointments.status} NOT IN ('cancelled', 'no-show')`,
          sql`${appointments.startTime} < ${dayEnd}`,
          sql`coalesce(${appointments.endTime}, ${appointments.startTime} + interval '1 hour') > ${dayStart}`
        )
      )
      .orderBy(asc(appointments.startTime));

    const slotCapacity = bookingSchedule.slotCapacity;
    const slots = buildSlotsForDate({
      date,
      operatingHours: business.operatingHours,
      durationMinutes: selection.durationMinutes,
      leadTimeHours: selection.leadTimeHours,
      incrementMinutes: bookingSchedule.incrementMinutes,
      availableDayIndexes: selection.availableDayIndexes ?? bookingSchedule.availableDayIndexes,
      openTime: selection.openTime ?? bookingSchedule.openTime,
      closeTime: selection.closeTime ?? bookingSchedule.closeTime,
      now: new Date(),
    }).filter((slotStart) =>
      isSlotAvailable({
        slotStart,
        durationMinutes: selection.durationMinutes,
        bufferMinutes: selection.bufferMinutes ?? bookingSchedule.bufferMinutes,
        appointmentCapacity: selection.slotCapacity ?? slotCapacity,
        blockCapacity: selection.slotCapacity ?? slotCapacity,
        existingRows,
      })
    );

    res.json({
      effectiveFlow: selection.effectiveFlow,
      serviceMode: requestedServiceMode,
      timezone: business.timezone ?? "America/Los_Angeles",
      date: toDateKey(date),
      slots: slots.map((slot) => ({
        startTime: slot.toISOString(),
        label: formatBookingTime(slot, business.timezone),
      })),
      durationMinutes: selection.durationMinutes,
      subtotal: selection.subtotal,
      depositAmount: selection.depositAmount,
    });
  })
);

businessesRouter.post(
  "/:id/public-bookings",
  publicBookingSubmitLimiter.middleware,
  wrapAsync(async (req: Request, res: Response) => {
    const parsedParams = publicLeadConfigParamsSchema.safeParse(req.params);
    if (!parsedParams.success) throw new BadRequestError(parsedParams.error.issues[0]?.message ?? "Invalid business.");
    const parsedBody = publicBookingSubmitSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) throw new BadRequestError(parsedBody.error.issues[0]?.message ?? "Invalid booking submission.");
    if (parsedBody.data.website && parsedBody.data.website.trim()) {
      res.status(202).json({ ok: true, accepted: true });
      return;
    }

    const business = await loadPublicBookingBusiness(parsedParams.data.id);
    if (!business || business.bookingEnabled !== true) {
      throw new NotFoundError("Online booking is not available for this business.");
    }

    const { services: publicServices, addonLinks } = await listPublicBookingServices(business.id);
    const selection = resolveBookingServicesSelection({
      businessDefaultFlow: business.bookingDefaultFlow,
      baseServiceId: parsedBody.data.serviceId,
      addonServiceIds: Array.from(new Set(parsedBody.data.addonServiceIds ?? [])),
      services: publicServices,
      addonLinks,
    });
    const requestedServiceMode = resolveCustomerBookingMode({
      serviceMode: selection.serviceMode,
      requestedMode: parsedBody.data.serviceMode,
    });

    const email = cleanOptionalText(parsedBody.data.email);
    const phone = cleanOptionalText(parsedBody.data.phone);
    if (!email && !phone) {
      throw new BadRequestError("Add at least an email or phone number so the shop can follow up.");
    }
    if ((business.bookingRequireEmail ?? false) && !email) {
      throw new BadRequestError("Add an email address so the shop can confirm the booking.");
    }
    if ((business.bookingRequirePhone ?? false) && !phone) {
      throw new BadRequestError("Add the best phone number so the shop can confirm the booking.");
    }

    const vehicleMake = cleanOptionalText(parsedBody.data.vehicleMake);
    const vehicleModel = cleanOptionalText(parsedBody.data.vehicleModel);
    const vehicleColor = cleanOptionalText(parsedBody.data.vehicleColor);
    const vehicleYear = parsedBody.data.vehicleYear ?? null;
    if ((business.bookingRequireVehicle ?? true) && (!vehicleMake || !vehicleModel)) {
      throw new BadRequestError("Add the vehicle make and model to continue.");
    }

    const normalizedSource = normalizeLeadSourceValue(parsedBody.data.source);
    const campaign = cleanOptionalText(parsedBody.data.campaign);
    const customerNotes = cleanOptionalText(parsedBody.data.notes);
    const draftResumeToken = cleanOptionalText(parsedBody.data.draftResumeToken);
    const serviceAddress = cleanOptionalText(parsedBody.data.serviceAddress);
    const serviceCity = cleanOptionalText(parsedBody.data.serviceCity);
    const serviceState = cleanOptionalText(parsedBody.data.serviceState);
    const serviceZip = cleanOptionalText(parsedBody.data.serviceZip);
    const vehicleSummary = buildVehicleSummary({
      year: vehicleYear,
      make: vehicleMake,
      model: vehicleModel,
    });

    if (requestedServiceMode === "mobile" && !serviceAddress) {
      throw new BadRequestError("Add the service address for mobile or on-site bookings.");
    }

    if (requestedServiceMode === "in_shop" && parsedBody.data.locationId) {
      const activeLocations = await listPublicBookingLocations(business.id);
      const matchesLocation = activeLocations.some((location) => location.id === parsedBody.data.locationId);
      if (!matchesLocation) {
        throw new BadRequestError("Select a valid booking location.");
      }
    }

    if (selection.effectiveFlow === "request") {
      const nextStepHours = Math.max(1, Math.min(Number(business.automationUncontactedLeadHours ?? 2), 168));
      const [createdLead] = await db
        .insert(clients)
        .values({
          businessId: business.id,
          firstName: parsedBody.data.firstName.trim(),
          lastName: parsedBody.data.lastName.trim(),
          email,
          phone,
          address: requestedServiceMode === "mobile" ? serviceAddress : null,
          city: requestedServiceMode === "mobile" ? serviceCity : null,
          state: requestedServiceMode === "mobile" ? serviceState : null,
          zip: requestedServiceMode === "mobile" ? serviceZip : null,
          notes: buildLeadNotes({
            status: "new",
            source: normalizedSource,
            serviceInterest: selection.serviceSummary,
            nextStep: `Contact within ${nextStepHours} hour${nextStepHours === 1 ? "" : "s"}`,
            summary: [
              customerNotes,
              requestedServiceMode === "mobile"
                ? [serviceAddress, serviceCity, serviceState, serviceZip].filter(Boolean).join(", ")
                : null,
              campaign ? `Campaign: ${campaign}` : null,
              "Submitted from the public booking request flow.",
            ]
              .filter(Boolean)
              .join("\n"),
            vehicle: vehicleSummary ?? "",
          }),
          internalNotes: [
            "Public booking request",
            `Service mode: ${requestedServiceMode}`,
            requestedServiceMode === "in_shop" && parsedBody.data.locationId ? `Location: ${parsedBody.data.locationId}` : null,
            campaign ? `Campaign: ${campaign}` : null,
            cleanOptionalText(parsedBody.data.source) ? `Source detail: ${cleanOptionalText(parsedBody.data.source)}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
          marketingOptIn: parsedBody.data.marketingOptIn ?? true,
        })
        .returning();

      if (!createdLead) throw new BadRequestError("Could not save this booking request.");

      if (vehicleMake && vehicleModel) {
        await db.insert(vehicles).values({
          id: randomUUID(),
          businessId: business.id,
          clientId: createdLead.id,
          year: vehicleYear,
          make: vehicleMake,
          model: vehicleModel,
          color: vehicleColor ?? null,
        });
      }

      await createActivityLog({
        businessId: business.id,
        action: "booking.request_created",
        entityType: "client",
        entityId: createdLead.id,
        metadata: {
          source: normalizedSource,
          campaign,
          bookingFlow: "request",
          serviceMode: requestedServiceMode,
          serviceSummary: selection.serviceSummary,
        },
      });

      const clientName = `${createdLead.firstName} ${createdLead.lastName}`.trim();
      const followUpTasks: Array<Promise<unknown>> = [];
      if (business.leadAutoResponseEnabled) {
        if (business.leadAutoResponseEmailEnabled && email && isEmailConfigured()) {
          followUpTasks.push(
            sendLeadAutoResponse({
              to: email,
              businessId: business.id,
              clientName,
              businessName: business.name,
              serviceInterest: selection.serviceSummary,
              responseWindow: `within ${nextStepHours} hour${nextStepHours === 1 ? "" : "s"}`,
            }).catch((error) => {
              warnOnce(`booking:auto-response-email:${createdLead.id}`, "booking request auto-response email failed", {
                businessId: business.id,
                clientId: createdLead.id,
                error: error instanceof Error ? error.message : String(error),
              });
            })
          );
        }

        if (business.leadAutoResponseSmsEnabled && phone) {
          followUpTasks.push(
            enqueueTwilioTemplateSms({
              businessId: business.id,
              templateSlug: "lead_auto_response",
              to: phone,
              vars: {
                clientName,
                businessName: business.name,
                serviceInterest: selection.serviceSummary,
                responseWindow: `within ${nextStepHours} hour${nextStepHours === 1 ? "" : "s"}`,
              },
              entityType: "client",
              entityId: createdLead.id,
            }).catch((error) => {
              warnOnce(`booking:auto-response-sms:${createdLead.id}`, "booking request auto-response sms failed", {
                businessId: business.id,
                clientId: createdLead.id,
                error: error instanceof Error ? error.message : String(error),
              });
            })
          );
        }
      }

      const followUpRecipient = cleanOptionalText(business.email ?? undefined);
      if (followUpRecipient && isEmailConfigured()) {
        followUpTasks.push(
          sendLeadFollowUpAlert({
            to: followUpRecipient,
            businessId: business.id,
            businessName: business.name,
            ownerName: "Team",
            clientName,
            clientEmail: email,
            clientPhone: phone,
            vehicle: vehicleSummary,
            serviceInterest: selection.serviceSummary,
            summary: customerNotes,
          }).catch((error) => {
            warnOnce(`booking:follow-up-alert:${createdLead.id}`, "booking request follow-up alert failed", {
              businessId: business.id,
              clientId: createdLead.id,
              error: error instanceof Error ? error.message : String(error),
            });
          })
        );
      }

      await Promise.all(followUpTasks);

      await finalizePublicBookingDraft({
        businessId: business.id,
        resumeToken: draftResumeToken,
        finalStatus: "submitted_request",
        metadata: {
          leadId: createdLead.id,
          bookingFlow: "request",
          serviceSummary: selection.serviceSummary,
        },
      });

      res.status(201).json({
        ok: true,
        accepted: true,
        mode: "request",
        leadId: createdLead.id,
        message: bookingSuccessMessage({
          businessMessage: business.bookingConfirmationMessage,
          mode: "request",
        }),
      });
      return;
    }

    if (!parsedBody.data.startTime) {
      throw new BadRequestError("Choose an available time to continue.");
    }

    const startTime = new Date(parsedBody.data.startTime);
    if (Number.isNaN(startTime.getTime())) {
      throw new BadRequestError("Choose a valid start time.");
    }

    const selectedDate = startOfLocalDay(startTime);
    const today = startOfLocalDay(new Date());
    const lastAllowedDate = addDays(today, selection.bookingWindowDays - 1);
    if (selectedDate.getTime() < today.getTime() || selectedDate.getTime() > lastAllowedDate.getTime()) {
      throw new BadRequestError("Choose a booking date inside the available window.");
    }
    const bookingSchedule = resolveBookingSchedule(business);
    if (bookingSchedule.blackoutDates.has(toDateKey(selectedDate))) {
      throw new BadRequestError("This date is unavailable for online booking.");
    }

    const dayStart = startOfLocalDay(startTime);
    const dayEnd = addDays(dayStart, 1);
    const existingRows = await db
      .select({
        startTime: appointments.startTime,
        endTime: appointments.endTime,
        internalNotes: appointments.internalNotes,
      })
      .from(appointments)
      .where(
        and(
          eq(appointments.businessId, business.id),
          sql`${appointments.status} NOT IN ('cancelled', 'no-show')`,
          sql`${appointments.startTime} < ${dayEnd}`,
          sql`coalesce(${appointments.endTime}, ${appointments.startTime} + interval '1 hour') > ${dayStart}`
        )
      )
      .orderBy(asc(appointments.startTime));

    const slotCapacity = bookingSchedule.slotCapacity;
    const allowedSlots = buildSlotsForDate({
      date: selectedDate,
      operatingHours: business.operatingHours,
      durationMinutes: selection.durationMinutes,
      leadTimeHours: selection.leadTimeHours,
      incrementMinutes: bookingSchedule.incrementMinutes,
      availableDayIndexes: selection.availableDayIndexes ?? bookingSchedule.availableDayIndexes,
      openTime: selection.openTime ?? bookingSchedule.openTime,
      closeTime: selection.closeTime ?? bookingSchedule.closeTime,
      now: new Date(),
    }).filter((slotStart) =>
      isSlotAvailable({
        slotStart,
        durationMinutes: selection.durationMinutes,
        bufferMinutes: selection.bufferMinutes ?? bookingSchedule.bufferMinutes,
        appointmentCapacity: selection.slotCapacity ?? slotCapacity,
        blockCapacity: selection.slotCapacity ?? slotCapacity,
        existingRows,
      })
    );

    const matchesAvailableSlot = allowedSlots.some((slot) => slot.getTime() === startTime.getTime());
    if (!matchesAvailableSlot) {
      throw new BadRequestError("That time is no longer available. Refresh availability and choose another slot.");
    }

    const appointmentEnd = new Date(startTime.getTime() + selection.durationMinutes * 60 * 1000);
    const overlappingAppointments = await countOverlappingAppointments({
      businessId: business.id,
      startTime,
      endTime: appointmentEnd,
    });
    if (overlappingAppointments >= (selection.slotCapacity ?? slotCapacity)) {
      throw new BadRequestError("That time is no longer available. Refresh availability and choose another slot.");
    }

    const finance = calculateAppointmentFinanceTotals({
      subtotal: selection.subtotal,
      taxRate: Number(business.defaultTaxRate ?? 0),
      applyTax: selection.applyTax,
      adminFeeRate: Number(business.defaultAdminFee ?? 0),
      applyAdminFee: business.defaultAdminFeeEnabled ?? false,
    });

    const client = await findOrCreatePublicClient({
      businessId: business.id,
      firstName: parsedBody.data.firstName.trim(),
      lastName: parsedBody.data.lastName.trim(),
      email,
      phone,
      address: requestedServiceMode === "mobile" ? serviceAddress : null,
      city: requestedServiceMode === "mobile" ? serviceCity : null,
      state: requestedServiceMode === "mobile" ? serviceState : null,
      zip: requestedServiceMode === "mobile" ? serviceZip : null,
      notes: customerNotes,
      internalNotes: [
        "Public online booking",
        `Service mode: ${requestedServiceMode}`,
        campaign ? `Campaign: ${campaign}` : null,
        cleanOptionalText(parsedBody.data.source) ? `Source detail: ${cleanOptionalText(parsedBody.data.source)}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      marketingOptIn: parsedBody.data.marketingOptIn ?? true,
    });

    const vehicle = await findOrCreatePublicVehicle({
      businessId: business.id,
      clientId: client.id,
      year: vehicleYear,
      make: vehicleMake,
      model: vehicleModel,
      color: vehicleColor,
    });

    const appointmentId = randomUUID();
    const [createdAppointment] = await db
      .insert(appointments)
      .values({
        id: appointmentId,
        businessId: business.id,
        clientId: client.id,
        vehicleId: vehicle?.id ?? null,
        locationId: requestedServiceMode === "in_shop" ? parsedBody.data.locationId ?? null : null,
        title: selection.title,
        startTime,
        endTime: appointmentEnd,
        jobStartTime: startTime,
        expectedCompletionTime: appointmentEnd,
        subtotal: String(finance.subtotal.toFixed(2)),
        taxRate: String(finance.taxRate.toFixed(2)),
        taxAmount: String(finance.taxAmount.toFixed(2)),
        applyTax: finance.applyTax,
        adminFeeRate: String(finance.adminFeeRate.toFixed(2)),
        adminFeeAmount: String(finance.adminFeeAmount.toFixed(2)),
        applyAdminFee: finance.applyAdminFee,
        totalPrice: String(finance.totalPrice.toFixed(2)),
        depositAmount: String(selection.depositAmount.toFixed(2)),
        notes: customerNotes,
        vehicleOnSite: requestedServiceMode === "in_shop",
        internalNotes: [
          "Public online booking",
          `Booking flow: self_book`,
          `Service mode: ${requestedServiceMode}`,
          requestedServiceMode === "mobile"
            ? `Service address: ${[serviceAddress, serviceCity, serviceState, serviceZip].filter(Boolean).join(", ")}`
            : null,
          campaign ? `Campaign: ${campaign}` : null,
          cleanOptionalText(parsedBody.data.source) ? `Source detail: ${cleanOptionalText(parsedBody.data.source)}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
      })
      .returning({
        id: appointments.id,
        publicTokenVersion: appointments.publicTokenVersion,
      });

    if (!createdAppointment) {
      throw new BadRequestError("Could not create this appointment.");
    }

    const serviceRows = selection.allServices.map((service) => ({
      id: randomUUID(),
      appointmentId: createdAppointment.id,
      serviceId: service.id,
      quantity: 1,
      unitPrice: service.price,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    if (serviceRows.length > 0) {
      await db.insert(appointmentServices).values(serviceRows);
    }

    const publicToken = createPublicDocumentToken({
      kind: "appointment",
      entityId: createdAppointment.id,
      businessId: business.id,
      tokenVersion: createdAppointment.publicTokenVersion ?? 1,
    });
    const confirmationUrl = buildPublicDocumentUrl(
      `/api/appointments/${encodeURIComponent(createdAppointment.id)}/public-html?token=${encodeURIComponent(publicToken)}`
    );
    const portalUrl = buildPublicAppUrl(`/portal/${encodeURIComponent(publicToken)}`);

    await createActivityLog({
      businessId: business.id,
      action: "booking.public_booked",
      entityType: "appointment",
      entityId: createdAppointment.id,
      metadata: {
        source: normalizedSource,
        campaign,
        serviceSummary: selection.serviceSummary,
        locationId: parsedBody.data.locationId ?? null,
      },
    });

    if (email && isEmailConfigured() && (business.notificationAppointmentConfirmationEmailEnabled ?? true)) {
      sendAppointmentConfirmation({
        to: email,
        businessId: business.id,
        clientName: `${client.firstName} ${client.lastName}`.trim(),
        businessName: business.name,
        dateTime: formatBookingDateTime(startTime, business.timezone),
        vehicle: vehicleSummary,
        serviceSummary: selection.serviceSummary,
        confirmationUrl,
        portalUrl,
      }).catch((error) => {
        warnOnce(`booking:appointment-confirmation:${createdAppointment.id}`, "public booking confirmation email failed", {
          businessId: business.id,
          appointmentId: createdAppointment.id,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }

    await finalizePublicBookingDraft({
      businessId: business.id,
      resumeToken: draftResumeToken,
      finalStatus: "confirmed_booking",
      metadata: {
        appointmentId: createdAppointment.id,
        bookingFlow: "self_book",
        serviceSummary: selection.serviceSummary,
      },
    });

    res.status(201).json({
      ok: true,
      accepted: true,
      mode: "self_book",
      appointmentId: createdAppointment.id,
      confirmationUrl,
      portalUrl,
      scheduledFor: formatBookingDateTime(startTime, business.timezone),
      depositAmount: selection.depositAmount,
      message: bookingSuccessMessage({
        businessMessage: business.bookingConfirmationMessage,
        mode: "self_book",
      }),
    });
  })
);

businessesRouter.get(
  "/:id/public-lead-config",
  publicLeadConfigLimiter.middleware,
  wrapAsync(async (req: Request, res: Response) => {
    const parsed = publicLeadConfigParamsSchema.safeParse(req.params);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? "Invalid business.");

    const business = await loadPublicLeadBusiness(parsed.data.id);
    if (!business || !business.leadCaptureEnabled) {
      throw new NotFoundError("Lead capture is not available for this business.");
    }

    res.json({
      businessId: business.id,
      businessName: business.name,
      businessType: business.type,
      timezone: business.timezone ?? "America/Los_Angeles",
      leadCaptureEnabled: business.leadCaptureEnabled ?? false,
    });
  })
);

businessesRouter.post(
  "/:id/public-leads",
  publicLeadSubmitLimiter.middleware,
  wrapAsync(async (req: Request, res: Response) => {
    const parsedParams = publicLeadConfigParamsSchema.safeParse(req.params);
    if (!parsedParams.success) throw new BadRequestError(parsedParams.error.issues[0]?.message ?? "Invalid business.");
    const parsedBody = publicLeadCaptureSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) throw new BadRequestError(parsedBody.error.issues[0]?.message ?? "Invalid lead submission.");
    if (parsedBody.data.website && parsedBody.data.website.trim()) {
      res.status(202).json({ ok: true, accepted: true });
      return;
    }

    const business = await loadPublicLeadBusiness(parsedParams.data.id);
    if (!business || !business.leadCaptureEnabled) {
      throw new NotFoundError("Lead capture is not available for this business.");
    }

    const email = cleanOptionalText(parsedBody.data.email);
    const phone = cleanOptionalText(parsedBody.data.phone);
    if (!email && !phone) {
      throw new BadRequestError("Add at least an email or phone number so the shop can follow up.");
    }

    const normalizedSource = normalizeLeadSourceValue(parsedBody.data.source);

    const campaign = cleanOptionalText(parsedBody.data.campaign);
    const serviceInterest = cleanOptionalText(parsedBody.data.serviceInterest);
    const vehicle = cleanOptionalText(parsedBody.data.vehicle);
    const summaryParts = [
      cleanOptionalText(parsedBody.data.summary),
      campaign ? `Campaign: ${campaign}` : null,
      parsedBody.data.source?.trim() ? `Source detail: ${parsedBody.data.source.trim()}` : null,
      "Submitted from the public lead form.",
    ].filter(Boolean);
    const nextStepHours = Math.max(1, Math.min(Number(business.automationUncontactedLeadHours ?? 2), 168));
    const [created] = await db
      .insert(clients)
      .values({
        businessId: business.id,
        firstName: parsedBody.data.firstName.trim(),
        lastName: parsedBody.data.lastName.trim(),
        email,
        phone,
        notes: buildLeadNotes({
          status: "new",
          source: normalizedSource,
          serviceInterest: serviceInterest ?? "",
          nextStep: `Contact within ${nextStepHours} hour${nextStepHours === 1 ? "" : "s"}`,
          summary: summaryParts.join("\n"),
          vehicle: vehicle ?? "",
        }),
        internalNotes: [
          "Public lead capture",
          campaign ? `Campaign: ${campaign}` : null,
          parsedBody.data.source?.trim() ? `Source detail: ${parsedBody.data.source.trim()}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
        marketingOptIn: parsedBody.data.marketingOptIn ?? true,
      })
      .returning();

    if (!created) throw new BadRequestError("Could not save this lead.");

    await createActivityLog({
      businessId: business.id,
      action: "lead.public_captured",
      entityType: "client",
      entityId: created.id,
      metadata: {
        source: normalizedSource,
        sourceDetail: parsedBody.data.source?.trim() || null,
        campaign,
        serviceInterest,
        capturedVia: "public_form",
      },
    });

    const clientName = `${created.firstName} ${created.lastName}`.trim();
    const autoResponseTasks: Array<Promise<unknown>> = [];

    if (business.leadAutoResponseEnabled) {
      if (business.leadAutoResponseEmailEnabled && email && isEmailConfigured()) {
        autoResponseTasks.push(
          sendLeadAutoResponse({
            to: email,
            businessId: business.id,
            clientName,
            businessName: business.name,
            serviceInterest,
            responseWindow: `within ${nextStepHours} hour${nextStepHours === 1 ? "" : "s"}`,
          })
            .then(() =>
              createActivityLog({
                businessId: business.id,
                action: "lead.auto_response.sent",
                entityType: "client",
                entityId: created.id,
                metadata: { channel: "email", recipient: email },
              })
            )
            .catch((error) => {
              warnOnce(`lead:auto-response-email:${created.id}`, "lead auto-response email failed", {
                businessId: business.id,
                clientId: created.id,
                error: error instanceof Error ? error.message : String(error),
              });
            })
        );
      }

      if (business.leadAutoResponseSmsEnabled && phone) {
        autoResponseTasks.push(
          enqueueTwilioTemplateSms({
            businessId: business.id,
            templateSlug: "lead_auto_response",
            to: phone,
            vars: {
              clientName,
              businessName: business.name,
              serviceInterest: serviceInterest ?? "-",
              responseWindow: `within ${nextStepHours} hour${nextStepHours === 1 ? "" : "s"}`,
            },
            entityType: "client",
            entityId: created.id,
          }).catch((error) => {
            warnOnce(`lead:auto-response-sms:${created.id}`, "lead auto-response sms enqueue failed", {
              businessId: business.id,
              clientId: created.id,
              error: error instanceof Error ? error.message : String(error),
            });
          })
        );
      }
    }

    const followUpRecipient =
      cleanOptionalText(business.email ?? undefined) ?? cleanOptionalText(business.ownerEmail ?? undefined);
    if (followUpRecipient && isEmailConfigured()) {
      autoResponseTasks.push(
        sendLeadFollowUpAlert({
          to: followUpRecipient,
          businessId: business.id,
          businessName: business.name,
          ownerName: cleanOptionalText(business.ownerFirstName ?? undefined) ?? "Team",
          clientName,
          clientEmail: email,
          clientPhone: phone,
          vehicle,
          serviceInterest,
          summary: cleanOptionalText(parsedBody.data.summary),
        })
          .then(() =>
            createActivityLog({
              businessId: business.id,
              action: "lead.follow_up_alert.sent",
              entityType: "client",
              entityId: created.id,
              metadata: { channel: "email", recipient: followUpRecipient },
            })
          )
          .catch((error) => {
            warnOnce(`lead:follow-up-alert:${created.id}`, "lead follow-up alert failed", {
              businessId: business.id,
              clientId: created.id,
              error: error instanceof Error ? error.message : String(error),
            });
          })
      );
    }

    await Promise.all(autoResponseTasks);

    res.status(201).json({
      ok: true,
      accepted: true,
      leadId: created.id,
      autoResponseConfigured: !!business.leadAutoResponseEnabled,
    });
  })
);

businessesRouter.get("/", requireAuth, wrapAsync(async (req: Request, res: Response) => {
  if (!req.userId) throw new ForbiddenError("Not signed in.");
  if (req.businessId) {
    if (!req.membershipRole || !roleHasPermission(req.membershipRole, "settings.read")) {
      throw new ForbiddenError("You do not have permission to perform this action.");
    }
    const currentBusiness = await loadBusinessById(req.businessId);
    res.json({ records: currentBusiness ? [serializeBusiness(currentBusiness)] : [] });
    return;
  }
  let ownerId = req.userId;
  if (req.query.filter) {
    try {
      const filter = JSON.parse(String(req.query.filter)) as { owner?: { id?: { equals?: string } } };
      if (filter?.owner?.id?.equals) ownerId = filter.owner.id.equals;
    } catch {
      // ignore invalid filter
    }
  }
  if (ownerId !== req.userId) throw new ForbiddenError("Access denied.");
  const business = await loadBusinessByOwner(ownerId);
  if (!business) {
    res.json({ records: [] });
    return;
  }
  res.json({ records: [serializeBusiness(business)] });
}));

businessesRouter.post("/", requireAuth, wrapAsync(async (req: Request, res: Response) => {
  if (!req.userId) throw new ForbiddenError("Not signed in.");
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");
  if (
    (parsed.data.automationSendWindowStartHour ?? 8) ===
    (parsed.data.automationSendWindowEndHour ?? 18)
  ) {
    throw new BadRequestError("Automation send window start and end hours cannot be the same.");
  }
  if (
    parsed.data.bookingAvailableStartTime &&
    parsed.data.bookingAvailableEndTime &&
    parseTimeToMinutes(parsed.data.bookingAvailableStartTime) ===
      parseTimeToMinutes(parsed.data.bookingAvailableEndTime)
  ) {
    throw new BadRequestError("Booking start and end times cannot be the same.");
  }
  if (parsed.data.integrationWebhookEnabled && !parsed.data.integrationWebhookUrl?.trim()) {
    throw new BadRequestError("Add a webhook endpoint URL before enabling signed webhooks.");
  }
  const typeDefaults = getBusinessTypeDefaults(parsed.data.type);
  const businessId = randomUUID();
  const membershipId = randomUUID();
  const [created] = await db
    .insert(businesses)
    .values({
      id: businessId,
      ownerId: req.userId!,
      name: parsed.data.name,
      type: parsed.data.type,
      email: parsed.data.email ?? null,
      phone: parsed.data.phone ?? null,
      address: parsed.data.address ?? null,
      city: parsed.data.city ?? null,
      state: parsed.data.state ?? null,
      zip: parsed.data.zip ?? null,
      staffCount: parsed.data.staffCount ?? typeDefaults.defaultStaffCount,
      operatingHours: parsed.data.operatingHours ?? typeDefaults.operatingHours,
      timezone: parsed.data.timezone ?? typeDefaults.timezone,
      currency: parsed.data.currency ?? typeDefaults.currency,
      defaultTaxRate:
        parsed.data.defaultTaxRate != null ? String(parsed.data.defaultTaxRate) : String(typeDefaults.defaultTaxRate),
      defaultAdminFee: String(parsed.data.defaultAdminFee ?? 0),
      defaultAdminFeeEnabled: parsed.data.defaultAdminFeeEnabled ?? false,
      appointmentBufferMinutes:
        parsed.data.appointmentBufferMinutes ?? typeDefaults.appointmentBufferMinutes,
      calendarBlockCapacityPerSlot:
        parsed.data.calendarBlockCapacityPerSlot ?? typeDefaults.calendarBlockCapacityPerSlot,
      leadCaptureEnabled: parsed.data.leadCaptureEnabled ?? false,
      leadAutoResponseEnabled: parsed.data.leadAutoResponseEnabled ?? true,
      leadAutoResponseEmailEnabled: parsed.data.leadAutoResponseEmailEnabled ?? true,
      leadAutoResponseSmsEnabled: parsed.data.leadAutoResponseSmsEnabled ?? false,
      notificationAppointmentConfirmationEmailEnabled:
        parsed.data.notificationAppointmentConfirmationEmailEnabled ?? true,
      notificationAppointmentReminderEmailEnabled:
        parsed.data.notificationAppointmentReminderEmailEnabled ?? true,
      notificationAbandonedQuoteEmailEnabled: parsed.data.notificationAbandonedQuoteEmailEnabled ?? true,
      notificationReviewRequestEmailEnabled: parsed.data.notificationReviewRequestEmailEnabled ?? true,
      notificationLapsedClientEmailEnabled: parsed.data.notificationLapsedClientEmailEnabled ?? true,
      missedCallTextBackEnabled: parsed.data.missedCallTextBackEnabled ?? false,
      automationUncontactedLeadsEnabled: parsed.data.automationUncontactedLeadsEnabled ?? false,
      automationUncontactedLeadHours: parsed.data.automationUncontactedLeadHours ?? 2,
      automationAppointmentRemindersEnabled: parsed.data.automationAppointmentRemindersEnabled ?? true,
      automationAppointmentReminderHours: parsed.data.automationAppointmentReminderHours ?? 24,
      automationSendWindowStartHour: parsed.data.automationSendWindowStartHour ?? 8,
      automationSendWindowEndHour: parsed.data.automationSendWindowEndHour ?? 18,
      automationReviewRequestsEnabled: parsed.data.automationReviewRequestsEnabled ?? false,
      automationReviewRequestDelayHours: parsed.data.automationReviewRequestDelayHours ?? 24,
      reviewRequestUrl: parsed.data.reviewRequestUrl ?? null,
      automationAbandonedQuotesEnabled: parsed.data.automationAbandonedQuotesEnabled ?? false,
      automationAbandonedQuoteHours: parsed.data.automationAbandonedQuoteHours ?? 48,
      automationLapsedClientsEnabled: parsed.data.automationLapsedClientsEnabled ?? false,
      automationLapsedClientMonths: parsed.data.automationLapsedClientMonths ?? 6,
      bookingRequestUrl: parsed.data.bookingRequestUrl ?? null,
      bookingEnabled: parsed.data.bookingEnabled ?? false,
      bookingDefaultFlow: parsed.data.bookingDefaultFlow ?? "request",
      bookingPageTitle: parsed.data.bookingPageTitle?.trim() || null,
      bookingPageSubtitle: parsed.data.bookingPageSubtitle?.trim() || null,
      bookingConfirmationMessage: parsed.data.bookingConfirmationMessage?.trim() || null,
      bookingTrustBulletPrimary: parsed.data.bookingTrustBulletPrimary?.trim() || null,
      bookingTrustBulletSecondary: parsed.data.bookingTrustBulletSecondary?.trim() || null,
      bookingTrustBulletTertiary: parsed.data.bookingTrustBulletTertiary?.trim() || null,
      bookingNotesPrompt: parsed.data.bookingNotesPrompt?.trim() || null,
      bookingBrandLogoUrl: parsed.data.bookingBrandLogoUrl?.trim() || null,
      bookingBrandPrimaryColorToken: normalizeBookingBrandPrimaryColorToken(parsed.data.bookingBrandPrimaryColorToken),
      bookingBrandAccentColorToken: normalizeBookingBrandAccentColorToken(parsed.data.bookingBrandAccentColorToken),
      bookingBrandBackgroundToneToken: normalizeBookingBrandBackgroundToneToken(parsed.data.bookingBrandBackgroundToneToken),
      bookingBrandButtonStyleToken: normalizeBookingBrandButtonStyleToken(parsed.data.bookingBrandButtonStyleToken),
      bookingRequireEmail: parsed.data.bookingRequireEmail ?? false,
      bookingRequirePhone: parsed.data.bookingRequirePhone ?? false,
      bookingRequireVehicle: parsed.data.bookingRequireVehicle ?? true,
      bookingAllowCustomerNotes: parsed.data.bookingAllowCustomerNotes ?? true,
      bookingShowPrices: parsed.data.bookingShowPrices ?? true,
      bookingShowDurations: parsed.data.bookingShowDurations ?? true,
      bookingAvailableDays:
        parsed.data.bookingAvailableDays !== undefined ? JSON.stringify(parsed.data.bookingAvailableDays) : null,
      bookingAvailableStartTime: parsed.data.bookingAvailableStartTime ?? null,
      bookingAvailableEndTime: parsed.data.bookingAvailableEndTime ?? null,
      bookingBlackoutDates:
        parsed.data.bookingBlackoutDates !== undefined ? JSON.stringify(parsed.data.bookingBlackoutDates) : null,
      bookingSlotIntervalMinutes: parsed.data.bookingSlotIntervalMinutes ?? 15,
      bookingBufferMinutes: parsed.data.bookingBufferMinutes ?? null,
      bookingCapacityPerSlot: parsed.data.bookingCapacityPerSlot ?? null,
      monthlyRevenueGoal:
        parsed.data.monthlyRevenueGoal != null ? String(parsed.data.monthlyRevenueGoal) : null,
      monthlyJobsGoal: parsed.data.monthlyJobsGoal ?? null,
      integrationWebhookEnabled: parsed.data.integrationWebhookEnabled ?? false,
      integrationWebhookUrl: parsed.data.integrationWebhookUrl ?? null,
      integrationWebhookSecret: normalizeBusinessWebhookSecretForStorage(parsed.data.integrationWebhookSecret ?? null),
      integrationWebhookEvents: JSON.stringify(parsed.data.integrationWebhookEvents ?? []),
    })
    .returning();
  if (!created) throw new BadRequestError("Failed to create business.");

  // Legacy production schemas can be missing business_memberships entirely.
  // Keep business creation durable and treat membership creation as best-effort.
  try {
    await db.insert(businessMemberships).values({
      id: membershipId,
      businessId,
      userId: req.userId!,
      role: "owner",
      status: "active",
      isDefault: true,
      joinedAt: new Date(),
    });
  } catch (error) {
    if (!isBusinessSchemaDriftError(error)) throw error;
    warnOnce("businesses:create:membership-schema", "business membership schema unavailable during business create", {
      userId: req.userId,
      businessId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    await syncOutboundWebhookConnectionForBusiness({
      businessId,
      webhookEnabled: created.integrationWebhookEnabled ?? false,
      webhookUrl: created.integrationWebhookUrl ?? null,
      webhookSecret: readBusinessWebhookSecret(created.integrationWebhookSecret),
      webhookEvents: JSON.parse(created.integrationWebhookEvents ?? "[]") as string[],
    });
  } catch (error) {
    warnOnce("businesses:create:webhook-sync", "business create webhook sync skipped", {
      businessId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  res.status(201).json(serializeBusiness(created));
}));

businessesRouter.get("/:id", requireAuth, wrapAsync(async (req: Request, res: Response) => {
  if (!req.userId) throw new ForbiddenError("Not signed in.");
  const business = await loadBusinessById(req.params.id);
  if (!business) throw new NotFoundError("Business not found.");
  if (!canAccessBusiness(req, business, "settings.read")) {
    throw new ForbiddenError("You do not have permission to perform this action.");
  }
  res.json(serializeBusiness(business));
}));

businessesRouter.patch("/:id", requireAuth, wrapAsync(async (req: Request, res: Response) => {
  if (!req.userId) throw new ForbiddenError("Not signed in.");
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? "Invalid input");
  const existing = await loadBusinessById(req.params.id);
  if (!existing) throw new NotFoundError("Business not found.");
  if (!canAccessBusiness(req, existing, "settings.write")) {
    throw new ForbiddenError("You do not have permission to perform this action.");
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.type !== undefined) updates.type = parsed.data.type;
  if (parsed.data.email !== undefined) updates.email = parsed.data.email ?? null;
  if (parsed.data.phone !== undefined) updates.phone = parsed.data.phone ?? null;
  if (parsed.data.address !== undefined) updates.address = parsed.data.address ?? null;
  if (parsed.data.city !== undefined) updates.city = parsed.data.city ?? null;
  if (parsed.data.state !== undefined) updates.state = parsed.data.state ?? null;
  if (parsed.data.zip !== undefined) updates.zip = parsed.data.zip ?? null;
  if (parsed.data.staffCount !== undefined) updates.staffCount = parsed.data.staffCount ?? null;
  if (parsed.data.operatingHours !== undefined) updates.operatingHours = parsed.data.operatingHours ?? null;
  if (parsed.data.timezone !== undefined) updates.timezone = parsed.data.timezone ?? null;
  if (parsed.data.currency !== undefined) updates.currency = parsed.data.currency?.toUpperCase() ?? "USD";
  if (parsed.data.defaultTaxRate !== undefined) updates.defaultTaxRate = String(parsed.data.defaultTaxRate ?? 0);
  if (parsed.data.defaultAdminFee !== undefined) updates.defaultAdminFee = String(parsed.data.defaultAdminFee ?? 0);
  if (parsed.data.defaultAdminFeeEnabled !== undefined) {
    updates.defaultAdminFeeEnabled = parsed.data.defaultAdminFeeEnabled ?? false;
  }
  if (parsed.data.defaultAppointmentStartTime !== undefined) {
    updates.defaultAppointmentStartTime = parsed.data.defaultAppointmentStartTime ?? "09:00";
  }
  if (parsed.data.appointmentBufferMinutes !== undefined) {
    updates.appointmentBufferMinutes = parsed.data.appointmentBufferMinutes ?? 15;
  }
  if (parsed.data.calendarBlockCapacityPerSlot !== undefined) {
    updates.calendarBlockCapacityPerSlot = parsed.data.calendarBlockCapacityPerSlot ?? 1;
  }
  if (parsed.data.leadCaptureEnabled !== undefined) {
    updates.leadCaptureEnabled = parsed.data.leadCaptureEnabled ?? false;
  }
  if (parsed.data.leadAutoResponseEnabled !== undefined) {
    updates.leadAutoResponseEnabled = parsed.data.leadAutoResponseEnabled ?? true;
  }
  if (parsed.data.leadAutoResponseEmailEnabled !== undefined) {
    updates.leadAutoResponseEmailEnabled = parsed.data.leadAutoResponseEmailEnabled ?? true;
  }
  if (parsed.data.leadAutoResponseSmsEnabled !== undefined) {
    updates.leadAutoResponseSmsEnabled = parsed.data.leadAutoResponseSmsEnabled ?? false;
  }
  if (parsed.data.notificationAppointmentConfirmationEmailEnabled !== undefined) {
    updates.notificationAppointmentConfirmationEmailEnabled =
      parsed.data.notificationAppointmentConfirmationEmailEnabled ?? true;
  }
  if (parsed.data.notificationAppointmentReminderEmailEnabled !== undefined) {
    updates.notificationAppointmentReminderEmailEnabled =
      parsed.data.notificationAppointmentReminderEmailEnabled ?? true;
  }
  if (parsed.data.notificationAbandonedQuoteEmailEnabled !== undefined) {
    updates.notificationAbandonedQuoteEmailEnabled =
      parsed.data.notificationAbandonedQuoteEmailEnabled ?? true;
  }
  if (parsed.data.notificationReviewRequestEmailEnabled !== undefined) {
    updates.notificationReviewRequestEmailEnabled =
      parsed.data.notificationReviewRequestEmailEnabled ?? true;
  }
  if (parsed.data.notificationLapsedClientEmailEnabled !== undefined) {
    updates.notificationLapsedClientEmailEnabled =
      parsed.data.notificationLapsedClientEmailEnabled ?? true;
  }
  if (parsed.data.missedCallTextBackEnabled !== undefined) {
    updates.missedCallTextBackEnabled = parsed.data.missedCallTextBackEnabled ?? false;
  }
  if (parsed.data.automationUncontactedLeadsEnabled !== undefined) {
    updates.automationUncontactedLeadsEnabled = parsed.data.automationUncontactedLeadsEnabled ?? false;
  }
  if (parsed.data.automationUncontactedLeadHours !== undefined) {
    updates.automationUncontactedLeadHours = parsed.data.automationUncontactedLeadHours ?? 2;
  }
  if (parsed.data.automationAppointmentRemindersEnabled !== undefined) {
    updates.automationAppointmentRemindersEnabled = parsed.data.automationAppointmentRemindersEnabled ?? true;
  }
  if (parsed.data.automationAppointmentReminderHours !== undefined) {
    updates.automationAppointmentReminderHours = parsed.data.automationAppointmentReminderHours ?? 24;
  }
  if (parsed.data.automationSendWindowStartHour !== undefined) {
    updates.automationSendWindowStartHour = parsed.data.automationSendWindowStartHour ?? 8;
  }
  if (parsed.data.automationSendWindowEndHour !== undefined) {
    updates.automationSendWindowEndHour = parsed.data.automationSendWindowEndHour ?? 18;
  }
  if (parsed.data.automationReviewRequestsEnabled !== undefined) {
    updates.automationReviewRequestsEnabled = parsed.data.automationReviewRequestsEnabled ?? false;
  }
  if (parsed.data.automationReviewRequestDelayHours !== undefined) {
    updates.automationReviewRequestDelayHours = parsed.data.automationReviewRequestDelayHours ?? 24;
  }
  if (parsed.data.reviewRequestUrl !== undefined) {
    updates.reviewRequestUrl = parsed.data.reviewRequestUrl?.trim() || null;
  }
  if (parsed.data.automationAbandonedQuotesEnabled !== undefined) {
    updates.automationAbandonedQuotesEnabled = parsed.data.automationAbandonedQuotesEnabled ?? false;
  }
  if (parsed.data.automationAbandonedQuoteHours !== undefined) {
    updates.automationAbandonedQuoteHours = parsed.data.automationAbandonedQuoteHours ?? 48;
  }
  if (parsed.data.automationLapsedClientsEnabled !== undefined) {
    updates.automationLapsedClientsEnabled = parsed.data.automationLapsedClientsEnabled ?? false;
  }
  if (parsed.data.automationLapsedClientMonths !== undefined) {
    updates.automationLapsedClientMonths = parsed.data.automationLapsedClientMonths ?? 6;
  }
  if (parsed.data.bookingRequestUrl !== undefined) {
    updates.bookingRequestUrl = parsed.data.bookingRequestUrl?.trim() || null;
  }
  if (parsed.data.bookingEnabled !== undefined) {
    updates.bookingEnabled = parsed.data.bookingEnabled ?? false;
  }
  if (parsed.data.bookingDefaultFlow !== undefined) {
    updates.bookingDefaultFlow = parsed.data.bookingDefaultFlow ?? "request";
  }
  if (parsed.data.bookingPageTitle !== undefined) {
    updates.bookingPageTitle = parsed.data.bookingPageTitle?.trim() || null;
  }
  if (parsed.data.bookingPageSubtitle !== undefined) {
    updates.bookingPageSubtitle = parsed.data.bookingPageSubtitle?.trim() || null;
  }
  if (parsed.data.bookingConfirmationMessage !== undefined) {
    updates.bookingConfirmationMessage = parsed.data.bookingConfirmationMessage?.trim() || null;
  }
  if (parsed.data.bookingTrustBulletPrimary !== undefined) {
    updates.bookingTrustBulletPrimary = parsed.data.bookingTrustBulletPrimary?.trim() || null;
  }
  if (parsed.data.bookingTrustBulletSecondary !== undefined) {
    updates.bookingTrustBulletSecondary = parsed.data.bookingTrustBulletSecondary?.trim() || null;
  }
  if (parsed.data.bookingTrustBulletTertiary !== undefined) {
    updates.bookingTrustBulletTertiary = parsed.data.bookingTrustBulletTertiary?.trim() || null;
  }
  if (parsed.data.bookingNotesPrompt !== undefined) {
    updates.bookingNotesPrompt = parsed.data.bookingNotesPrompt?.trim() || null;
  }
  if (parsed.data.bookingBrandLogoUrl !== undefined) {
    updates.bookingBrandLogoUrl = parsed.data.bookingBrandLogoUrl?.trim() || null;
  }
  if (parsed.data.bookingBrandPrimaryColorToken !== undefined) {
    updates.bookingBrandPrimaryColorToken = normalizeBookingBrandPrimaryColorToken(parsed.data.bookingBrandPrimaryColorToken);
  }
  if (parsed.data.bookingBrandAccentColorToken !== undefined) {
    updates.bookingBrandAccentColorToken = normalizeBookingBrandAccentColorToken(parsed.data.bookingBrandAccentColorToken);
  }
  if (parsed.data.bookingBrandBackgroundToneToken !== undefined) {
    updates.bookingBrandBackgroundToneToken = normalizeBookingBrandBackgroundToneToken(parsed.data.bookingBrandBackgroundToneToken);
  }
  if (parsed.data.bookingBrandButtonStyleToken !== undefined) {
    updates.bookingBrandButtonStyleToken = normalizeBookingBrandButtonStyleToken(parsed.data.bookingBrandButtonStyleToken);
  }
  if (parsed.data.bookingRequireEmail !== undefined) {
    updates.bookingRequireEmail = parsed.data.bookingRequireEmail ?? false;
  }
  if (parsed.data.bookingRequirePhone !== undefined) {
    updates.bookingRequirePhone = parsed.data.bookingRequirePhone ?? false;
  }
  if (parsed.data.bookingRequireVehicle !== undefined) {
    updates.bookingRequireVehicle = parsed.data.bookingRequireVehicle ?? true;
  }
  if (parsed.data.bookingAllowCustomerNotes !== undefined) {
    updates.bookingAllowCustomerNotes = parsed.data.bookingAllowCustomerNotes ?? true;
  }
  if (parsed.data.bookingShowPrices !== undefined) {
    updates.bookingShowPrices = parsed.data.bookingShowPrices ?? true;
  }
  if (parsed.data.bookingShowDurations !== undefined) {
    updates.bookingShowDurations = parsed.data.bookingShowDurations ?? true;
  }
  if (parsed.data.bookingAvailableDays !== undefined) {
    updates.bookingAvailableDays = JSON.stringify(parsed.data.bookingAvailableDays ?? []);
  }
  if (parsed.data.bookingAvailableStartTime !== undefined) {
    updates.bookingAvailableStartTime = parsed.data.bookingAvailableStartTime ?? null;
  }
  if (parsed.data.bookingAvailableEndTime !== undefined) {
    updates.bookingAvailableEndTime = parsed.data.bookingAvailableEndTime ?? null;
  }
  if (parsed.data.bookingBlackoutDates !== undefined) {
    updates.bookingBlackoutDates = JSON.stringify(parsed.data.bookingBlackoutDates ?? []);
  }
  if (parsed.data.bookingSlotIntervalMinutes !== undefined) {
    updates.bookingSlotIntervalMinutes = parsed.data.bookingSlotIntervalMinutes ?? 15;
  }
  if (parsed.data.bookingBufferMinutes !== undefined) {
    updates.bookingBufferMinutes = parsed.data.bookingBufferMinutes ?? null;
  }
  if (parsed.data.bookingCapacityPerSlot !== undefined) {
    updates.bookingCapacityPerSlot = parsed.data.bookingCapacityPerSlot ?? null;
  }
  if (parsed.data.monthlyRevenueGoal !== undefined) {
    updates.monthlyRevenueGoal =
      parsed.data.monthlyRevenueGoal != null ? String(parsed.data.monthlyRevenueGoal) : null;
  }
  if (parsed.data.monthlyJobsGoal !== undefined) {
    updates.monthlyJobsGoal = parsed.data.monthlyJobsGoal ?? null;
  }
  if (parsed.data.integrationWebhookEnabled !== undefined) {
    updates.integrationWebhookEnabled = parsed.data.integrationWebhookEnabled ?? false;
  }
  if (parsed.data.integrationWebhookUrl !== undefined) {
    updates.integrationWebhookUrl = parsed.data.integrationWebhookUrl ?? null;
  }
  if (parsed.data.integrationWebhookSecret !== undefined) {
    updates.integrationWebhookSecret = normalizeBusinessWebhookSecretForStorage(parsed.data.integrationWebhookSecret);
  }
  if (parsed.data.integrationWebhookEvents !== undefined) {
    updates.integrationWebhookEvents = JSON.stringify(parsed.data.integrationWebhookEvents ?? []);
  }
  const nextReviewAutomationEnabled =
    parsed.data.automationReviewRequestsEnabled ?? existing.automationReviewRequestsEnabled ?? false;
  const nextAutomationWindowStart =
    parsed.data.automationSendWindowStartHour ?? existing.automationSendWindowStartHour ?? 8;
  const nextAutomationWindowEnd =
    parsed.data.automationSendWindowEndHour ?? existing.automationSendWindowEndHour ?? 18;
  if (nextAutomationWindowStart === nextAutomationWindowEnd) {
    throw new BadRequestError("Automation send window start and end hours cannot be the same.");
  }
  const nextReviewRequestUrl =
    parsed.data.reviewRequestUrl !== undefined
      ? parsed.data.reviewRequestUrl?.trim() || null
      : existing.reviewRequestUrl ?? null;
  if (nextReviewAutomationEnabled && !nextReviewRequestUrl) {
    throw new BadRequestError("Add a review link before enabling review request automations.");
  }
  const nextLapsedAutomationEnabled =
    parsed.data.automationLapsedClientsEnabled ?? existing.automationLapsedClientsEnabled ?? false;
  const nextBookingRequestUrl =
    parsed.data.bookingRequestUrl !== undefined
      ? parsed.data.bookingRequestUrl?.trim() || null
      : existing.bookingRequestUrl ?? null;
  if (nextLapsedAutomationEnabled && !nextBookingRequestUrl) {
    throw new BadRequestError("Add a booking link before enabling lapsed client automations.");
  }
  const nextBookingStartTime =
    parsed.data.bookingAvailableStartTime !== undefined
      ? parsed.data.bookingAvailableStartTime ?? null
      : existing.bookingAvailableStartTime ?? null;
  const nextBookingEndTime =
    parsed.data.bookingAvailableEndTime !== undefined
      ? parsed.data.bookingAvailableEndTime ?? null
      : existing.bookingAvailableEndTime ?? null;
  if (
    nextBookingStartTime &&
    nextBookingEndTime &&
    parseTimeToMinutes(nextBookingStartTime) != null &&
    parseTimeToMinutes(nextBookingEndTime) != null &&
    parseTimeToMinutes(nextBookingStartTime) === parseTimeToMinutes(nextBookingEndTime)
  ) {
    throw new BadRequestError("Booking start and end times cannot be the same.");
  }
  const nextWebhookEnabled = parsed.data.integrationWebhookEnabled ?? existing.integrationWebhookEnabled ?? false;
  const nextWebhookUrl =
    parsed.data.integrationWebhookUrl !== undefined
      ? parsed.data.integrationWebhookUrl?.trim() || null
      : existing.integrationWebhookUrl ?? null;
  if (nextWebhookEnabled && !nextWebhookUrl) {
    throw new BadRequestError("Add a webhook endpoint URL before enabling signed webhooks.");
  }

  let updated: BusinessRecord | undefined;
  try {
    [updated] = await db
      .update(businesses)
      .set(updates)
      .where(eq(businesses.id, req.params.id))
      .returning();
  } catch (error) {
    if (!isBusinessSchemaDriftError(error)) throw error;
    try {
      await ensureBusinessAutomationColumns();
      [updated] = await db
        .update(businesses)
        .set(updates)
        .where(eq(businesses.id, req.params.id))
        .returning();
    } catch (repairError) {
      if (!isBusinessSchemaDriftError(repairError)) throw repairError;
    }
    if (!updated) {
      warnOnce("businesses:update:schema", "business update falling back without full schema", {
        businessId: req.params.id,
        userId: req.userId,
        error: error instanceof Error ? error.message : String(error),
      });
      const legacyUpdates: Record<string, unknown> = {};
      if (parsed.data.name !== undefined) legacyUpdates.name = parsed.data.name;
      if (parsed.data.type !== undefined) legacyUpdates.type = parsed.data.type;
      if (parsed.data.email !== undefined) legacyUpdates.email = parsed.data.email ?? null;
      if (parsed.data.phone !== undefined) legacyUpdates.phone = parsed.data.phone ?? null;
      if (parsed.data.address !== undefined) legacyUpdates.address = parsed.data.address ?? null;
      if (parsed.data.city !== undefined) legacyUpdates.city = parsed.data.city ?? null;
      if (parsed.data.state !== undefined) legacyUpdates.state = parsed.data.state ?? null;
      if (parsed.data.zip !== undefined) legacyUpdates.zip = parsed.data.zip ?? null;
      if (parsed.data.staffCount !== undefined) legacyUpdates.staffCount = parsed.data.staffCount ?? null;
      if (parsed.data.operatingHours !== undefined) legacyUpdates.operatingHours = parsed.data.operatingHours ?? null;

      const [legacyUpdated] = await db
        .update(businesses)
        .set(legacyUpdates)
        .where(eq(businesses.id, req.params.id))
        .returning({
          id: businesses.id,
          ownerId: businesses.ownerId,
          name: businesses.name,
          type: businesses.type,
          email: businesses.email,
          phone: businesses.phone,
          address: businesses.address,
          city: businesses.city,
          state: businesses.state,
          zip: businesses.zip,
          staffCount: businesses.staffCount,
          operatingHours: businesses.operatingHours,
          createdAt: businesses.createdAt,
        });
      updated = legacyUpdated ? coerceBusinessRecord(legacyUpdated) : undefined;
    } else {
      warnOnce("businesses:update:schema-repaired", "business update retried after repairing missing automation columns", {
        businessId: req.params.id,
        userId: req.userId,
      });
    }
  }
  if (!updated) throw new NotFoundError("Business not found.");

  try {
    await syncOutboundWebhookConnectionForBusiness({
      businessId: updated.id,
      webhookEnabled: updated.integrationWebhookEnabled ?? false,
      webhookUrl: updated.integrationWebhookUrl ?? null,
      webhookSecret: readBusinessWebhookSecret(updated.integrationWebhookSecret),
      webhookEvents: JSON.parse(updated.integrationWebhookEvents ?? "[]") as string[],
    });
  } catch (error) {
    warnOnce("businesses:update:webhook-sync", "business update webhook sync skipped", {
      businessId: updated.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  res.json(serializeBusiness(updated));
}));

businessesRouter.post("/:id/completeOnboarding", requireAuth, wrapAsync(async (req: Request, res: Response) => {
  const id = req.params.id;
  const b = await loadBusinessById(id);
  if (!b) throw new NotFoundError("Business not found.");
  if (!canAccessBusiness(req, b, "settings.write")) {
    throw new ForbiddenError("You do not have permission to perform this action.");
  }
  let updated: typeof businesses.$inferSelect | undefined;
  try {
    [updated] = await db
      .update(businesses)
      .set({ onboardingComplete: true, updatedAt: new Date() })
      .where(eq(businesses.id, id))
      .returning();
  } catch (error) {
    if (!isBusinessSchemaDriftError(error)) throw error;
    warnOnce(
      "businesses:complete-onboarding:schema",
      "business completeOnboarding falling back without full schema",
      {
        businessId: id,
        userId: req.userId,
        error: error instanceof Error ? error.message : String(error),
      }
    );
    updated = {
      ...b,
      onboardingComplete: true,
      updatedAt: new Date(),
    };
  }
  if (!updated) throw new NotFoundError("Business not found.");

  await ensureBusinessTrialSubscription({
    businessId: id,
    triggeredByUserId: req.userId ?? null,
    allowPendingFailure: true,
  });

  const refreshed = await loadBusinessById(id);
  res.json(serializeBusiness(refreshed ?? updated));
}));

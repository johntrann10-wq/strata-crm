import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  appointmentServices,
  appointments,
  bookingDrafts,
  bookingRequests,
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
import { requireTenant } from "../middleware/tenant.js";
import { randomUUID } from "crypto";
import { getBusinessTypeDefaults } from "../lib/businessTypeDefaults.js";
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
import { buildLeadNotes, parseLeadRecord, updateLeadNotesStatus } from "../lib/leads.js";
import { safeCreateNotification, upsertAppointmentSourceLink } from "../lib/notifications.js";
import { enqueueTwilioTemplateSms } from "../lib/twilio.js";
import { isEmailConfigured, isStripeConfigured } from "../lib/env.js";
import {
  sendAppointmentConfirmation,
  sendBookingRequestCustomerUpdate,
  sendBookingRequestOwnerUpdate,
  sendBookingRequestOwnerAlert,
  sendBookingRequestReceived,
  sendLeadAutoResponse,
  sendLeadFollowUpAlert,
} from "../lib/email.js";
import { ensureBusinessTrialSubscription } from "../lib/billingLifecycle.js";
import { hasFullBillingAccess } from "../lib/billingAccess.js";
import {
  addDaysInTimeZone,
  buildSlotsForDate,
  formatDateKeyInTimeZone,
  normalizeBookingDayIndexes,
  normalizeBookingDailyHours,
  normalizeBookingServiceMode,
  parseBookingDailyHours,
  parseDateKeyInTimeZone,
  parseOperatingHours,
  parseTimeToMinutes,
  resolveCustomerBookingMode,
  resolveBookingFlow,
  startOfDayInTimeZone,
  toBookingBufferMinutes,
  toBookingDurationMinutes,
  toBookingLeadTimeHours,
  toBookingWindowDays,
  type BookingDailyHoursEntry,
  type BookingDefaultFlow,
} from "../lib/booking.js";
import {
  DEFAULT_BOOKING_REQUEST_ALTERNATE_OFFER_EXPIRY_HOURS,
  DEFAULT_BOOKING_REQUEST_ALTERNATE_SLOT_LIMIT,
  normalizeBookingRequestAllowAlternateSlots,
  normalizeBookingRequestAllowFlexibility,
  normalizeBookingRequestAllowTimeWindows,
  normalizeBookingRequestAlternateOfferExpiryHours,
  normalizeBookingRequestAlternateSlotLimit,
  normalizeBookingRequestRequireExactTime,
} from "../lib/bookingRequestSettings.js";
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
import {
  buildPublicBookingBrandLogoUrl,
  bookingBrandLogoBackgroundPlates,
  bookingBrandLogoFitModes,
  parseBookingBrandLogoTransform,
  resolveBookingBrandLogoPlateStyles,
  serializeBookingBrandLogoTransform,
  type BookingBrandLogoTransform,
} from "../lib/bookingBranding.js";
import {
  buildPublicBookingRequestUrl,
  createBookingRequestToken,
  verifyCurrentBookingRequestToken,
} from "../lib/bookingRequestAccess.js";
import {
  bookingRequestCustomerResponseStatuses,
  bookingRequestFlexibilityValues,
  bookingRequestOwnerReviewStatuses,
  bookingRequestStatuses,
  expireBookingRequestAlternateSlotOptions,
  hasLiveAlternateSlotOptions,
  normalizeBookingRequestCustomerResponseStatus,
  normalizeBookingRequestFlexibility,
  normalizeBookingRequestOwnerReviewStatus,
  normalizeBookingRequestStatus,
  parseBookingRequestAlternateSlotOptions,
  serializeBookingRequestAlternateSlotOptions,
  type BookingRequestAlternateSlot,
  type BookingRequestCustomerResponseStatus,
  type BookingRequestFlexibility,
  type BookingRequestOwnerReviewStatus,
  type BookingRequestStatus,
} from "../lib/bookingRequests.js";

export const businessesRouter = Router({ mergeParams: true });
type BusinessRecord = typeof businesses.$inferSelect;

const bookingBrandLogoDataUrlPattern =
  /^data:image\/(?:png|jpeg|jpg|webp|gif|svg\+xml)(?:;charset=[^;,]+)?;base64,[a-z0-9+/=]+$/i;

function isValidBookingBrandLogoUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (bookingBrandLogoDataUrlPattern.test(trimmed)) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

const bookingBrandLogoSchema = z
  .string()
  .max(400_000)
  .refine((value) => isValidBookingBrandLogoUrl(value), "Logo must be an uploaded image or valid URL.")
  .nullable()
  .optional();

const bookingBrandLogoTransformSchema = z
  .object({
    version: z.literal(1).optional(),
    fitMode: z.enum(bookingBrandLogoFitModes).optional(),
    backgroundPlate: z.enum(bookingBrandLogoBackgroundPlates).optional(),
    rotationDeg: z.number().min(-180).max(180).optional(),
    zoom: z.number().min(1).max(4).optional(),
    offsetX: z.number().min(-2).max(2).optional(),
    offsetY: z.number().min(-2).max(2).optional(),
  })
  .nullable()
  .optional();

const bookingDailyHoursSchema = z
  .array(
    z.object({
      dayIndex: z.number().int().min(0).max(6),
      enabled: z.boolean(),
      openTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
      closeTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
    })
  )
  .max(7)
  .optional();

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
  bookingRequestRequireExactTime: z.boolean().optional(),
  bookingRequestAllowTimeWindows: z.boolean().optional(),
  bookingRequestAllowFlexibility: z.boolean().optional(),
  bookingRequestAllowAlternateSlots: z.boolean().optional(),
  bookingRequestAlternateSlotLimit: z.number().int().min(1).max(3).optional(),
  bookingRequestAlternateOfferExpiryHours: z.number().int().min(1).max(168).nullable().optional(),
  bookingRequestConfirmationCopy: z.string().max(360).nullable().optional(),
  bookingRequestOwnerResponsePageCopy: z.string().max(360).nullable().optional(),
  bookingRequestAlternateAcceptanceCopy: z.string().max(360).nullable().optional(),
  bookingRequestChooseAnotherDayCopy: z.string().max(360).nullable().optional(),
  bookingTrustBulletPrimary: z.string().max(80).nullable().optional(),
  bookingTrustBulletSecondary: z.string().max(80).nullable().optional(),
  bookingTrustBulletTertiary: z.string().max(80).nullable().optional(),
  bookingNotesPrompt: z.string().max(160).nullable().optional(),
  bookingBrandLogoUrl: bookingBrandLogoSchema,
  bookingBrandLogoTransform: bookingBrandLogoTransformSchema,
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
  bookingDailyHours: bookingDailyHoursSchema,
  bookingBlackoutDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(90).optional(),
  bookingSlotIntervalMinutes: z.number().int().min(15).max(120).optional(),
  bookingBufferMinutes: z.number().int().min(0).max(240).nullable().optional(),
  bookingCapacityPerSlot: z.number().int().min(1).max(12).nullable().optional(),
  bookingUrgencyEnabled: z.boolean().optional(),
  bookingUrgencyText: z.string().max(160).nullable().optional(),
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
  locationId: z.string().uuid().optional().or(z.literal("")),
  serviceMode: z.enum(["in_shop", "mobile"]).optional(),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Select a valid date.").optional().or(z.literal("")),
  startTime: z.string().datetime().optional(),
  requestedTimeEnd: z.string().datetime().optional().or(z.literal("")),
  requestedTimeLabel: z.string().trim().max(80).optional().or(z.literal("")),
  flexibility: z.enum(bookingRequestFlexibilityValues).optional(),
  customerTimezone: z.string().trim().max(120).optional().or(z.literal("")),
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

const publicBookingRequestViewLimiter = createRateLimiter({
  id: "public_booking_request_view",
  windowMs: 5 * 60 * 1000,
  max: 60,
  message: "Please refresh the request in a moment.",
});

const publicBookingRequestRespondLimiter = createRateLimiter({
  id: "public_booking_request_respond",
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Please wait a moment before responding again.",
});

const publicBookingDraftParamsSchema = z.object({
  id: z.string().uuid("Invalid business id."),
  resumeToken: z.string().trim().min(16, "Invalid draft token.").max(255),
});

const bookingRequestParamsSchema = z.object({
  id: z.string().uuid("Invalid business id."),
  requestId: z.string().uuid("Invalid booking request."),
});

const bookingRequestTokenQuerySchema = z.object({
  token: z.string().trim().min(16, "Missing request token.").max(4096),
});

const publicBookingDraftSaveSchema = z.object({
  resumeToken: z.string().trim().min(16).max(255).optional(),
  serviceId: z.string().uuid("Select a valid service."),
  addonServiceIds: z.array(z.string().uuid()).optional(),
  serviceMode: z.enum(["in_shop", "mobile"]).optional(),
  locationId: z.string().uuid().optional().or(z.literal("")),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  startTime: z.string().datetime().optional().or(z.literal("")),
  requestedTimeEnd: z.string().datetime().optional().or(z.literal("")),
  requestedTimeLabel: z.string().trim().max(80).optional().or(z.literal("")),
  flexibility: z.enum(bookingRequestFlexibilityValues).optional(),
  customerTimezone: z.string().trim().max(120).optional().or(z.literal("")),
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

const bookingRequestApproveSchema = z.object({
  message: z.string().trim().max(2000).optional().or(z.literal("")),
});

const bookingRequestProposeAlternatesSchema = z.object({
  message: z.string().trim().max(2000).optional().or(z.literal("")),
  expiresInHours: z.number().int().min(1).max(168).optional(),
  options: z
    .array(
      z.object({
        startTime: z.string().datetime(),
        endTime: z.string().datetime().optional().or(z.literal("")),
        label: z.string().trim().max(120).optional().or(z.literal("")),
      })
    )
    .min(1)
    .max(6),
});

const bookingRequestAskNewTimeSchema = z.object({
  message: z.string().trim().min(1, "Add a message so the customer knows what to do next.").max(2000),
  expiresInHours: z.number().int().min(1).max(336).optional(),
});

const bookingRequestDeclineSchema = z.object({
  message: z.string().trim().max(2000).optional().or(z.literal("")),
});

const bookingRequestAvailabilityHintsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
});

const publicBookingRequestRespondSchema = z.object({
  action: z.enum(["accept_alternate", "request_new_time", "decline"]),
  alternateSlotId: z.string().trim().max(120).optional().or(z.literal("")),
  requestedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  requestedTimeStart: z.string().datetime().optional().or(z.literal("")),
  requestedTimeEnd: z.string().datetime().optional().or(z.literal("")),
  requestedTimeLabel: z.string().trim().max(120).optional().or(z.literal("")),
  flexibility: z.enum(bookingRequestFlexibilityValues).optional(),
  customerTimezone: z.string().trim().max(120).optional().or(z.literal("")),
  message: z.string().trim().max(2000).optional().or(z.literal("")),
});

const publicLeadConfigLimiter = createRateLimiter({
  id: "public_lead_config",
  windowMs: 60 * 1000,
  max: 60,
  message: "Please try again shortly.",
});

const publicShareMetadataLimiter = createRateLimiter({
  id: "public_share_metadata",
  windowMs: 60 * 1000,
  max: 120,
  message: "Please try again shortly.",
});

const publicBrandImageLimiter = createRateLimiter({
  id: "public_brand_image",
  windowMs: 60 * 1000,
  max: 180,
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
        bookingBrandLogoUrl: businesses.bookingBrandLogoUrl,
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

function cleanOptionalText(value: string | null | undefined): string | null {
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

function normalizeRequestCopy(
  value: string | null | undefined,
  fallback: string | null = null,
): string | null {
  return cleanOptionalText(value ?? undefined) ?? fallback;
}

function resolveBusinessBookingRequestSettings(
  business: Pick<
    BusinessRecord,
    | "bookingRequestRequireExactTime"
    | "bookingRequestAllowTimeWindows"
    | "bookingRequestAllowFlexibility"
    | "bookingRequestAllowAlternateSlots"
    | "bookingRequestAlternateSlotLimit"
    | "bookingRequestAlternateOfferExpiryHours"
  > &
    Partial<
      Pick<
        BusinessRecord,
        | "bookingRequestConfirmationCopy"
        | "bookingRequestOwnerResponsePageCopy"
        | "bookingRequestAlternateAcceptanceCopy"
        | "bookingRequestChooseAnotherDayCopy"
      >
    >
) {
  const requireExactTime = normalizeBookingRequestRequireExactTime(business.bookingRequestRequireExactTime);
  const allowTimeWindows = requireExactTime
    ? false
    : normalizeBookingRequestAllowTimeWindows(business.bookingRequestAllowTimeWindows);

  return {
    requireExactTime,
    allowTimeWindows,
    allowFlexibility: normalizeBookingRequestAllowFlexibility(business.bookingRequestAllowFlexibility),
    allowAlternateSlots: normalizeBookingRequestAllowAlternateSlots(business.bookingRequestAllowAlternateSlots),
    alternateSlotLimit: normalizeBookingRequestAlternateSlotLimit(business.bookingRequestAlternateSlotLimit),
    alternateOfferExpiryHours: normalizeBookingRequestAlternateOfferExpiryHours(
      business.bookingRequestAlternateOfferExpiryHours
    ),
    confirmationCopy: normalizeRequestCopy(business.bookingRequestConfirmationCopy),
    ownerResponsePageCopy: normalizeRequestCopy(business.bookingRequestOwnerResponsePageCopy),
    alternateAcceptanceCopy: normalizeRequestCopy(business.bookingRequestAlternateAcceptanceCopy),
    chooseAnotherDayCopy: normalizeRequestCopy(business.bookingRequestChooseAnotherDayCopy),
  };
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

function serializeBookingDailyHoursForStorage(value: unknown): string | null {
  const normalized = normalizeBookingDailyHours(value);
  return normalized.length > 0 ? JSON.stringify(normalized) : null;
}

function assertBookingDailyHoursValid(value: unknown): void {
  if (!Array.isArray(value)) return;
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const entry = item as { enabled?: unknown; openTime?: unknown; closeTime?: unknown };
    if (entry.enabled !== true) continue;
    const openMinutes = typeof entry.openTime === "string" ? parseTimeToMinutes(entry.openTime) : null;
    const closeMinutes = typeof entry.closeTime === "string" ? parseTimeToMinutes(entry.closeTime) : null;
    if (openMinutes == null || closeMinutes == null || closeMinutes <= openMinutes) {
      throw new BadRequestError("Each enabled booking day needs an opening time before its closing time.");
    }
  }
}

type BookingDraftRecord = typeof bookingDrafts.$inferSelect;
type BookingRequestRecord = typeof bookingRequests.$inferSelect;
type BookingRequestAlternateSlotInput = {
  startTime: Date;
  endTime: Date;
  label: string;
  expiresAt: Date | null;
};

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
  requestedTimeEnd?: string | null;
  requestedTimeLabel?: string | null;
  flexibility?: string | null;
  customerTimezone?: string | null;
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
    requestedTimeEnd: input.requestedTimeEnd ?? "",
    requestedTimeLabel: input.requestedTimeLabel ?? "",
    flexibility: input.flexibility ?? "same_day_flexible",
    customerTimezone: input.customerTimezone ?? "",
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
      requestedTimeEnd: draft.requestedTimeEnd ? draft.requestedTimeEnd.toISOString() : "",
      requestedTimeLabel: draft.requestedTimeLabel ?? "",
      flexibility: normalizeBookingRequestFlexibility(draft.flexibility),
      customerTimezone: draft.customerTimezone ?? "",
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

function isBookingRequestSchemaDriftError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown; cause?: unknown };
  const cause =
    candidate.cause && typeof candidate.cause === "object"
      ? (candidate.cause as { code?: unknown; message?: unknown })
      : candidate;
  const code = String(cause.code ?? "");
  const message = String(cause.message ?? "").toLowerCase();
  return code === "42P01" || code === "42703" || message.includes("booking_requests");
}

function parseOptionalDateTime(value: string | null | undefined, message: string): Date | null {
  const normalized = cleanOptionalText(value ?? undefined);
  if (!normalized) return null;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestError(message);
  }
  return parsed;
}

function formatBookingRequestAlternateSlotLabel(params: {
  startTime: Date;
  endTime: Date | null;
  timeZone: string;
  providedLabel?: string | null;
}) {
  const custom = cleanOptionalText(params.providedLabel ?? undefined);
  if (custom) return custom;
  const startLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: params.timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(params.startTime);
  if (!params.endTime) return startLabel;
  const endLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: params.timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(params.endTime);
  return `${startLabel} - ${endLabel}`;
}

function buildBookingRequestTimingSummary(params: {
  requestedDate?: string | null;
  requestedTimeStart?: Date | null;
  requestedTimeEnd?: Date | null;
  requestedTimeLabel?: string | null;
  timeZone: string;
}) {
  const requestedDate = cleanOptionalText(params.requestedDate ?? undefined);
  const requestedTimeLabel = cleanOptionalText(params.requestedTimeLabel ?? undefined);
  const requestedTimeStart = params.requestedTimeStart ?? null;
  const requestedTimeEnd = params.requestedTimeEnd ?? null;

  if (requestedTimeStart) {
    return formatBookingRequestAlternateSlotLabel({
      startTime: requestedTimeStart,
      endTime: requestedTimeEnd,
      timeZone: params.timeZone,
      providedLabel: requestedTimeLabel,
    });
  }
  if (requestedDate && requestedTimeLabel) {
    const date = parsePublicBookingDate(requestedDate, params.timeZone);
    return `${new Intl.DateTimeFormat("en-US", {
      timeZone: params.timeZone,
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(date)} - ${requestedTimeLabel}`;
  }
  if (requestedDate) {
    const date = parsePublicBookingDate(requestedDate, params.timeZone);
    return new Intl.DateTimeFormat("en-US", {
      timeZone: params.timeZone,
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(date);
  }
  return requestedTimeLabel || null;
}

function formatBookingRequestFlexibilityLabel(value: string | null | undefined) {
  const normalized = normalizeBookingRequestFlexibility(value);
  switch (normalized) {
    case "exact_time_only":
      return "Exact time only";
    case "any_nearby_slot":
      return "Any nearby slot";
    default:
      return "Same day flexible";
  }
}

function toBookingRequestAlternateSlots(
  options: BookingRequestAlternateSlotInput[],
  timezone: string
): BookingRequestAlternateSlot[] {
  return options.map((option) => ({
    id: randomUUID(),
    startTime: option.startTime.toISOString(),
    endTime: option.endTime.toISOString(),
    label: formatBookingRequestAlternateSlotLabel({
      startTime: option.startTime,
      endTime: option.endTime,
      timeZone: timezone,
      providedLabel: option.label,
    }),
    expiresAt: option.expiresAt ? option.expiresAt.toISOString() : null,
    status: "proposed",
  }));
}

function buildBookingRequestPublicAccess(request: Pick<BookingRequestRecord, "id" | "businessId" | "publicTokenVersion">) {
  const token = createBookingRequestToken({
    requestId: request.id,
    businessId: request.businessId,
    tokenVersion: request.publicTokenVersion ?? 1,
  });
  return {
    publicToken: token,
    publicResponseUrl: buildPublicBookingRequestUrl({
      businessId: request.businessId,
      requestId: request.id,
      token,
    }),
  };
}

function buildOwnerBookingRequestAppUrl(requestId: string) {
  return buildPublicAppUrl(`/appointments/requests?request=${encodeURIComponent(requestId)}`);
}

function buildOwnerAppointmentAppUrl(appointmentId: string) {
  return buildPublicAppUrl(`/appointments/${encodeURIComponent(appointmentId)}`);
}

function buildBookingRequestAlternateOptionsSummary(options: BookingRequestAlternateSlot[]) {
  if (!options.length) return "";
  return options.map((option, index) => `${index + 1}. ${option.label}`).join("\n");
}

async function notifyCustomerAboutBookingRequestUpdate(params: {
  business: Pick<BusinessRecord, "id" | "name" | "timezone">;
  request: Pick<
    BookingRequestRecord,
    | "id"
    | "clientEmail"
    | "clientPhone"
    | "clientFirstName"
    | "clientLastName"
    | "serviceSummary"
    | "vehicleYear"
    | "vehicleMake"
    | "vehicleModel"
  >;
  requestedTiming: string | null;
  subjectLine: string;
  eyebrow: string;
  title: string;
  intro: string;
  ownerMessage?: string | null;
  alternateOptions?: BookingRequestAlternateSlot[];
  alternateOptionsText?: string | null;
  expiresAt?: Date | null;
  expiresAtText?: string | null;
  nextSteps: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  sendEmail?: boolean;
  sendSms?: boolean;
  smsEntityKey?: string;
}) {
  const clientName = `${params.request.clientFirstName ?? ""} ${params.request.clientLastName ?? ""}`.trim() || "Customer";
  const serviceSummary = params.request.serviceSummary;
  const vehicle = buildVehicleSummary({
    year: params.request.vehicleYear ?? null,
    make: params.request.vehicleMake ?? null,
    model: params.request.vehicleModel ?? null,
  });
  const ownerMessage = cleanOptionalText(params.ownerMessage) ?? "The shop sent an update on your request.";
  const alternateOptionsFromText = cleanOptionalText(params.alternateOptionsText);
  const alternateOptionsFromSlots = buildBookingRequestAlternateOptionsSummary(params.alternateOptions ?? []);
  const alternateOptions =
    alternateOptionsFromText ??
    (alternateOptionsFromSlots || "No alternate times were included in this update.");
  const expiresAt =
    cleanOptionalText(params.expiresAtText) ??
    (params.expiresAt ? formatBookingDateTime(params.expiresAt, params.business.timezone) : "No set deadline");
  const ctaLabel = cleanOptionalText(params.ctaLabel) ?? "Review request";
  const ctaUrl = cleanOptionalText(params.ctaUrl) ?? null;
  const shouldSendEmail = params.sendEmail ?? true;
  const shouldSendSms = params.sendSms ?? false;

  if (shouldSendEmail && params.request.clientEmail && isEmailConfigured()) {
    await sendBookingRequestCustomerUpdate({
      to: params.request.clientEmail,
      businessId: params.business.id,
      businessName: params.business.name,
      clientName,
      subjectLine: params.subjectLine,
      eyebrow: params.eyebrow,
      title: params.title,
      intro: params.intro,
      requestedTiming: params.requestedTiming,
      serviceSummary,
      vehicle,
      ownerMessage,
      alternateOptions,
      expiresAt,
      nextSteps: params.nextSteps,
      ctaLabel,
      ctaUrl,
    });
  }

  if (shouldSendSms && params.request.clientPhone) {
    await enqueueTwilioTemplateSms({
      businessId: params.business.id,
      templateSlug: "booking_request_customer_update",
      to: params.request.clientPhone,
      vars: {
        subjectLine: params.subjectLine,
        businessName: params.business.name,
        eyebrow: params.eyebrow,
        title: params.title,
        intro: params.intro,
        clientName,
        requestedTiming: cleanOptionalText(params.requestedTiming) ?? "-",
        serviceSummary: serviceSummary ?? "-",
        vehicle: vehicle ?? "-",
        ownerMessage,
        alternateOptions,
        expiresAt,
        nextSteps: params.nextSteps,
        ctaLabel,
        ctaUrl: ctaUrl ?? "",
      },
      entityType: "booking_request_update",
      entityId: `${params.request.id}:${params.smsEntityKey ?? "update"}`,
    });
  }
}

async function notifyCustomerAboutSubmittedBookingRequest(params: {
  business: Pick<
    BusinessRecord,
    | "id"
    | "name"
    | "bookingRequestConfirmationCopy"
    | "bookingConfirmationMessage"
    | "leadAutoResponseEnabled"
    | "leadAutoResponseEmailEnabled"
    | "leadAutoResponseSmsEnabled"
  >;
  request: Pick<
    BookingRequestRecord,
    | "id"
    | "clientEmail"
    | "clientPhone"
    | "clientFirstName"
    | "clientLastName"
    | "serviceSummary"
    | "vehicleYear"
    | "vehicleMake"
    | "vehicleModel"
  >;
  requestedTiming: string | null;
  publicResponseUrl: string;
}) {
  const sendEmail =
    (params.business.leadAutoResponseEnabled ?? true) && (params.business.leadAutoResponseEmailEnabled ?? true);
  const sendSms =
    (params.business.leadAutoResponseEnabled ?? true) && (params.business.leadAutoResponseSmsEnabled ?? false);
  if (!sendEmail && !sendSms) return;

  const clientName = `${params.request.clientFirstName ?? ""} ${params.request.clientLastName ?? ""}`.trim() || "Customer";
  const vehicle = buildVehicleSummary({
    year: params.request.vehicleYear ?? null,
    make: params.request.vehicleMake ?? null,
    model: params.request.vehicleModel ?? null,
  });
  const message =
    cleanOptionalText(params.business.bookingRequestConfirmationCopy) ??
    cleanOptionalText(params.business.bookingConfirmationMessage) ??
    "The shop has your request and will review the timing before confirming it or sending alternate options.";
  const nextSteps =
    "You do not need to start over. The shop will review your requested time and follow up with a confirmation or alternate options if needed.";

  if (sendEmail && params.request.clientEmail && isEmailConfigured()) {
    await sendBookingRequestReceived({
      to: params.request.clientEmail,
      businessId: params.business.id,
      clientName,
      businessName: params.business.name,
      requestedTiming: params.requestedTiming,
      serviceSummary: params.request.serviceSummary,
      vehicle,
      message,
      nextSteps,
      ctaLabel: "View request",
      ctaUrl: params.publicResponseUrl,
    });
  }

  if (sendSms && params.request.clientPhone) {
    await enqueueTwilioTemplateSms({
      businessId: params.business.id,
      templateSlug: "booking_request_received",
      to: params.request.clientPhone,
      vars: {
        clientName,
        businessName: params.business.name,
        requestedTiming: cleanOptionalText(params.requestedTiming) ?? "-",
        serviceSummary: params.request.serviceSummary ?? "-",
        vehicle: vehicle ?? "-",
        message,
        nextSteps,
        ctaLabel: "View request",
        ctaUrl: params.publicResponseUrl,
      },
      entityType: "booking_request_received",
      entityId: params.request.id,
    });
  }
}

async function notifyOwnerAboutBookingRequestConfirmed(params: {
  business: Pick<BusinessRecord, "id" | "name" | "email" | "timezone">;
  request: Pick<
    BookingRequestRecord,
    | "id"
    | "clientFirstName"
    | "clientLastName"
    | "serviceSummary"
    | "vehicleYear"
    | "vehicleMake"
    | "vehicleModel"
    | "requestedDate"
    | "requestedTimeStart"
    | "requestedTimeEnd"
    | "requestedTimeLabel"
    | "customerResponseMessage"
  >;
  confirmedTiming: string;
  appointmentId: string;
  requestUrl?: string | null;
}) {
  const ownerRecipient = cleanOptionalText(params.business.email ?? undefined);
  if (!ownerRecipient || !isEmailConfigured()) return;

  const requestedTiming = buildBookingRequestTimingSummary({
    requestedDate: params.request.requestedDate,
    requestedTimeStart: params.request.requestedTimeStart,
    requestedTimeEnd: params.request.requestedTimeEnd,
    requestedTimeLabel: params.request.requestedTimeLabel,
    timeZone: params.business.timezone ?? "America/Los_Angeles",
  });
  const clientName = [params.request.clientFirstName, params.request.clientLastName].filter(Boolean).join(" ").trim() || "Customer";

  await sendBookingRequestOwnerUpdate({
    to: ownerRecipient,
    businessId: params.business.id,
    subjectLine: `Booking request confirmed - ${params.business.name}`,
    businessName: params.business.name,
    ownerName: "Team",
    eyebrow: "Request confirmed",
    title: "A customer accepted an alternate time",
    intro: `${clientName} confirmed ${params.confirmedTiming}. The appointment is ready in Strata.`,
    clientName,
    confirmedTiming: params.confirmedTiming,
    requestedTiming,
    serviceSummary: params.request.serviceSummary,
    vehicle: buildVehicleSummary({
      year: params.request.vehicleYear,
      make: params.request.vehicleMake,
      model: params.request.vehicleModel,
    }),
    customerMessage: cleanOptionalText(params.request.customerResponseMessage) ?? "No extra message from the customer.",
    ctaLabel: "Open appointment",
    ctaUrl: buildOwnerAppointmentAppUrl(params.appointmentId) || params.requestUrl || buildOwnerBookingRequestAppUrl(params.request.id),
  });
}

async function findBookingRequestById(params: { businessId: string; requestId: string }) {
  const [request] = await db
    .select()
    .from(bookingRequests)
    .where(and(eq(bookingRequests.businessId, params.businessId), eq(bookingRequests.id, params.requestId)))
    .limit(1);
  return request ?? null;
}

async function syncExpiredBookingRequestState(request: BookingRequestRecord) {
  if (request.status === "confirmed" || request.status === "declined" || request.status === "expired") {
    return request;
  }

  const options = parseBookingRequestAlternateSlotOptions(request.alternateSlotOptions);
  const nextOptions = expireBookingRequestAlternateSlotOptions(options);
  const optionsChanged =
    serializeBookingRequestAlternateSlotOptions(nextOptions) !== serializeBookingRequestAlternateSlotOptions(options);
  const expiresAtMs = request.expiresAt ? request.expiresAt.getTime() : Number.NaN;
  const canExpire =
    request.status === "awaiting_customer_selection" || request.status === "customer_requested_new_time";
  const isExpired = canExpire && Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now();

  if (!optionsChanged && !isExpired) return request;

  const nextStatus =
    request.status === "awaiting_customer_selection" && options.length > 0 && !hasLiveAlternateSlotOptions(nextOptions)
      ? ("expired" as BookingRequestStatus)
      : isExpired
        ? ("expired" as BookingRequestStatus)
        : normalizeBookingRequestStatus(request.status);
  const nextCustomerResponseStatus = isExpired
    ? ("expired" as BookingRequestCustomerResponseStatus)
    : normalizeBookingRequestCustomerResponseStatus(request.customerResponseStatus);

  const [updated] = await db
    .update(bookingRequests)
    .set({
      status: nextStatus,
      customerResponseStatus: nextCustomerResponseStatus,
      alternateSlotOptions: serializeBookingRequestAlternateSlotOptions(nextOptions),
      expiredAt: isExpired ? request.expiredAt ?? new Date() : request.expiredAt,
      updatedAt: new Date(),
    })
    .where(eq(bookingRequests.id, request.id))
    .returning();

  if (updated && isExpired) {
    await createActivityLog({
      businessId: request.businessId,
      action: "booking.request_expired",
      entityType: "booking_request",
      entityId: request.id,
      metadata: {
        previousStatus: request.status,
      },
    });
  }

  return updated ?? request;
}

function resolveBookingSchedule(business: {
  operatingHours?: string | null;
  bookingAvailableDays?: string | null;
  bookingAvailableStartTime?: string | null;
  bookingAvailableEndTime?: string | null;
  bookingDailyHours?: string | null;
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
    dailyHours: parseBookingDailyHours(business.bookingDailyHours),
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

function parsePublicBookingDate(value: string, timezone: string): Date {
  try {
    return parseDateKeyInTimeZone(value, timezone);
  } catch {
    throw new BadRequestError("Select a valid booking date.");
  }
}

function startOfLocalDay(date: Date, timezone?: string): Date {
  if (timezone) return startOfDayInTimeZone(date, timezone);
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number, timezone?: string): Date {
  if (timezone) return addDaysInTimeZone(date, timezone, days);
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toDateKey(date: Date, timezone?: string): string {
  if (timezone) return formatDateKeyInTimeZone(date, timezone);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildBookingPageTitle(business: { bookingPageTitle?: string | null; name?: string | null }): string {
  return business.bookingPageTitle?.trim() || business.name?.trim() || "The shop";
}

function normalizeBookingBrandLogoUrl(value: string | null | undefined) {
  return cleanOptionalText(value ?? undefined);
}

function buildBookingBrandAssetVersion(updatedAt: Date | null | undefined): string | null {
  if (!(updatedAt instanceof Date) || Number.isNaN(updatedAt.getTime())) return null;
  return String(updatedAt.getTime());
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

function parseDataUrlImage(
  value: string
): { contentType: string; body: Buffer } | null {
  const match = value.match(
    /^data:(image\/(?:png|jpeg|jpg|webp|gif|svg\+xml))(?:;charset=[^;,]+)?;base64,([a-z0-9+/=]+)$/i
  );
  if (!match) return null;
  const contentType = match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase();
  try {
    return {
      contentType,
      body: Buffer.from(match[2], "base64"),
    };
  } catch {
    return null;
  }
}

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&#39;");
}

function resolveBookingPreviewLogoSource(
  business: Pick<BusinessRecord, "id" | "bookingBrandLogoUrl"> & { updatedAt?: Date | null }
): string | null {
  const logoUrl = normalizeBookingBrandLogoUrl(business.bookingBrandLogoUrl);
  if (!logoUrl) return null;
  return bookingBrandLogoDataUrlPattern.test(logoUrl)
    ? logoUrl
    : buildPublicBookingBrandLogoUrl(business.id, buildBookingBrandAssetVersion(business.updatedAt));
}

function renderPublicBookingPreviewSvg(
  business: Pick<
    BusinessRecord,
    | "id"
    | "name"
    | "bookingPageTitle"
    | "bookingPageSubtitle"
    | "bookingTrustBulletPrimary"
    | "bookingTrustBulletSecondary"
    | "bookingTrustBulletTertiary"
    | "bookingBrandLogoUrl"
    | "bookingBrandLogoTransform"
    | "bookingBrandPrimaryColorToken"
    | "bookingBrandAccentColorToken"
    | "bookingBrandBackgroundToneToken"
  > & { updatedAt?: Date | null }
) {
  const title = buildBookingPageTitle(business);
  const subtitle = buildBookingPageSubtitle(business);
  const transform = parseBookingBrandLogoTransform(business.bookingBrandLogoTransform);
  const logoSource = resolveBookingPreviewLogoSource(business);
  const plate = resolveBookingBrandLogoPlateStyles(transform.backgroundPlate);
  const trustPoints = [
    normalizeBookingTrustBullet(business.bookingTrustBulletPrimary, "Goes directly to the shop"),
    normalizeBookingTrustBullet(business.bookingTrustBulletSecondary, "Quick follow-up"),
    normalizeBookingTrustBullet(business.bookingTrustBulletTertiary, "Secure and simple"),
  ];

  const primary =
    normalizeBookingBrandPrimaryColorToken(business.bookingBrandPrimaryColorToken) === "sky"
      ? { solid: "#0284c7", soft: "#e0f2fe" }
      : normalizeBookingBrandPrimaryColorToken(business.bookingBrandPrimaryColorToken) === "emerald"
        ? { solid: "#059669", soft: "#d1fae5" }
        : normalizeBookingBrandPrimaryColorToken(business.bookingBrandPrimaryColorToken) === "rose"
          ? { solid: "#e11d48", soft: "#ffe4e6" }
          : normalizeBookingBrandPrimaryColorToken(business.bookingBrandPrimaryColorToken) === "slate"
            ? { solid: "#0f172a", soft: "#e2e8f0" }
            : { solid: "#ea580c", soft: "#ffedd5" };
  const accent =
    normalizeBookingBrandAccentColorToken(business.bookingBrandAccentColorToken) === "blue"
      ? "#dbeafe"
      : normalizeBookingBrandAccentColorToken(business.bookingBrandAccentColorToken) === "mint"
        ? "#d1fae5"
        : normalizeBookingBrandAccentColorToken(business.bookingBrandAccentColorToken) === "violet"
          ? "#ede9fe"
          : normalizeBookingBrandAccentColorToken(business.bookingBrandAccentColorToken) === "stone"
            ? "#f5f5f4"
            : "#fef3c7";
  const background =
    normalizeBookingBrandBackgroundToneToken(business.bookingBrandBackgroundToneToken) === "mist"
      ? { page: "#f7fbff", muted: "#ecf5ff" }
      : normalizeBookingBrandBackgroundToneToken(business.bookingBrandBackgroundToneToken) === "sand"
        ? { page: "#fcfaf6", muted: "#f5eee2" }
        : normalizeBookingBrandBackgroundToneToken(business.bookingBrandBackgroundToneToken) === "slate"
          ? { page: "#f8fafc", muted: "#eef2f7" }
          : { page: "#fffdf8", muted: "#fff3e8" };

  const frame =
    transform.fitMode === "wordmark"
      ? { x: 790, y: 110, width: 320, height: 120, radius: 30, padding: 22 }
      : transform.fitMode === "cover"
        ? { x: 770, y: 98, width: 340, height: 210, radius: 34, padding: 0 }
        : { x: 810, y: 92, width: 260, height: 260, radius: 34, padding: 20 };
  const innerX = frame.x + frame.padding;
  const innerY = frame.y + frame.padding;
  const innerWidth = frame.width - frame.padding * 2;
  const innerHeight = frame.height - frame.padding * 2;
  const centerX = innerX + innerWidth / 2;
  const centerY = innerY + innerHeight / 2;
  const translateX = Math.round(transform.offsetX * innerWidth * 0.18 * 100) / 100;
  const translateY = Math.round(transform.offsetY * innerHeight * 0.18 * 100) / 100;
  const preserveAspectRatio = transform.fitMode === "cover" ? "xMidYMid slice" : "xMidYMid meet";
  const logoMarkup = logoSource
    ? `<rect x="${frame.x}" y="${frame.y}" width="${frame.width}" height="${frame.height}" rx="${frame.radius}" fill="${plate.background}" stroke="${plate.border}" stroke-width="1.5" />
       <g clip-path="url(#logo-clip)">
         <g transform="translate(${translateX} ${translateY})">
           <g transform="rotate(${transform.rotationDeg} ${centerX} ${centerY})">
             <g transform="translate(${centerX} ${centerY}) scale(${transform.zoom}) translate(${-centerX} ${-centerY})">
                <image href="${escapeSvgText(logoSource)}" x="${innerX}" y="${innerY}" width="${innerWidth}" height="${innerHeight}" preserveAspectRatio="${preserveAspectRatio}" />
             </g>
           </g>
         </g>
       </g>`
    : `<rect x="${frame.x}" y="${frame.y}" width="${frame.width}" height="${frame.height}" rx="${frame.radius}" fill="${plate.monogramBackground}" />
       <text x="${frame.x + frame.width / 2}" y="${frame.y + frame.height / 2 + 22}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${transform.fitMode === "contain" ? 104 : 76}" font-weight="700" fill="${plate.monogramForeground}">${escapeSvgText((business.name?.trim() || "S").slice(0, 1).toUpperCase())}</text>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="630" viewBox="0 0 1200 630" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="88" y1="64" x2="1136" y2="574" gradientUnits="userSpaceOnUse">
      <stop stop-color="${background.page}" />
      <stop offset="1" stop-color="${background.muted}" />
    </linearGradient>
    <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#ffffff" stop-opacity="0.98" />
      <stop offset="1" stop-color="#ffffff" stop-opacity="0.9" />
    </linearGradient>
    ${
      logoSource
        ? `<clipPath id="logo-clip">
      <rect x="${innerX}" y="${innerY}" width="${innerWidth}" height="${innerHeight}" rx="${Math.max(frame.radius - frame.padding, 0)}" />
    </clipPath>`
        : ""
    }
  </defs>
  <rect width="1200" height="630" rx="40" fill="url(#bg)" />
  <circle cx="1032" cy="108" r="124" fill="${accent}" fill-opacity="0.55" />
  <circle cx="167" cy="534" r="168" fill="${primary.soft}" fill-opacity="0.72" />
  <rect x="42" y="42" width="1116" height="546" rx="34" fill="url(#panel)" stroke="rgba(226,232,240,0.92)" />
  <text x="94" y="126" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="${primary.solid}" letter-spacing="2.4">BOOK ONLINE</text>
  <text x="94" y="188" font-family="Arial, sans-serif" font-size="56" font-weight="700" fill="#0f172a">${escapeSvgText(title)}</text>
  <text x="94" y="232" font-family="Arial, sans-serif" font-size="24" font-weight="600" fill="#334155">${escapeSvgText(business.name?.trim() || "Strata shop")}</text>
  <foreignObject x="94" y="268" width="560" height="120">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: Arial, sans-serif; font-size: 24px; line-height: 1.55; color: #475569;">
      ${escapeSvgText(subtitle)}
    </div>
  </foreignObject>
  <g>
    <rect x="94" y="444" width="170" height="44" rx="22" fill="${primary.soft}" stroke="${primary.solid}" stroke-opacity="0.14" />
    <text x="179" y="472" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="#0f172a">${escapeSvgText(trustPoints[0])}</text>
    <rect x="278" y="444" width="184" height="44" rx="22" fill="#ffffff" stroke="rgba(203,213,225,0.96)" />
    <text x="370" y="472" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="#334155">${escapeSvgText(trustPoints[1])}</text>
    <rect x="476" y="444" width="198" height="44" rx="22" fill="#ffffff" stroke="rgba(203,213,225,0.96)" />
    <text x="575" y="472" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="#334155">${escapeSvgText(trustPoints[2])}</text>
  </g>
  ${logoMarkup}
  <rect x="760" y="372" width="360" height="148" rx="28" fill="#ffffff" stroke="rgba(226,232,240,0.96)" />
  <text x="790" y="420" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="#64748b" letter-spacing="1.6">CLIENT BOOKING FLOW</text>
  <text x="790" y="456" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#0f172a">Choose a service</text>
  <text x="790" y="494" font-family="Arial, sans-serif" font-size="22" font-weight="600" fill="#334155">Share your vehicle</text>
  <text x="790" y="530" font-family="Arial, sans-serif" font-size="22" font-weight="600" fill="#334155">Lock in the next step</text>
</svg>`;
}

function buildBookingPageSubtitle(business: { bookingPageSubtitle?: string | null }): string {
  return business.bookingPageSubtitle?.trim() || "Choose the service you need, share your vehicle details, and lock in the next step without the back-and-forth.";
}

function withBusinessSuffix(baseTitle: string, businessName: string | null | undefined) {
  const normalizedBusinessName = cleanOptionalText(businessName ?? undefined);
  if (!normalizedBusinessName) return baseTitle;
  const lowerBase = baseTitle.toLowerCase();
  if (lowerBase.includes(normalizedBusinessName.toLowerCase())) return baseTitle;
  return `${baseTitle} | ${normalizedBusinessName}`;
}

export type PublicShareMetadataPayload = {
  businessId: string;
  businessName: string;
  title: string;
  description: string;
  canonicalPath: string;
  imagePath: string | null;
  imageAlt: string;
};

function buildPublicBrandImagePath(businessId: string) {
  return `/api/businesses/${encodeURIComponent(businessId)}/public-brand-image`;
}

export function buildPublicBookingShareMetadataResponse(business: Pick<
  BusinessRecord,
  "id" | "name" | "bookingPageTitle" | "bookingPageSubtitle" | "bookingBrandLogoUrl"
>): PublicShareMetadataPayload {
  const businessName = business.name?.trim() || "The shop";
  return {
    businessId: business.id,
    businessName,
    title: withBusinessSuffix(buildBookingPageTitle(business), business.name),
    description: buildBookingPageSubtitle(business),
    canonicalPath: `/book/${encodeURIComponent(business.id)}`,
    imagePath: null,
    imageAlt: "Strata CRM booking preview",
  };
}

export function buildPublicLeadShareMetadataResponse(business: Pick<
  BusinessRecord,
  "id" | "name" | "bookingBrandLogoUrl"
>): PublicShareMetadataPayload {
  const businessName = business.name?.trim() || "The shop";
  return {
    businessId: business.id,
    businessName,
    title: `Request service | ${businessName}`,
    description: `Share a few details so ${businessName} can review the request and follow up with the right next step.`,
    canonicalPath: `/lead/${encodeURIComponent(business.id)}`,
    imagePath: cleanOptionalText(business.bookingBrandLogoUrl ?? undefined) ? buildPublicBrandImagePath(business.id) : null,
    imageAlt: `${businessName} logo for service requests`,
  };
}

type PublicBrandImageAsset =
  | { kind: "redirect"; url: string }
  | { kind: "inline"; contentType: string; buffer: Buffer };

const bookingBrandLogoDataUrlCapturePattern =
  /^data:(image\/(?:png|jpeg|jpg|webp|gif|svg\+xml))(?:;charset=[^;,]+)?;base64,([a-z0-9+/=]+)$/i;

export function resolvePublicBookingBrandImageAsset(
  value: string | null | undefined
): PublicBrandImageAsset | null {
  const normalized = cleanOptionalText(value ?? undefined);
  if (!normalized) return null;

  const dataMatch = normalized.match(bookingBrandLogoDataUrlCapturePattern);
  if (dataMatch) {
    const contentType = dataMatch[1]?.toLowerCase() === "image/jpg" ? "image/jpeg" : dataMatch[1]!.toLowerCase();
    return {
      kind: "inline",
      contentType,
      buffer: Buffer.from(dataMatch[2]!, "base64"),
    };
  }

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return { kind: "redirect", url: parsed.toString() };
    }
  } catch {
    return null;
  }

  return null;
}

function buildBookingUrgencyText(business: { bookingUrgencyText?: string | null }): string {
  return business.bookingUrgencyText?.trim() || "Only 3 spots left this week";
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

function hasTruthyBuilderPreviewFlag(value: unknown): boolean {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes";
  }
  if (Array.isArray(value)) {
    return value.some((entry) => hasTruthyBuilderPreviewFlag(entry));
  }
  return false;
}

export function isAuthorizedPublicBookingPreviewRequest(
  req: Request,
  business: Pick<typeof businesses.$inferSelect, "id" | "ownerId">
): boolean {
  return hasTruthyBuilderPreviewFlag(req.query.builderPreview) && canAccessBusiness(req, business, "settings.read");
}

export function hasBookablePublicServices(
  services: Array<Pick<PublicBookingServiceRecord, "active" | "isAddon" | "bookingEnabled">>
) {
  return services.some((service) => service.active !== false && service.isAddon !== true && service.bookingEnabled === true);
}

export function resolvePublicBookingEnabledState(params: {
  businessBookingEnabled: boolean | null | undefined;
  hasBookableServices: boolean;
}) {
  if (params.businessBookingEnabled === true) return true;
  if (params.businessBookingEnabled === false) return false;
  return params.hasBookableServices;
}

async function loadAccessiblePublicBookingBusiness(id: string, req?: Request) {
  const business = await loadBusinessById(id);
  if (!business) return null;
  const allowPreviewAccess = req ? isAuthorizedPublicBookingPreviewRequest(req, business) : false;
  if (!allowPreviewAccess && process.env.BILLING_ENFORCED === "true" && isStripeConfigured()) {
    if (
      !hasFullBillingAccess(business.billingAccessState) &&
      business.subscriptionStatus !== "active" &&
      business.subscriptionStatus !== "trialing"
    ) {
      return null;
    }
  }
  if (allowPreviewAccess) {
    return {
      ...business,
      bookingEnabled: true,
    };
  }
  if (business.bookingEnabled === true || business.bookingEnabled === false) return business;

  const { services: publicServices } = await listPublicBookingServices(business.id);
  const shouldEnablePublicBooking = resolvePublicBookingEnabledState({
    businessBookingEnabled: business.bookingEnabled,
    hasBookableServices: hasBookablePublicServices(publicServices),
  });
  if (!shouldEnablePublicBooking) {
    return business;
  }

  warnOnce("businesses:public-booking:inferred-enabled", "public booking inferred from service configuration for legacy business state", {
    businessId: business.id,
  });

  return {
    ...business,
    bookingEnabled: true,
  };
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
  bookingRequestRequireExactTime: boolean | null;
  bookingRequestAllowTimeWindows: boolean | null;
  bookingRequestAllowFlexibility: boolean | null;
  bookingRequestReviewMessage: string | null;
  bookingRequestAllowAlternateSlots: boolean | null;
  bookingRequestAlternateSlotLimit: number | null;
  bookingRequestAlternateOfferExpiryHours: number | null;
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

function resolvePublicBookingRequestPolicy(params: {
  business: Pick<
    BusinessRecord,
    | "bookingRequestRequireExactTime"
    | "bookingRequestAllowTimeWindows"
    | "bookingRequestAllowFlexibility"
    | "bookingRequestAllowAlternateSlots"
    | "bookingRequestAlternateSlotLimit"
    | "bookingRequestAlternateOfferExpiryHours"
  >;
  service: Pick<
    PublicBookingServiceRecord,
    | "bookingRequestRequireExactTime"
    | "bookingRequestAllowTimeWindows"
    | "bookingRequestAllowFlexibility"
    | "bookingRequestReviewMessage"
    | "bookingRequestAllowAlternateSlots"
    | "bookingRequestAlternateSlotLimit"
    | "bookingRequestAlternateOfferExpiryHours"
  >;
}) {
  const businessSettings = resolveBusinessBookingRequestSettings(params.business);
  const requireExactTime =
    params.service.bookingRequestRequireExactTime == null
      ? businessSettings.requireExactTime
      : normalizeBookingRequestRequireExactTime(params.service.bookingRequestRequireExactTime);
  const allowTimeWindows =
    requireExactTime
      ? false
      : params.service.bookingRequestAllowTimeWindows == null
        ? businessSettings.allowTimeWindows
        : normalizeBookingRequestAllowTimeWindows(params.service.bookingRequestAllowTimeWindows);

  return {
    requireExactTime,
    allowTimeWindows,
    allowFlexibility:
      params.service.bookingRequestAllowFlexibility == null
        ? businessSettings.allowFlexibility
        : normalizeBookingRequestAllowFlexibility(params.service.bookingRequestAllowFlexibility),
    reviewMessage: cleanOptionalText(params.service.bookingRequestReviewMessage ?? undefined),
    allowAlternateSlots:
      params.service.bookingRequestAllowAlternateSlots == null
        ? businessSettings.allowAlternateSlots
        : normalizeBookingRequestAllowAlternateSlots(params.service.bookingRequestAllowAlternateSlots),
    alternateSlotLimit:
      params.service.bookingRequestAlternateSlotLimit == null
        ? businessSettings.alternateSlotLimit
        : normalizeBookingRequestAlternateSlotLimit(params.service.bookingRequestAlternateSlotLimit),
    alternateOfferExpiryHours:
      params.service.bookingRequestAlternateOfferExpiryHours == null
        ? businessSettings.alternateOfferExpiryHours
        : normalizeBookingRequestAlternateOfferExpiryHours(params.service.bookingRequestAlternateOfferExpiryHours),
  };
}

function sortedDayIndexes(value: Set<number> | null | undefined): number[] | null {
  if (!value || value.size === 0) return null;
  return Array.from(value).sort((left, right) => left - right);
}

function bookingDaySetsMatch(left: Set<number> | null | undefined, right: Set<number> | null | undefined): boolean {
  const leftSorted = sortedDayIndexes(left) ?? [];
  const rightSorted = sortedDayIndexes(right) ?? [];
  if (leftSorted.length !== rightSorted.length) return false;
  return leftSorted.every((dayIndex, index) => dayIndex === rightSorted[index]);
}

function minutesToTimeValue(value: number): string {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function resolvePublicBookingAvailabilityDefaults(business: Pick<
  BusinessRecord,
  "operatingHours" | "bookingAvailableDays" | "bookingAvailableStartTime" | "bookingAvailableEndTime" | "bookingDailyHours" | "bookingBlackoutDates"
>) {
  const bookingSchedule = resolveBookingSchedule(business);
  const parsedOperatingHours = parseOperatingHours(business.operatingHours);
  const dailyHours = bookingSchedule.dailyHours;
  return {
    dayIndexes:
      (dailyHours.length > 0
        ? dailyHours.filter((entry) => entry.enabled).map((entry) => entry.dayIndex).sort((left, right) => left - right)
        : null) ??
      sortedDayIndexes(bookingSchedule.availableDayIndexes) ??
      Array.from(parsedOperatingHours.dayIndexes).sort((left, right) => left - right),
    openTime: bookingSchedule.openTime ?? minutesToTimeValue(parsedOperatingHours.openMinutes),
    closeTime: bookingSchedule.closeTime ?? minutesToTimeValue(parsedOperatingHours.closeMinutes),
    dailyHours,
    blackoutDates: Array.from(bookingSchedule.blackoutDates).sort(),
  };
}

function sanitizeServiceScheduleOverrides(
  service: Pick<
    PublicBookingServiceRecord,
    "bookingAvailableDays" | "bookingAvailableStartTime" | "bookingAvailableEndTime"
  >,
  businessSchedule: Pick<ReturnType<typeof resolveBookingSchedule>, "availableDayIndexes" | "openTime" | "closeTime">
) {
  const rawDayIndexes = parseStoredServiceBookingDays(service.bookingAvailableDays);
  const rawOpenTime =
    parseTimeToMinutes(service.bookingAvailableStartTime ?? "") != null
      ? service.bookingAvailableStartTime ?? null
      : null;
  const rawCloseTime =
    parseTimeToMinutes(service.bookingAvailableEndTime ?? "") != null
      ? service.bookingAvailableEndTime ?? null
      : null;
  const matchesLegacySeededDefaults =
    bookingDaySetsMatch(rawDayIndexes, new Set([1, 2, 3, 4, 5])) &&
    rawOpenTime === "09:00" &&
    rawCloseTime === "19:00" &&
    (!bookingDaySetsMatch(rawDayIndexes, businessSchedule.availableDayIndexes) ||
      rawOpenTime !== businessSchedule.openTime ||
      rawCloseTime !== businessSchedule.closeTime);

  if (matchesLegacySeededDefaults) {
    return {
      availableDayIndexes: null,
      openTime: null,
      closeTime: null,
    };
  }

  return {
    availableDayIndexes: bookingDaySetsMatch(rawDayIndexes, businessSchedule.availableDayIndexes) ? null : rawDayIndexes,
    openTime: rawOpenTime && rawOpenTime === businessSchedule.openTime ? null : rawOpenTime,
    closeTime: rawCloseTime && rawCloseTime === businessSchedule.closeTime ? null : rawCloseTime,
  };
}

type PublicBookingConfigPayload = {
  businessId: string;
  businessName: string;
  businessType: string | null;
  timezone: string;
  urgencyEnabled: boolean;
  urgencyText: string | null;
  title: string;
  subtitle: string;
  confirmationMessage: string | null;
  defaultFlow: "request" | "self_book";
  requestSettings: {
    requireExactTime: boolean;
    allowTimeWindows: boolean;
    allowFlexibility: boolean;
    allowAlternateSlots: boolean;
    alternateSlotLimit: number;
    alternateOfferExpiryHours: number | null;
    confirmationCopy: string | null;
    ownerResponsePageCopy: string | null;
    alternateAcceptanceCopy: string | null;
    chooseAnotherDayCopy: string | null;
  };
  branding: {
    logoUrl: string | null;
    logoTransform: BookingBrandLogoTransform;
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
  availabilityDefaults: {
    dayIndexes: number[];
    openTime: string | null;
    closeTime: string | null;
    dailyHours: BookingDailyHoursEntry[];
    blackoutDates: string[];
  };
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
    requestPolicy: {
      requireExactTime: boolean | null;
      allowTimeWindows: boolean | null;
      allowFlexibility: boolean | null;
      reviewMessage: string | null;
      allowAlternateSlots: boolean | null;
      alternateSlotLimit: number | null;
      alternateOfferExpiryHours: number | null;
    };
    availableDayIndexes: number[] | null;
    openTime: string | null;
    closeTime: string | null;
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
    | "bookingRequestRequireExactTime"
    | "bookingRequestAllowTimeWindows"
    | "bookingRequestAllowFlexibility"
    | "bookingRequestAllowAlternateSlots"
    | "bookingRequestAlternateSlotLimit"
    | "bookingRequestAlternateOfferExpiryHours"
    | "bookingRequestConfirmationCopy"
    | "bookingRequestOwnerResponsePageCopy"
    | "bookingRequestAlternateAcceptanceCopy"
    | "bookingRequestChooseAnotherDayCopy"
    | "bookingTrustBulletPrimary"
    | "bookingTrustBulletSecondary"
    | "bookingTrustBulletTertiary"
    | "bookingNotesPrompt"
    | "bookingBrandLogoUrl"
    | "bookingBrandLogoTransform"
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
    | "bookingUrgencyEnabled"
    | "bookingUrgencyText"
    | "operatingHours"
    | "bookingAvailableDays"
    | "bookingAvailableStartTime"
    | "bookingAvailableEndTime"
    | "bookingDailyHours"
    | "bookingBlackoutDates"
  > & { updatedAt?: Date | null };
  services: PublicBookingConfigPayload["services"];
  locations: PublicBookingConfigPayload["locations"];
}): PublicBookingConfigPayload {
  const { business, services, locations } = params;
  const availabilityDefaults = resolvePublicBookingAvailabilityDefaults(business);
  const requestSettings = resolveBusinessBookingRequestSettings(business);
  return {
    businessId: business.id,
    businessName: business.name,
    businessType: business.type,
    timezone: business.timezone ?? "America/Los_Angeles",
    urgencyEnabled: business.bookingUrgencyEnabled ?? false,
    urgencyText: business.bookingUrgencyEnabled ? buildBookingUrgencyText(business) : null,
    title: buildBookingPageTitle(business),
    subtitle: buildBookingPageSubtitle(business),
    confirmationMessage: cleanOptionalText(business.bookingConfirmationMessage ?? undefined),
    defaultFlow: normalizeBookingDefaultFlowValue(business.bookingDefaultFlow),
    requestSettings,
    branding: {
      logoUrl: resolveBookingPreviewLogoSource(business),
      logoTransform: parseBookingBrandLogoTransform(business.bookingBrandLogoTransform),
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
    availabilityDefaults,
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
      bookingRequestRequireExactTime: columns.has("booking_request_require_exact_time")
        ? services.bookingRequestRequireExactTime
        : sql<boolean | null>`null`,
      bookingRequestAllowTimeWindows: columns.has("booking_request_allow_time_windows")
        ? services.bookingRequestAllowTimeWindows
        : sql<boolean | null>`null`,
      bookingRequestAllowFlexibility: columns.has("booking_request_allow_flexibility")
        ? services.bookingRequestAllowFlexibility
        : sql<boolean | null>`null`,
      bookingRequestReviewMessage: columns.has("booking_request_review_message")
        ? services.bookingRequestReviewMessage
        : sql<string | null>`null`,
      bookingRequestAllowAlternateSlots: columns.has("booking_request_allow_alternate_slots")
        ? services.bookingRequestAllowAlternateSlots
        : sql<boolean | null>`null`,
      bookingRequestAlternateSlotLimit: columns.has("booking_request_alternate_slot_limit")
        ? services.bookingRequestAlternateSlotLimit
        : sql<number | null>`null`,
      bookingRequestAlternateOfferExpiryHours: columns.has("booking_request_alternate_offer_expiry_hours")
        ? services.bookingRequestAlternateOfferExpiryHours
        : sql<number | null>`null`,
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

function normalizeRequestServiceMode(value: string | null | undefined): "in_shop" | "mobile" {
  const normalized = normalizeBookingServiceMode(value);
  return normalized === "mobile" ? "mobile" : "in_shop";
}

function resolveBookingServicesSelection(params: {
  businessDefaultFlow: string | null | undefined;
  businessSchedule: Pick<ReturnType<typeof resolveBookingSchedule>, "availableDayIndexes" | "openTime" | "closeTime">;
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
  const serviceScheduleOverrides = sanitizeServiceScheduleOverrides(baseService, params.businessSchedule);

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
    availableDayIndexes: serviceScheduleOverrides.availableDayIndexes,
    openTime: serviceScheduleOverrides.openTime,
    closeTime: serviceScheduleOverrides.closeTime,
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
  for (const row of params.existingRows) {
    const rowEnd =
      row.endTime && row.endTime.getTime() > row.startTime.getTime()
        ? row.endTime
        : new Date(row.startTime.getTime() + 60 * 60 * 1000);
    const overlaps = row.startTime.getTime() < blockingEnd.getTime() && rowEnd.getTime() > params.slotStart.getTime();
    if (!overlaps) continue;
    if (String(row.internalNotes ?? "").trim().startsWith("[[calendar-block")) {
      return false;
    }
    overlappingAppointments += 1;
  }

  return overlappingAppointments < params.appointmentCapacity;
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

function mergeUniqueNoteLines(...sections: Array<string | null | undefined>): string | null {
  const lines: string[] = [];
  for (const section of sections) {
    const trimmedSection = String(section ?? "").trim();
    if (!trimmedSection) continue;
    for (const rawLine of trimmedSection.split(/\r?\n+/)) {
      const line = rawLine.trim();
      if (!line || lines.includes(line)) continue;
      lines.push(line);
    }
  }
  return lines.length > 0 ? lines.join("\n") : null;
}

async function findRecentMatchingBookingRequestSubmission(params: {
  businessId: string;
  serviceId: string;
  serviceSummary: string | null;
  serviceMode: string | null;
  email: string | null;
  phone: string | null;
  requestedDate: string | null;
  requestedTimeStart: Date | null;
  requestedTimeLabel: string | null;
  notes: string | null;
}) {
  const [existing] = await db
    .select({
      id: bookingRequests.id,
      businessId: bookingRequests.businessId,
      clientId: bookingRequests.clientId,
      appointmentId: bookingRequests.appointmentId,
      status: bookingRequests.status,
      publicTokenVersion: bookingRequests.publicTokenVersion,
    })
    .from(bookingRequests)
    .where(
      and(
        eq(bookingRequests.businessId, params.businessId),
        eq(bookingRequests.serviceId, params.serviceId),
        params.serviceSummary ? eq(bookingRequests.serviceSummary, params.serviceSummary) : isNull(bookingRequests.serviceSummary),
        params.serviceMode ? eq(bookingRequests.serviceMode, params.serviceMode) : isNull(bookingRequests.serviceMode),
        params.requestedDate ? eq(bookingRequests.requestedDate, params.requestedDate) : isNull(bookingRequests.requestedDate),
        params.requestedTimeStart
          ? eq(bookingRequests.requestedTimeStart, params.requestedTimeStart)
          : isNull(bookingRequests.requestedTimeStart),
        params.requestedTimeLabel
          ? eq(bookingRequests.requestedTimeLabel, params.requestedTimeLabel)
          : isNull(bookingRequests.requestedTimeLabel),
        params.notes ? eq(bookingRequests.notes, params.notes) : isNull(bookingRequests.notes),
        or(
          params.email ? eq(bookingRequests.clientEmail, params.email) : sql`false`,
          params.phone ? eq(bookingRequests.clientPhone, params.phone) : sql`false`
        ),
        sql`${bookingRequests.createdAt} >= ${new Date(Date.now() - 5 * 60 * 1000)}`
      )
    )
    .orderBy(desc(bookingRequests.createdAt))
    .limit(1);

  return existing ?? null;
}

async function resolveBookingRequestClientAndVehicle(params: {
  request: BookingRequestRecord;
}) {
  const existingClient =
    params.request.clientId
      ? await db
          .select()
          .from(clients)
          .where(and(eq(clients.id, params.request.clientId), eq(clients.businessId, params.request.businessId)))
          .limit(1)
      : [];
  const client =
    existingClient[0] ??
    (await findOrCreatePublicClient({
      businessId: params.request.businessId,
      firstName: params.request.clientFirstName ?? "Customer",
      lastName: params.request.clientLastName ?? "Request",
      email: params.request.clientEmail ?? null,
      phone: params.request.clientPhone ?? null,
      address: params.request.serviceAddress ?? null,
      city: params.request.serviceCity ?? null,
      state: params.request.serviceState ?? null,
      zip: params.request.serviceZip ?? null,
      marketingOptIn: params.request.marketingOptIn ?? true,
      notes: params.request.notes ?? null,
      internalNotes: "Booking request converted to appointment",
    }));

  const existingVehicle =
    params.request.vehicleId
      ? await db
          .select()
          .from(vehicles)
          .where(and(eq(vehicles.id, params.request.vehicleId), eq(vehicles.businessId, params.request.businessId)))
          .limit(1)
      : [];
  const vehicle =
    existingVehicle[0] ??
    (await findOrCreatePublicVehicle({
      businessId: params.request.businessId,
      clientId: client.id,
      year: params.request.vehicleYear ?? null,
      make: params.request.vehicleMake ?? null,
      model: params.request.vehicleModel ?? null,
      color: params.request.vehicleColor ?? null,
    }));

  return {
    client,
    vehicle,
  };
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

async function buildAppointmentPublicLinks(params: {
  appointmentId: string;
  businessId: string;
  publicTokenVersion: number;
}) {
  const publicToken = createPublicDocumentToken({
    kind: "appointment",
    entityId: params.appointmentId,
    businessId: params.businessId,
    tokenVersion: params.publicTokenVersion,
  });
  return {
    publicToken,
    confirmationUrl: buildPublicDocumentUrl(
      `/api/appointments/${encodeURIComponent(params.appointmentId)}/public-html?token=${encodeURIComponent(publicToken)}`
    ),
    portalUrl: buildPublicAppUrl(`/portal/${encodeURIComponent(publicToken)}`),
  };
}

async function createPublicBookingAppointment(params: {
  business: BusinessRecord;
  client: typeof clients.$inferSelect;
  vehicleId: string | null;
  locationId: string | null;
  selection: ReturnType<typeof resolveBookingServicesSelection>;
  startTime: Date;
  requestedServiceMode: "in_shop" | "mobile";
  customerNotes: string | null;
  serviceAddress: string | null;
  serviceCity: string | null;
  serviceState: string | null;
  serviceZip: string | null;
  campaign: string | null;
  sourceDetail: string | null;
  normalizedSource: string;
  activityAction: string;
  activityMetadata?: Record<string, unknown>;
  internalNotes: Array<string | null | undefined>;
  sendConfirmationTo: string | null;
  vehicleSummary: string | null;
  sourceLeadClientId?: string | null;
  sourceBookingRequestId?: string | null;
  sourceMetadata?: Record<string, unknown>;
  createdByUserId?: string | null;
}) {
  const finance = calculateAppointmentFinanceTotals({
    subtotal: params.selection.subtotal,
    taxRate: Number(params.business.defaultTaxRate ?? 0),
    applyTax: params.selection.applyTax,
    adminFeeRate: Number(params.business.defaultAdminFee ?? 0),
    applyAdminFee: params.business.defaultAdminFeeEnabled ?? false,
  });

  const appointmentEnd =
    params.selection.allServices.length > 0 && params.selection.durationMinutes > 0
      ? new Date(params.startTime.getTime() + params.selection.durationMinutes * 60 * 1000)
      : null;
  const appointmentId = randomUUID();
  const [createdAppointment] = await db
    .insert(appointments)
    .values({
      id: appointmentId,
      businessId: params.business.id,
      clientId: params.client.id,
      vehicleId: params.vehicleId,
      locationId: params.requestedServiceMode === "in_shop" ? params.locationId ?? null : null,
      title: params.selection.title,
      startTime: params.startTime,
      endTime: appointmentEnd,
      jobStartTime: params.startTime,
      expectedCompletionTime: appointmentEnd,
      subtotal: String(finance.subtotal.toFixed(2)),
      taxRate: String(finance.taxRate.toFixed(2)),
      taxAmount: String(finance.taxAmount.toFixed(2)),
      applyTax: finance.applyTax,
      adminFeeRate: String(finance.adminFeeRate.toFixed(2)),
      adminFeeAmount: String(finance.adminFeeAmount.toFixed(2)),
      applyAdminFee: finance.applyAdminFee,
      totalPrice: String(finance.totalPrice.toFixed(2)),
      depositAmount: String(params.selection.depositAmount.toFixed(2)),
      notes: params.customerNotes,
      vehicleOnSite: params.requestedServiceMode === "in_shop",
      internalNotes: params.internalNotes.filter(Boolean).join("\n"),
    })
    .returning({
      id: appointments.id,
      publicTokenVersion: appointments.publicTokenVersion,
    });

  if (!createdAppointment) {
    throw new BadRequestError("Could not create this appointment.");
  }

  const serviceRows = params.selection.allServices.map((service) => ({
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

  await upsertAppointmentSourceLink({
    appointmentId: createdAppointment.id,
    businessId: params.business.id,
    sourceType: "booking_request",
    leadClientId: params.sourceLeadClientId ?? params.client.id,
    bookingRequestId: params.sourceBookingRequestId ?? null,
    metadata: {
      serviceSummary: params.selection.serviceSummary,
      requestedServiceMode: params.requestedServiceMode,
      requestedTiming: formatBookingDateTime(params.startTime, params.business.timezone),
      sourceDetail: params.sourceDetail,
      campaign: params.campaign,
      customerName: `${params.client.firstName} ${params.client.lastName}`.trim() || null,
      customerPhone: params.client.phone ?? null,
      customerEmail: params.client.email ?? null,
      originalCustomerNotes: params.customerNotes ?? null,
      serviceAddress:
        params.requestedServiceMode === "mobile"
          ? [params.serviceAddress, params.serviceCity, params.serviceState, params.serviceZip].filter(Boolean).join(", ") || null
          : null,
      vehicleSummary: params.vehicleSummary,
      ...(params.sourceMetadata ?? {}),
    },
  });

  const nextLeadNotes = updateLeadNotesStatus(params.client.notes, "booked");
  if (nextLeadNotes && nextLeadNotes !== params.client.notes) {
    await db
      .update(clients)
      .set({
        notes: nextLeadNotes,
        updatedAt: new Date(),
      })
      .where(and(eq(clients.id, params.client.id), eq(clients.businessId, params.business.id)));

    await createActivityLog({
      businessId: params.business.id,
      action: "lead.booked",
      entityType: "client",
      entityId: params.client.id,
      metadata: {
        appointmentId: createdAppointment.id,
        bookingRequestId: params.sourceBookingRequestId ?? null,
      },
      userId: params.createdByUserId ?? null,
    });
  }

  const links = await buildAppointmentPublicLinks({
    appointmentId: createdAppointment.id,
    businessId: params.business.id,
    publicTokenVersion: createdAppointment.publicTokenVersion ?? 1,
  });
  const confirmationSmsVars = {
    clientName: `${params.client.firstName} ${params.client.lastName}`.trim(),
    businessName: params.business.name,
    dateTime: formatBookingDateTime(params.startTime, params.business.timezone),
    vehicle: params.vehicleSummary ?? "-",
    address:
      params.requestedServiceMode === "mobile"
        ? [params.serviceAddress, params.serviceCity, params.serviceState, params.serviceZip].filter(Boolean).join(", ") || "-"
        : "-",
    serviceSummary: params.selection.serviceSummary ?? "-",
    confirmationUrl: links.confirmationUrl ?? "",
    confirmationActionLabel: "View appointment",
    paymentStatus: params.selection.depositAmount > 0 ? "Deposit due" : "No deposit required",
    message: "",
  };

  await createActivityLog({
    businessId: params.business.id,
    action: params.activityAction,
    entityType: "appointment",
    entityId: createdAppointment.id,
    metadata: {
      source: params.normalizedSource,
      campaign: params.campaign,
      serviceSummary: params.selection.serviceSummary,
      locationId: params.locationId ?? null,
      ...params.activityMetadata,
    },
    userId: params.createdByUserId ?? null,
  });

  await createActivityLog({
    businessId: params.business.id,
    action: "appointment.created_from_source",
    entityType: "appointment",
    entityId: createdAppointment.id,
    metadata: {
      sourceType: "booking_request",
      leadClientId: params.sourceLeadClientId ?? params.client.id,
      bookingRequestId: params.sourceBookingRequestId ?? null,
    },
    userId: params.createdByUserId ?? null,
  });

  await safeCreateNotification(
    {
      businessId: params.business.id,
      type: "appointment_created",
      title: "Appointment created from booking request",
      message:
        `${params.client.firstName} ${params.client.lastName}`.trim() +
        ` is now scheduled for ${formatBookingDateTime(params.startTime, params.business.timezone)}.`,
      entityType: "appointment",
      entityId: createdAppointment.id,
      bucket: "calendar",
      dedupeKey: `appointment-created:${createdAppointment.id}`,
      metadata: {
        sourceType: "booking_request",
        leadClientId: params.sourceLeadClientId ?? params.client.id,
        bookingRequestId: params.sourceBookingRequestId ?? null,
        serviceSummary: params.selection.serviceSummary,
        path: `/appointments/${encodeURIComponent(createdAppointment.id)}`,
      },
    },
    { source: "businesses.createPublicBookingAppointment" }
  );

  if (
    params.sendConfirmationTo &&
    isEmailConfigured() &&
    (params.business.notificationAppointmentConfirmationEmailEnabled ?? true)
  ) {
    sendAppointmentConfirmation({
      to: params.sendConfirmationTo,
      businessId: params.business.id,
      clientName: `${params.client.firstName} ${params.client.lastName}`.trim(),
      businessName: params.business.name,
      dateTime: formatBookingDateTime(params.startTime, params.business.timezone),
      vehicle: params.vehicleSummary,
      address:
        params.requestedServiceMode === "mobile"
          ? [params.serviceAddress, params.serviceCity, params.serviceState, params.serviceZip].filter(Boolean).join(", ")
          : null,
      serviceSummary: params.selection.serviceSummary,
      confirmationUrl: links.confirmationUrl,
      portalUrl: links.portalUrl,
    }).catch((error) => {
      warnOnce(`booking:appointment-confirmation:${createdAppointment.id}`, "public booking confirmation email failed", {
        businessId: params.business.id,
        appointmentId: createdAppointment.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  if (params.client.phone) {
    enqueueTwilioTemplateSms({
      businessId: params.business.id,
      templateSlug: "appointment_confirmation",
      to: params.client.phone,
      vars: confirmationSmsVars,
      entityType: "appointment",
      entityId: createdAppointment.id,
    }).catch((error) => {
      warnOnce(`booking:appointment-confirmation-sms:${createdAppointment.id}`, "public booking confirmation SMS enqueue failed", {
        businessId: params.business.id,
        appointmentId: createdAppointment.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  return {
    appointmentId: createdAppointment.id,
    publicTokenVersion: createdAppointment.publicTokenVersion ?? 1,
    confirmationUrl: links.confirmationUrl,
    portalUrl: links.portalUrl,
    scheduledFor: formatBookingDateTime(params.startTime, params.business.timezone),
    depositAmount: params.selection.depositAmount,
  };
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

export async function serializeOwnerBookingRequest(
  request: BookingRequestRecord,
  business: Pick<
    BusinessRecord,
    | "id"
    | "name"
    | "timezone"
    | "bookingRequestRequireExactTime"
    | "bookingRequestAllowTimeWindows"
    | "bookingRequestAllowFlexibility"
    | "bookingRequestAllowAlternateSlots"
    | "bookingRequestAlternateSlotLimit"
    | "bookingRequestAlternateOfferExpiryHours"
  >,
  options?: {
    requestPolicy?: {
      requireExactTime: boolean;
      allowTimeWindows: boolean;
      allowFlexibility: boolean;
      reviewMessage: string | null;
      allowAlternateSlots: boolean;
      alternateSlotLimit: number;
      alternateOfferExpiryHours: number | null;
    };
  }
) {
  const publicAccess = buildBookingRequestPublicAccess(request);
  let confirmationUrl: string | null = null;
  let portalUrl: string | null = null;

  if (request.appointmentId) {
    const [appointment] = await db
      .select({
        publicTokenVersion: appointments.publicTokenVersion,
      })
      .from(appointments)
      .where(and(eq(appointments.id, request.appointmentId), eq(appointments.businessId, business.id)))
      .limit(1);

    if (appointment) {
      const links = await buildAppointmentPublicLinks({
        appointmentId: request.appointmentId,
        businessId: business.id,
        publicTokenVersion: appointment.publicTokenVersion ?? 1,
      });
      confirmationUrl = links.confirmationUrl;
      portalUrl = links.portalUrl;
    }
  }

  const alternateSlotOptions = parseBookingRequestAlternateSlotOptions(request.alternateSlotOptions);
  const defaultRequireExactTime = normalizeBookingRequestRequireExactTime(business.bookingRequestRequireExactTime);
  const requestPolicy = options?.requestPolicy ?? {
    requireExactTime: defaultRequireExactTime,
    allowTimeWindows: defaultRequireExactTime
      ? false
      : normalizeBookingRequestAllowTimeWindows(business.bookingRequestAllowTimeWindows),
    allowFlexibility: normalizeBookingRequestAllowFlexibility(business.bookingRequestAllowFlexibility),
    reviewMessage: null,
    allowAlternateSlots: normalizeBookingRequestAllowAlternateSlots(business.bookingRequestAllowAlternateSlots),
    alternateSlotLimit: normalizeBookingRequestAlternateSlotLimit(business.bookingRequestAlternateSlotLimit),
    alternateOfferExpiryHours: normalizeBookingRequestAlternateOfferExpiryHours(
      business.bookingRequestAlternateOfferExpiryHours
    ),
  };

  return {
    id: request.id,
    businessId: request.businessId,
    clientId: request.clientId,
    vehicleId: request.vehicleId,
    serviceId: request.serviceId,
    locationId: request.locationId,
    appointmentId: request.appointmentId,
    status: normalizeBookingRequestStatus(request.status),
    ownerReviewStatus: normalizeBookingRequestOwnerReviewStatus(request.ownerReviewStatus),
    customerResponseStatus: normalizeBookingRequestCustomerResponseStatus(request.customerResponseStatus),
    serviceMode: normalizeBookingServiceMode(request.serviceMode),
    addonServiceIds: parseStoredStringArray(request.addonServiceIds),
    serviceSummary: request.serviceSummary ?? "",
    requestedDate: request.requestedDate ?? null,
    requestedTimeStart: request.requestedTimeStart?.toISOString() ?? null,
    requestedTimeEnd: request.requestedTimeEnd?.toISOString() ?? null,
    requestedTimeLabel: request.requestedTimeLabel ?? null,
    requestedTimingSummary: buildBookingRequestTimingSummary({
      requestedDate: request.requestedDate,
      requestedTimeStart: request.requestedTimeStart,
      requestedTimeEnd: request.requestedTimeEnd,
      requestedTimeLabel: request.requestedTimeLabel,
      timeZone: business.timezone ?? "America/Los_Angeles",
    }),
    customerTimezone: request.customerTimezone ?? business.timezone ?? "America/Los_Angeles",
    flexibility: normalizeBookingRequestFlexibility(request.flexibility),
    ownerResponseMessage: request.ownerResponseMessage ?? null,
    customerResponseMessage: request.customerResponseMessage ?? null,
    alternateSlotOptions: alternateSlotOptions.map((option) => ({
      ...option,
      startTime: option.startTime,
      endTime: option.endTime,
      expiresAt: option.expiresAt,
    })),
    customer: {
      firstName: request.clientFirstName ?? "",
      lastName: request.clientLastName ?? "",
      email: request.clientEmail ?? null,
      phone: request.clientPhone ?? null,
    },
    vehicle: {
      year: request.vehicleYear ?? null,
      make: request.vehicleMake ?? null,
      model: request.vehicleModel ?? null,
      color: request.vehicleColor ?? null,
      summary: buildVehicleSummary({
        year: request.vehicleYear,
        make: request.vehicleMake,
        model: request.vehicleModel,
      }),
    },
    serviceAddress: request.serviceAddress ?? null,
    serviceCity: request.serviceCity ?? null,
    serviceState: request.serviceState ?? null,
    serviceZip: request.serviceZip ?? null,
    notes: request.notes ?? null,
    marketingOptIn: request.marketingOptIn ?? true,
    source: request.source ?? null,
    campaign: request.campaign ?? null,
    submittedAt: request.submittedAt.toISOString(),
    underReviewAt: request.underReviewAt?.toISOString() ?? null,
    ownerRespondedAt: request.ownerRespondedAt?.toISOString() ?? null,
    approvedRequestedSlotAt: request.approvedRequestedSlotAt?.toISOString() ?? null,
    customerRespondedAt: request.customerRespondedAt?.toISOString() ?? null,
    confirmedAt: request.confirmedAt?.toISOString() ?? null,
    declinedAt: request.declinedAt?.toISOString() ?? null,
    expiredAt: request.expiredAt?.toISOString() ?? null,
    expiresAt: request.expiresAt?.toISOString() ?? null,
    requestPolicy,
    publicResponseUrl: publicAccess.publicResponseUrl,
    confirmationUrl,
    portalUrl,
  };
}

function resolveRequestPolicyForBookingRequest(params: {
  business: Pick<
    BusinessRecord,
    | "bookingRequestRequireExactTime"
    | "bookingRequestAllowTimeWindows"
    | "bookingRequestAllowFlexibility"
    | "bookingRequestAllowAlternateSlots"
    | "bookingRequestAlternateSlotLimit"
    | "bookingRequestAlternateOfferExpiryHours"
  >;
  request: Pick<BookingRequestRecord, "serviceId">;
  services: PublicBookingServiceRecord[];
}) {
  const requestService = params.services.find((service) => service.id === params.request.serviceId) ?? null;
  return requestService
    ? resolvePublicBookingRequestPolicy({
        business: params.business,
        service: requestService,
      })
    : undefined;
}

export function serializePublicBookingRequest(
  request: BookingRequestRecord,
  business: Pick<
    BusinessRecord,
    | "id"
    | "name"
    | "timezone"
    | "bookingRequestRequireExactTime"
    | "bookingRequestAllowTimeWindows"
    | "bookingRequestAllowFlexibility"
    | "bookingRequestAllowAlternateSlots"
    | "bookingRequestAlternateSlotLimit"
    | "bookingRequestAlternateOfferExpiryHours"
    | "bookingRequestOwnerResponsePageCopy"
    | "bookingRequestAlternateAcceptanceCopy"
    | "bookingRequestChooseAnotherDayCopy"
  >,
  options?: {
    requestPolicy?: {
      requireExactTime: boolean;
      allowTimeWindows: boolean;
      allowFlexibility: boolean;
      reviewMessage: string | null;
      allowAlternateSlots: boolean;
      alternateSlotLimit: number;
      alternateOfferExpiryHours: number | null;
    };
  }
) {
  const alternateSlotOptions = parseBookingRequestAlternateSlotOptions(request.alternateSlotOptions);
  const defaultRequireExactTime = normalizeBookingRequestRequireExactTime(business.bookingRequestRequireExactTime);
  const requestSettings = options?.requestPolicy ?? {
    requireExactTime: defaultRequireExactTime,
    allowTimeWindows: defaultRequireExactTime
      ? false
      : normalizeBookingRequestAllowTimeWindows(business.bookingRequestAllowTimeWindows),
    allowFlexibility: normalizeBookingRequestAllowFlexibility(business.bookingRequestAllowFlexibility),
    reviewMessage: null,
    allowAlternateSlots: normalizeBookingRequestAllowAlternateSlots(business.bookingRequestAllowAlternateSlots),
    alternateSlotLimit: normalizeBookingRequestAlternateSlotLimit(business.bookingRequestAlternateSlotLimit),
    alternateOfferExpiryHours: normalizeBookingRequestAlternateOfferExpiryHours(
      business.bookingRequestAlternateOfferExpiryHours
    ),
  };
  return {
    id: request.id,
    businessId: request.businessId,
    businessName: business.name,
    status: normalizeBookingRequestStatus(request.status),
    ownerReviewStatus: normalizeBookingRequestOwnerReviewStatus(request.ownerReviewStatus),
    customerResponseStatus: normalizeBookingRequestCustomerResponseStatus(request.customerResponseStatus),
    serviceSummary: request.serviceSummary ?? "",
    requestedDate: request.requestedDate ?? null,
    requestedTimeStart: request.requestedTimeStart?.toISOString() ?? null,
    requestedTimeEnd: request.requestedTimeEnd?.toISOString() ?? null,
    requestedTimeLabel: request.requestedTimeLabel ?? null,
    requestedTimingSummary: buildBookingRequestTimingSummary({
      requestedDate: request.requestedDate,
      requestedTimeStart: request.requestedTimeStart,
      requestedTimeEnd: request.requestedTimeEnd,
      requestedTimeLabel: request.requestedTimeLabel,
      timeZone: business.timezone ?? "America/Los_Angeles",
    }),
    customerTimezone: request.customerTimezone ?? business.timezone ?? "America/Los_Angeles",
    flexibility: normalizeBookingRequestFlexibility(request.flexibility),
    ownerResponseMessage: request.ownerResponseMessage ?? null,
    alternateSlotOptions: alternateSlotOptions
      .filter((option) => option.status === "proposed")
      .map((option) => ({
        id: option.id,
        startTime: option.startTime,
        endTime: option.endTime,
        label: option.label,
        expiresAt: option.expiresAt,
      })),
    vehicle: {
      year: request.vehicleYear ?? null,
      make: request.vehicleMake ?? null,
      model: request.vehicleModel ?? null,
      color: request.vehicleColor ?? null,
      summary: buildVehicleSummary({
        year: request.vehicleYear,
        make: request.vehicleMake,
        model: request.vehicleModel,
      }),
    },
    serviceAddress: request.serviceAddress ?? null,
    serviceCity: request.serviceCity ?? null,
    serviceState: request.serviceState ?? null,
    serviceZip: request.serviceZip ?? null,
    notes: request.notes ?? null,
    serviceMode: normalizeBookingServiceMode(request.serviceMode),
    requestPolicy: requestSettings,
    experienceCopy: {
      ownerResponsePage: normalizeRequestCopy(business.bookingRequestOwnerResponsePageCopy),
      alternateAcceptance: normalizeRequestCopy(business.bookingRequestAlternateAcceptanceCopy),
      chooseAnotherDay: normalizeRequestCopy(business.bookingRequestChooseAnotherDayCopy),
    },
    submittedAt: request.submittedAt.toISOString(),
    expiresAt: request.expiresAt?.toISOString() ?? null,
    canRespond:
      normalizeBookingRequestStatus(request.status) === "awaiting_customer_selection" ||
      normalizeBookingRequestStatus(request.status) === "customer_requested_new_time",
  };
}

async function assertBookableRequestSlot(params: {
  business: BusinessRecord;
  selection: ReturnType<typeof resolveBookingServicesSelection>;
  startTime: Date;
}) {
  const bookingTimezone = params.business.timezone ?? "America/Los_Angeles";
  const selectedDate = startOfLocalDay(params.startTime, bookingTimezone);
  const today = startOfLocalDay(new Date(), bookingTimezone);
  const lastAllowedDate = addDays(today, params.selection.bookingWindowDays - 1, bookingTimezone);
  if (selectedDate.getTime() < today.getTime() || selectedDate.getTime() > lastAllowedDate.getTime()) {
    throw new BadRequestError("Choose a booking date inside the available window.");
  }

  const bookingSchedule = resolveBookingSchedule(params.business);
  if (bookingSchedule.blackoutDates.has(toDateKey(selectedDate, bookingTimezone))) {
    throw new BadRequestError("This date is unavailable for online booking.");
  }

  const dayStart = startOfLocalDay(params.startTime, bookingTimezone);
  const dayEnd = addDays(dayStart, 1, bookingTimezone);
  const existingRows = await db
    .select({
      startTime: appointments.startTime,
      endTime: appointments.endTime,
      internalNotes: appointments.internalNotes,
    })
    .from(appointments)
    .where(
      and(
        eq(appointments.businessId, params.business.id),
        sql`${appointments.status} NOT IN ('cancelled', 'no-show')`,
        sql`${appointments.startTime} < ${dayEnd}`,
        sql`coalesce(${appointments.endTime}, ${appointments.startTime} + interval '1 hour') > ${dayStart}`
      )
    )
    .orderBy(asc(appointments.startTime));

  const slotCapacity = bookingSchedule.slotCapacity;
  const allowedSlots = buildSlotsForDate({
    date: selectedDate,
    operatingHours: params.business.operatingHours,
    durationMinutes: params.selection.durationMinutes,
    leadTimeHours: params.selection.leadTimeHours,
    incrementMinutes: bookingSchedule.incrementMinutes,
    availableDayIndexes: params.selection.availableDayIndexes ?? bookingSchedule.availableDayIndexes,
    openTime: params.selection.openTime ?? bookingSchedule.openTime,
    closeTime: params.selection.closeTime ?? bookingSchedule.closeTime,
    dailyHours: bookingSchedule.dailyHours,
    timezone: bookingTimezone,
    now: new Date(),
  }).filter((slotStart) =>
    isSlotAvailable({
      slotStart,
      durationMinutes: params.selection.durationMinutes,
      bufferMinutes: params.selection.bufferMinutes ?? bookingSchedule.bufferMinutes,
      appointmentCapacity: params.selection.slotCapacity ?? slotCapacity,
      blockCapacity: params.selection.slotCapacity ?? slotCapacity,
      existingRows,
    })
  );

  const matchesAvailableSlot = allowedSlots.some((slot) => slot.getTime() === params.startTime.getTime());
  if (!matchesAvailableSlot) {
    throw new BadRequestError("That time is no longer available. Refresh availability and choose another slot.");
  }

  const appointmentEnd = new Date(params.startTime.getTime() + params.selection.durationMinutes * 60 * 1000);
  const overlappingAppointments = await countOverlappingAppointments({
    businessId: params.business.id,
    startTime: params.startTime,
    endTime: appointmentEnd,
  });
  if (overlappingAppointments >= (params.selection.slotCapacity ?? slotCapacity)) {
    throw new BadRequestError("That time is no longer available. Refresh availability and choose another slot.");
  }

  return {
    bookingTimezone,
    appointmentEnd,
  };
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
    bookingRequestRequireExactTime: record.bookingRequestRequireExactTime ?? false,
    bookingRequestAllowTimeWindows: record.bookingRequestAllowTimeWindows ?? true,
    bookingRequestAllowFlexibility: record.bookingRequestAllowFlexibility ?? true,
    bookingRequestAllowAlternateSlots: record.bookingRequestAllowAlternateSlots ?? true,
    bookingRequestAlternateSlotLimit: record.bookingRequestAlternateSlotLimit ?? DEFAULT_BOOKING_REQUEST_ALTERNATE_SLOT_LIMIT,
    bookingRequestAlternateOfferExpiryHours: record.bookingRequestAlternateOfferExpiryHours ?? null,
    bookingRequestConfirmationCopy: record.bookingRequestConfirmationCopy ?? null,
    bookingRequestOwnerResponsePageCopy: record.bookingRequestOwnerResponsePageCopy ?? null,
    bookingRequestAlternateAcceptanceCopy: record.bookingRequestAlternateAcceptanceCopy ?? null,
    bookingRequestChooseAnotherDayCopy: record.bookingRequestChooseAnotherDayCopy ?? null,
    bookingTrustBulletPrimary: record.bookingTrustBulletPrimary ?? null,
    bookingTrustBulletSecondary: record.bookingTrustBulletSecondary ?? null,
    bookingTrustBulletTertiary: record.bookingTrustBulletTertiary ?? null,
    bookingNotesPrompt: record.bookingNotesPrompt ?? null,
    bookingBrandLogoUrl: record.bookingBrandLogoUrl ?? null,
    bookingBrandLogoTransform: record.bookingBrandLogoTransform ?? null,
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
    bookingDailyHours: record.bookingDailyHours ?? null,
    bookingBlackoutDates: record.bookingBlackoutDates ?? null,
    bookingSlotIntervalMinutes: record.bookingSlotIntervalMinutes ?? 15,
    bookingBufferMinutes: record.bookingBufferMinutes ?? null,
    bookingCapacityPerSlot: record.bookingCapacityPerSlot ?? null,
    bookingUrgencyEnabled: record.bookingUrgencyEnabled ?? false,
    bookingUrgencyText: record.bookingUrgencyText ?? null,
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
    bookingRequestRequireExactTime: record.bookingRequestRequireExactTime ?? false,
    bookingRequestAllowTimeWindows: record.bookingRequestAllowTimeWindows ?? true,
    bookingRequestAllowFlexibility: record.bookingRequestAllowFlexibility ?? true,
    bookingRequestAllowAlternateSlots: record.bookingRequestAllowAlternateSlots ?? true,
    bookingRequestAlternateSlotLimit: record.bookingRequestAlternateSlotLimit ?? DEFAULT_BOOKING_REQUEST_ALTERNATE_SLOT_LIMIT,
    bookingRequestAlternateOfferExpiryHours: record.bookingRequestAlternateOfferExpiryHours ?? null,
    bookingRequestConfirmationCopy: record.bookingRequestConfirmationCopy ?? null,
    bookingRequestOwnerResponsePageCopy: record.bookingRequestOwnerResponsePageCopy ?? null,
    bookingRequestAlternateAcceptanceCopy: record.bookingRequestAlternateAcceptanceCopy ?? null,
    bookingRequestChooseAnotherDayCopy: record.bookingRequestChooseAnotherDayCopy ?? null,
    bookingTrustBulletPrimary: record.bookingTrustBulletPrimary ?? null,
    bookingTrustBulletSecondary: record.bookingTrustBulletSecondary ?? null,
    bookingTrustBulletTertiary: record.bookingTrustBulletTertiary ?? null,
    bookingNotesPrompt: record.bookingNotesPrompt ?? null,
    bookingBrandLogoUrl: record.bookingBrandLogoUrl ?? null,
    bookingBrandLogoTransform: parseBookingBrandLogoTransform(record.bookingBrandLogoTransform),
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
    bookingDailyHours: parseBookingDailyHours(record.bookingDailyHours),
    bookingBlackoutDates: parseStoredStringArray(record.bookingBlackoutDates),
    bookingSlotIntervalMinutes: record.bookingSlotIntervalMinutes ?? 15,
    bookingBufferMinutes: record.bookingBufferMinutes ?? null,
    bookingCapacityPerSlot: record.bookingCapacityPerSlot ?? null,
    bookingUrgencyEnabled: record.bookingUrgencyEnabled ?? false,
    bookingUrgencyText: record.bookingUrgencyText ?? null,
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
  if (!req.businessId || req.businessId !== business.id || !req.membershipRole || !Array.isArray(req.permissions)) {
    return false;
  }
  return permission ? req.permissions.includes(permission) : true;
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
          ADD COLUMN IF NOT EXISTS booking_request_require_exact_time boolean DEFAULT false,
          ADD COLUMN IF NOT EXISTS booking_request_allow_time_windows boolean DEFAULT true,
          ADD COLUMN IF NOT EXISTS booking_request_allow_flexibility boolean DEFAULT true,
          ADD COLUMN IF NOT EXISTS booking_request_allow_alternate_slots boolean DEFAULT true,
          ADD COLUMN IF NOT EXISTS booking_request_alternate_slot_limit integer DEFAULT 3,
          ADD COLUMN IF NOT EXISTS booking_request_alternate_offer_expiry_hours integer,
          ADD COLUMN IF NOT EXISTS booking_request_confirmation_copy text,
          ADD COLUMN IF NOT EXISTS booking_request_owner_response_page_copy text,
          ADD COLUMN IF NOT EXISTS booking_request_alternate_acceptance_copy text,
          ADD COLUMN IF NOT EXISTS booking_request_choose_another_day_copy text,
          ADD COLUMN IF NOT EXISTS booking_trust_bullet_primary text,
          ADD COLUMN IF NOT EXISTS booking_trust_bullet_secondary text,
          ADD COLUMN IF NOT EXISTS booking_trust_bullet_tertiary text,
          ADD COLUMN IF NOT EXISTS booking_notes_prompt text,
          ADD COLUMN IF NOT EXISTS booking_brand_logo_url text,
          ADD COLUMN IF NOT EXISTS booking_brand_logo_transform text,
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
          ADD COLUMN IF NOT EXISTS booking_daily_hours text,
          ADD COLUMN IF NOT EXISTS booking_blackout_dates text,
          ADD COLUMN IF NOT EXISTS booking_slot_interval_minutes integer DEFAULT 15,
          ADD COLUMN IF NOT EXISTS booking_buffer_minutes integer,
          ADD COLUMN IF NOT EXISTS booking_capacity_per_slot integer,
          ADD COLUMN IF NOT EXISTS booking_urgency_enabled boolean DEFAULT false,
          ADD COLUMN IF NOT EXISTS booking_urgency_text text,
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

    const business = await loadAccessiblePublicBookingBusiness(parsed.data.id, req);
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

    const business = await loadAccessiblePublicBookingBusiness(parsedParams.data.id, req);
    if (!business || business.bookingEnabled !== true) {
      throw new NotFoundError("Online booking is not available for this business.");
    }
    const bookingTimezone = business.timezone ?? "America/Los_Angeles";

    const { services: publicServices, addonLinks } = await listPublicBookingServices(business.id);
    const selection = resolveBookingServicesSelection({
      businessDefaultFlow: business.bookingDefaultFlow,
      businessSchedule: resolveBookingSchedule(business),
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
      requestedTimeEnd: cleanOptionalText(parsedBody.data.requestedTimeEnd),
      requestedTimeLabel: cleanOptionalText(parsedBody.data.requestedTimeLabel),
      flexibility: parsedBody.data.flexibility,
      customerTimezone: cleanOptionalText(parsedBody.data.customerTimezone) ?? bookingTimezone,
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
          requestedTimeEnd: existing.requestedTimeEnd ? existing.requestedTimeEnd.toISOString() : "",
          requestedTimeLabel: existing.requestedTimeLabel,
          flexibility: existing.flexibility,
          customerTimezone: existing.customerTimezone,
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
        requestedTimeEnd: comparable.requestedTimeEnd ? new Date(comparable.requestedTimeEnd) : null,
        requestedTimeLabel: comparable.requestedTimeLabel || null,
        flexibility: normalizeBookingRequestFlexibility(comparable.flexibility),
        customerTimezone: comparable.customerTimezone || bookingTimezone,
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

    const business = await loadAccessiblePublicBookingBusiness(parsed.data.id, req);
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
  "/:id/public-booking-brand-logo",
  wrapAsync(async (req: Request, res: Response) => {
    const parsed = publicLeadConfigParamsSchema.safeParse(req.params);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? "Invalid business.");

    const business = await loadBusinessById(parsed.data.id);
    if (!business) throw new NotFoundError("Business not found.");

    const logoUrl = normalizeBookingBrandLogoUrl(business.bookingBrandLogoUrl);
    if (!logoUrl) throw new NotFoundError("Logo not found.");

    const dataUrl = parseDataUrlImage(logoUrl);
    res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");

    if (dataUrl) {
      res.type(dataUrl.contentType).send(dataUrl.body);
      return;
    }

    res.redirect(307, logoUrl);
  })
);

businessesRouter.get(
  "/:id/public-booking-preview.svg",
  wrapAsync(async (req: Request, res: Response) => {
    const parsed = publicLeadConfigParamsSchema.safeParse(req.params);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? "Invalid business.");

    const business = await loadBusinessById(parsed.data.id);
    if (!business) throw new NotFoundError("Business not found.");

    res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    res.type("image/svg+xml").send(
      renderPublicBookingPreviewSvg({
        id: business.id,
        name: business.name,
        bookingPageTitle: business.bookingPageTitle,
        bookingPageSubtitle: business.bookingPageSubtitle,
        bookingTrustBulletPrimary: business.bookingTrustBulletPrimary,
        bookingTrustBulletSecondary: business.bookingTrustBulletSecondary,
        bookingTrustBulletTertiary: business.bookingTrustBulletTertiary,
        bookingBrandLogoUrl: business.bookingBrandLogoUrl,
        bookingBrandLogoTransform: business.bookingBrandLogoTransform,
        bookingBrandPrimaryColorToken: business.bookingBrandPrimaryColorToken,
        bookingBrandAccentColorToken: business.bookingBrandAccentColorToken,
        bookingBrandBackgroundToneToken: business.bookingBrandBackgroundToneToken,
      })
    );
  })
);

businessesRouter.get(
  "/:id/public-booking-config",
  publicBookingConfigLimiter.middleware,
  wrapAsync(async (req: Request, res: Response) => {
    const parsed = publicLeadConfigParamsSchema.safeParse(req.params);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? "Invalid business.");

    const business = await loadAccessiblePublicBookingBusiness(parsed.data.id, req);
    if (!business || business.bookingEnabled !== true) {
      throw new NotFoundError("Online booking is not available for this business.");
    }

    const { services: publicServices, addonLinks } = await listPublicBookingServices(business.id);
    const businessSchedule = resolveBookingSchedule(business);
    const locations = await listPublicBookingLocations(business.id);
    const baseServices = publicServices
      .filter((service) => service.active !== false && service.isAddon !== true && service.bookingEnabled === true)
      .map((service) => {
        const serviceScheduleOverrides = sanitizeServiceScheduleOverrides(service, businessSchedule);
        const requestPolicy = resolvePublicBookingRequestPolicy({
          business,
          service,
        });
        return {
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
          requestPolicy: {
            requireExactTime: requestPolicy.requireExactTime,
            allowTimeWindows: requestPolicy.allowTimeWindows,
            allowFlexibility: requestPolicy.allowFlexibility,
            reviewMessage: requestPolicy.reviewMessage,
            allowAlternateSlots: requestPolicy.allowAlternateSlots,
            alternateSlotLimit: requestPolicy.alternateSlotLimit,
            alternateOfferExpiryHours: requestPolicy.alternateOfferExpiryHours,
          },
          availableDayIndexes: sortedDayIndexes(serviceScheduleOverrides.availableDayIndexes),
          openTime: serviceScheduleOverrides.openTime,
          closeTime: serviceScheduleOverrides.closeTime,
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
        };
      });

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
  "/:id/public-booking-share-metadata",
  publicShareMetadataLimiter.middleware,
  wrapAsync(async (req: Request, res: Response) => {
    const parsed = publicLeadConfigParamsSchema.safeParse(req.params);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? "Invalid business.");

    const business = await loadAccessiblePublicBookingBusiness(parsed.data.id, req);
    if (!business || business.bookingEnabled !== true) {
      throw new NotFoundError("Online booking is not available for this business.");
    }

    res.json(buildPublicBookingShareMetadataResponse(business));
  })
);

businessesRouter.get(
  "/:id/public-brand-image",
  publicBrandImageLimiter.middleware,
  wrapAsync(async (req: Request, res: Response) => {
    const parsed = publicLeadConfigParamsSchema.safeParse(req.params);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? "Invalid business.");

    const bookingBusiness = await loadAccessiblePublicBookingBusiness(parsed.data.id, req);
    const leadBusiness = bookingBusiness ? null : await loadPublicLeadBusiness(parsed.data.id);
    const logoSource = bookingBusiness?.bookingBrandLogoUrl ?? leadBusiness?.bookingBrandLogoUrl ?? null;
    const asset = resolvePublicBookingBrandImageAsset(logoSource);

    if (!asset) {
      throw new NotFoundError("This business does not have a public brand image.");
    }

    res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");

    if (asset.kind === "redirect") {
      res.redirect(302, asset.url);
      return;
    }

    res.setHeader("Content-Type", asset.contentType);
    res.send(asset.buffer);
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

    const business = await loadAccessiblePublicBookingBusiness(parsedParams.data.id, req);
    if (!business || business.bookingEnabled !== true) {
      throw new NotFoundError("Online booking is not available for this business.");
    }
    const bookingTimezone = business.timezone ?? "America/Los_Angeles";

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
      businessSchedule: resolveBookingSchedule(business),
      baseServiceId: parsedQuery.data.serviceId,
      addonServiceIds,
      services: publicServices,
      addonLinks,
    });
    const requestedServiceMode = resolveCustomerBookingMode({
      serviceMode: selection.serviceMode,
      requestedMode: parsedQuery.data.serviceMode,
    });

    const date = parsePublicBookingDate(parsedQuery.data.date, bookingTimezone);
    const today = startOfLocalDay(new Date(), bookingTimezone);
    const lastAllowedDate = addDays(today, selection.bookingWindowDays - 1, bookingTimezone);
    if (date.getTime() < today.getTime() || date.getTime() > lastAllowedDate.getTime()) {
      throw new BadRequestError("Choose a booking date inside the available window.");
    }
    const bookingSchedule = resolveBookingSchedule(business);
    if (bookingSchedule.blackoutDates.has(toDateKey(date, bookingTimezone))) {
      res.json({
        effectiveFlow: selection.effectiveFlow,
        serviceMode: requestedServiceMode,
        timezone: bookingTimezone,
        date: toDateKey(date, bookingTimezone),
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
        timezone: bookingTimezone,
        date: toDateKey(date, bookingTimezone),
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

    const dayStart = startOfLocalDay(date, bookingTimezone);
    const dayEnd = addDays(dayStart, 1, bookingTimezone);
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
      dailyHours: bookingSchedule.dailyHours,
      timezone: bookingTimezone,
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
        timezone: bookingTimezone,
        date: toDateKey(date, bookingTimezone),
        slots: slots.map((slot) => ({
          startTime: slot.toISOString(),
          label: formatBookingTime(slot, bookingTimezone),
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

    const business = await loadAccessiblePublicBookingBusiness(parsedParams.data.id, req);
    if (!business || business.bookingEnabled !== true) {
      throw new NotFoundError("Online booking is not available for this business.");
    }
    const bookingTimezone = business.timezone ?? "America/Los_Angeles";

    const { services: publicServices, addonLinks } = await listPublicBookingServices(business.id);
    const selection = resolveBookingServicesSelection({
      businessDefaultFlow: business.bookingDefaultFlow,
      businessSchedule: resolveBookingSchedule(business),
      baseServiceId: parsedBody.data.serviceId,
      addonServiceIds: Array.from(new Set(parsedBody.data.addonServiceIds ?? [])),
      services: publicServices,
      addonLinks,
    });
    const requestPolicy = resolvePublicBookingRequestPolicy({
      business,
      service: selection.baseService,
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
    const locationId = cleanOptionalText(parsedBody.data.locationId);
    const serviceAddress = cleanOptionalText(parsedBody.data.serviceAddress);
    const serviceCity = cleanOptionalText(parsedBody.data.serviceCity);
    const serviceState = cleanOptionalText(parsedBody.data.serviceState);
    const serviceZip = cleanOptionalText(parsedBody.data.serviceZip);
    const vehicleSummary = buildVehicleSummary({
      year: vehicleYear,
      make: vehicleMake,
      model: vehicleModel,
    });
    const requestedDate = cleanOptionalText(parsedBody.data.bookingDate);
    const requestedTimeStart = parsedBody.data.startTime
      ? parseOptionalDateTime(parsedBody.data.startTime, "Choose a valid requested time.")
      : null;
    const requestedTimeEnd = parsedBody.data.requestedTimeEnd
      ? parseOptionalDateTime(parsedBody.data.requestedTimeEnd, "Choose a valid requested end time.")
      : requestedTimeStart
        ? new Date(requestedTimeStart.getTime() + selection.durationMinutes * 60 * 1000)
        : null;
    const requestedTimeLabel = cleanOptionalText(parsedBody.data.requestedTimeLabel);
    const requestedFlexibility = requestPolicy.allowFlexibility
      ? normalizeBookingRequestFlexibility(parsedBody.data.flexibility)
      : "same_day_flexible";
    const customerTimezone = cleanOptionalText(parsedBody.data.customerTimezone) ?? bookingTimezone;
    const requestedTimingSummary = buildBookingRequestTimingSummary({
      requestedDate: requestedDate ?? (requestedTimeStart ? toDateKey(requestedTimeStart, bookingTimezone) : null),
      requestedTimeStart,
      requestedTimeEnd,
      requestedTimeLabel,
      timeZone: bookingTimezone,
    });

    if (requestedServiceMode === "mobile" && !serviceAddress) {
      throw new BadRequestError("Add the service address for mobile or on-site bookings.");
    }

    if (requestedServiceMode === "in_shop" && locationId) {
      const activeLocations = await listPublicBookingLocations(business.id);
      const matchesLocation = activeLocations.some((location) => location.id === locationId);
      if (!matchesLocation) {
        throw new BadRequestError("Select a valid booking location.");
      }
    }

    if (selection.effectiveFlow === "request") {
      if (!requestedDate) {
        throw new BadRequestError("Choose the day you want so the shop can review your request.");
      }
      const requestedDateValue = parsePublicBookingDate(requestedDate, bookingTimezone);
      const bookingSchedule = resolveBookingSchedule(business);
      if (bookingSchedule.blackoutDates.has(toDateKey(requestedDateValue, bookingTimezone))) {
        throw new BadRequestError("This date is unavailable for online booking.");
      }
      const requestDaySlots = buildSlotsForDate({
        date: requestedDateValue,
        operatingHours: business.operatingHours,
        durationMinutes: selection.durationMinutes,
        leadTimeHours: selection.leadTimeHours,
        incrementMinutes: bookingSchedule.incrementMinutes,
        availableDayIndexes: selection.availableDayIndexes ?? bookingSchedule.availableDayIndexes,
        openTime: selection.openTime ?? bookingSchedule.openTime,
        closeTime: selection.closeTime ?? bookingSchedule.closeTime,
        dailyHours: bookingSchedule.dailyHours,
        timezone: bookingTimezone,
        now: new Date(),
      });
      if (requestDaySlots.length === 0) {
        throw new BadRequestError("This date is unavailable for online booking.");
      }
      if (requestedTimeStart && !requestDaySlots.some((slot) => slot.getTime() === requestedTimeStart.getTime())) {
        throw new BadRequestError("Choose an available time inside the shop's booking hours.");
      }
      if (requestPolicy.requireExactTime || !requestPolicy.allowTimeWindows) {
        if (!requestedTimeStart) {
          throw new BadRequestError("Choose the exact time you want the shop to review.");
        }
      } else if (!requestedTimeStart && !requestedTimeLabel) {
        throw new BadRequestError("Choose an exact time or a time window so the shop can review the request.");
      }
      if (!requestPolicy.allowTimeWindows && requestedTimeLabel) {
        throw new BadRequestError("This service needs an exact requested time.");
      }
      const nextStepHours = Math.max(1, Math.min(Number(business.automationUncontactedLeadHours ?? 2), 168));
      const existingDraft = draftResumeToken
        ? await findPublicBookingDraftByResumeToken({
            businessId: business.id,
            resumeToken: draftResumeToken,
          })
        : null;
      if (existingDraft && ["submitted_request", "confirmed_booking"].includes(existingDraft.status)) {
        const [existingRequest] = await db
          .select({
            id: bookingRequests.id,
            businessId: bookingRequests.businessId,
            clientId: bookingRequests.clientId,
            appointmentId: bookingRequests.appointmentId,
            status: bookingRequests.status,
            publicTokenVersion: bookingRequests.publicTokenVersion,
          })
          .from(bookingRequests)
          .where(and(eq(bookingRequests.businessId, business.id), eq(bookingRequests.draftId, existingDraft.id)))
          .orderBy(desc(bookingRequests.createdAt))
          .limit(1);
        if (existingRequest) {
          const publicAccess = buildBookingRequestPublicAccess(existingRequest);
          res.status(200).json({
            ok: true,
            accepted: true,
            duplicate: true,
            mode: "request",
            leadId: existingRequest.clientId,
            bookingRequestId: existingRequest.id,
            appointmentId: existingRequest.appointmentId ?? null,
            publicResponseUrl: publicAccess.publicResponseUrl,
          });
          return;
        }
      }

      const duplicateRequest = await findRecentMatchingBookingRequestSubmission({
        businessId: business.id,
        serviceId: selection.baseService.id,
        serviceSummary: selection.serviceSummary,
        serviceMode: requestedServiceMode,
        email,
        phone,
        requestedDate: requestedDate ?? (requestedTimeStart ? toDateKey(requestedTimeStart, bookingTimezone) : null),
        requestedTimeStart,
        requestedTimeLabel,
        notes: customerNotes,
      });
      if (duplicateRequest) {
        const publicAccess = buildBookingRequestPublicAccess(duplicateRequest);
        res.status(200).json({
          ok: true,
          accepted: true,
          duplicate: true,
          mode: "request",
          leadId: duplicateRequest.clientId,
          bookingRequestId: duplicateRequest.id,
          appointmentId: duplicateRequest.appointmentId ?? null,
          publicResponseUrl: publicAccess.publicResponseUrl,
        });
        return;
      }

      const nextLeadNotes = buildLeadNotes({
        status: "new",
        source: normalizedSource,
        serviceInterest: selection.serviceSummary,
        nextStep: `Contact within ${nextStepHours} hour${nextStepHours === 1 ? "" : "s"}`,
        summary: [
          customerNotes,
          requestedTimingSummary ? `Requested timing: ${requestedTimingSummary}` : null,
          requestedFlexibility !== "same_day_flexible"
            ? `Flexibility: ${requestedFlexibility.replace(/_/g, " ")}`
            : null,
          requestedServiceMode === "mobile"
            ? [serviceAddress, serviceCity, serviceState, serviceZip].filter(Boolean).join(", ")
            : null,
          campaign ? `Campaign: ${campaign}` : null,
          "Submitted from the public booking request flow.",
        ]
          .filter(Boolean)
          .join("\n"),
        vehicle: vehicleSummary ?? "",
      });
      const requestedSourceDetail = cleanOptionalText(parsedBody.data.source);
      const nextLeadInternalNotes = [
        "Public booking request",
        `Requested services: ${selection.serviceSummary}`,
        `Service mode: ${requestedServiceMode}`,
        requestedTimingSummary ? `Requested timing: ${requestedTimingSummary}` : null,
        requestedFlexibility !== "same_day_flexible"
          ? `Flexibility: ${requestedFlexibility.replace(/_/g, " ")}`
          : null,
        requestedServiceMode === "in_shop" && locationId ? `Location: ${locationId}` : null,
        campaign ? `Campaign: ${campaign}` : null,
        requestedSourceDetail ? `Source detail: ${requestedSourceDetail}` : null,
      ]
        .filter(Boolean)
        .join("\n");

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
        notes: nextLeadNotes,
        internalNotes: nextLeadInternalNotes,
        marketingOptIn: parsedBody.data.marketingOptIn ?? true,
      });

      const existingLeadRecord = parseLeadRecord(client.notes);
      const mergedLeadInternalNotes = mergeUniqueNoteLines(client.internalNotes, nextLeadInternalNotes);
      let createdLead = client;
      if (client.notes !== nextLeadNotes || mergedLeadInternalNotes !== (client.internalNotes ?? null)) {
        const [updatedLead] = await db
          .update(clients)
          .set({
            notes: nextLeadNotes,
            internalNotes: mergedLeadInternalNotes,
            updatedAt: new Date(),
          })
          .where(and(eq(clients.id, client.id), eq(clients.businessId, business.id)))
          .returning();
        createdLead = updatedLead ?? client;
      }

      const createdVehicle = await findOrCreatePublicVehicle({
        businessId: business.id,
        clientId: createdLead.id,
        year: vehicleYear,
        make: vehicleMake,
        model: vehicleModel,
        color: vehicleColor ?? null,
      });
      const createdVehicleId = createdVehicle?.id ?? null;

      const [createdRequest] = await db
        .insert(bookingRequests)
        .values({
          id: randomUUID(),
          businessId: business.id,
          draftId: existingDraft?.id ?? null,
          clientId: createdLead.id,
          vehicleId: createdVehicleId,
          serviceId: selection.baseService.id,
          locationId: requestedServiceMode === "in_shop" ? locationId ?? null : null,
          status: "submitted_request",
          ownerReviewStatus: "pending",
          customerResponseStatus: "pending",
          serviceMode: requestedServiceMode,
          addonServiceIds: JSON.stringify(selection.addonServices.map((service) => service.id)),
          serviceSummary: selection.serviceSummary,
          requestedDate: requestedDate ?? (requestedTimeStart ? toDateKey(requestedTimeStart, bookingTimezone) : null),
          requestedTimeStart,
          requestedTimeEnd,
          requestedTimeLabel,
          customerTimezone,
          flexibility: requestedFlexibility,
          ownerResponseMessage: null,
          customerResponseMessage: null,
          alternateSlotOptions: "[]",
          clientFirstName: parsedBody.data.firstName.trim(),
          clientLastName: parsedBody.data.lastName.trim(),
          clientEmail: email,
          clientPhone: phone,
          vehicleYear,
          vehicleMake,
          vehicleModel,
          vehicleColor,
          serviceAddress,
          serviceCity,
          serviceState,
          serviceZip,
          notes: customerNotes,
          marketingOptIn: parsedBody.data.marketingOptIn ?? true,
          source: cleanOptionalText(parsedBody.data.source),
          campaign,
          submittedAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      if (!createdRequest) {
        throw new BadRequestError("Could not save this booking request.");
      }

      await createActivityLog({
        businessId: business.id,
        action: "booking.request_created",
        entityType: "booking_request",
        entityId: createdRequest.id,
        metadata: {
          source: normalizedSource,
          campaign,
          bookingFlow: "request",
          serviceMode: requestedServiceMode,
          serviceSummary: selection.serviceSummary,
          requestedTiming: requestedTimingSummary,
          leadId: createdLead.id,
        },
      });

      await createActivityLog({
        businessId: business.id,
        action: "lead.created_from_booking_request",
        entityType: "client",
        entityId: createdLead.id,
        metadata: {
          bookingRequestId: createdRequest.id,
          source: normalizedSource,
          campaign,
          serviceSummary: selection.serviceSummary,
          existingLead: existingLeadRecord.isLead,
        },
      });

      const clientName = `${createdLead.firstName} ${createdLead.lastName}`.trim();
      await safeCreateNotification(
        {
          businessId: business.id,
          type: "new_booking_request",
          title: "New booking request",
          message:
            `${clientName || "A customer"}` +
            (requestedTimingSummary
              ? ` requested ${selection.serviceSummary} for ${requestedTimingSummary}.`
              : ` requested ${selection.serviceSummary}.`),
          entityType: "booking_request",
          entityId: createdRequest.id,
          bucket: "leads",
          dedupeKey: `booking-request-created:${createdRequest.id}`,
          metadata: {
            bookingRequestId: createdRequest.id,
            leadId: createdLead.id,
            leadSource: normalizedSource,
            serviceSummary: selection.serviceSummary,
            requestedTiming: requestedTimingSummary,
            path: `/appointments/requests?request=${encodeURIComponent(createdRequest.id)}`,
          },
        },
        { source: "businesses.public-bookings" }
      );
      await safeCreateNotification(
        {
          businessId: business.id,
          type: "new_lead",
          title: "Booking request became a lead",
          message:
            `${clientName || "A customer"}` +
            (selection.serviceSummary ? ` entered the pipeline for ${selection.serviceSummary}.` : " entered the lead pipeline."),
          entityType: "client",
          entityId: createdLead.id,
          bucket: "leads",
          dedupeKey: `lead-from-booking-request:${createdLead.id}`,
          metadata: {
            bookingRequestId: createdRequest.id,
            leadSource: normalizedSource,
            serviceInterest: selection.serviceSummary,
            path: `/clients/${encodeURIComponent(createdLead.id)}?from=${encodeURIComponent("/leads")}`,
          },
        },
        { source: "businesses.public-bookings.lead" }
      );
      const publicAccess = buildBookingRequestPublicAccess(createdRequest);
      const followUpTasks: Array<Promise<unknown>> = [];
      followUpTasks.push(
        notifyCustomerAboutSubmittedBookingRequest({
          business,
          request: createdRequest,
          requestedTiming: requestedTimingSummary,
          publicResponseUrl: publicAccess.publicResponseUrl,
        }).catch((error) => {
          warnOnce(`booking:request-received:${createdRequest.id}`, "booking request received notification failed", {
            businessId: business.id,
            bookingRequestId: createdRequest.id,
            error: error instanceof Error ? error.message : String(error),
          });
        })
      );

      const followUpRecipient = cleanOptionalText(business.email ?? undefined);
      if (followUpRecipient && isEmailConfigured()) {
        followUpTasks.push(
          sendBookingRequestOwnerAlert({
            to: followUpRecipient,
            businessId: business.id,
            businessName: business.name,
            ownerName: "Team",
            clientName,
            clientEmail: email,
            clientPhone: phone,
            requestedTiming: requestedTimingSummary,
            vehicle: vehicleSummary,
            serviceSummary: selection.serviceSummary,
            flexibility: formatBookingRequestFlexibilityLabel(requestedFlexibility),
            customerMessage: customerNotes,
            requestUrl: buildOwnerBookingRequestAppUrl(createdRequest.id),
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
          bookingRequestId: createdRequest.id,
          bookingFlow: "request",
          serviceSummary: selection.serviceSummary,
        },
      });

      res.status(201).json({
        ok: true,
        accepted: true,
        mode: "request",
        leadId: createdLead.id,
        bookingRequestId: createdRequest.id,
        requestedTiming: requestedTimingSummary,
        publicResponseUrl: publicAccess.publicResponseUrl,
        message: bookingSuccessMessage({
          businessMessage: business.bookingRequestConfirmationCopy ?? business.bookingConfirmationMessage,
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

    const selectedDate = startOfLocalDay(startTime, bookingTimezone);
    const today = startOfLocalDay(new Date(), bookingTimezone);
    const lastAllowedDate = addDays(today, selection.bookingWindowDays - 1, bookingTimezone);
    if (selectedDate.getTime() < today.getTime() || selectedDate.getTime() > lastAllowedDate.getTime()) {
      throw new BadRequestError("Choose a booking date inside the available window.");
    }
    const bookingSchedule = resolveBookingSchedule(business);
    if (bookingSchedule.blackoutDates.has(toDateKey(selectedDate, bookingTimezone))) {
      throw new BadRequestError("This date is unavailable for online booking.");
    }

    const dayStart = startOfLocalDay(startTime, bookingTimezone);
    const dayEnd = addDays(dayStart, 1, bookingTimezone);
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
      dailyHours: bookingSchedule.dailyHours,
      timezone: bookingTimezone,
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
        locationId: requestedServiceMode === "in_shop" ? locationId ?? null : null,
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
        locationId: locationId ?? null,
      },
    });

    await safeCreateNotification(
      {
        businessId: business.id,
        type: "appointment_created",
        title: "New instant booking",
        message:
          `${`${client.firstName} ${client.lastName}`.trim() || "A customer"}` +
          ` booked ${selection.serviceSummary} for ${formatBookingDateTime(startTime, business.timezone)}.`,
        entityType: "appointment",
        entityId: createdAppointment.id,
        bucket: "calendar",
        dedupeKey: `appointment-created:${createdAppointment.id}`,
        metadata: {
          sourceType: "public_booking",
          bookingFlow: "self_book",
          leadClientId: client.id,
          serviceSummary: selection.serviceSummary,
          path: `/appointments/${encodeURIComponent(createdAppointment.id)}`,
        },
      },
      { source: "businesses.public-bookings.self-book" }
    );

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
  "/:id/booking-requests",
  requireAuth,
  requireTenant,
  requirePermission("appointments.read"),
  wrapAsync(async (req: Request, res: Response) => {
    const parsed = publicLeadConfigParamsSchema.safeParse(req.params);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? "Invalid business.");
    const business = await loadBusinessById(parsed.data.id);
    if (!business) throw new NotFoundError("Business not found.");
    if (!req.businessId || req.businessId !== business.id) {
      throw new ForbiddenError("You do not have permission to perform this action.");
    }

    const statusFilter = typeof req.query.status === "string" ? req.query.status.trim() : "";
    const rows = await db
      .select()
      .from(bookingRequests)
      .where(
        and(
          eq(bookingRequests.businessId, business.id),
          statusFilter && (bookingRequestStatuses as readonly string[]).includes(statusFilter)
            ? eq(bookingRequests.status, statusFilter as BookingRequestStatus)
            : sql`true`
        )
      )
      .orderBy(desc(bookingRequests.submittedAt), desc(bookingRequests.createdAt))
      .limit(200);
    const { services: publicServices } = await listPublicBookingServices(business.id);

    const records = await Promise.all(
      rows.map(async (row) => {
        const syncedRow = await syncExpiredBookingRequestState(row);
        return serializeOwnerBookingRequest(syncedRow, business, {
          requestPolicy: resolveRequestPolicyForBookingRequest({
            business,
            request: syncedRow,
            services: publicServices,
          }),
        });
      })
    );

    res.json({ records });
  })
);

businessesRouter.get(
  "/:id/booking-requests/:requestId",
  requireAuth,
  requireTenant,
  requirePermission("appointments.read"),
  wrapAsync(async (req: Request, res: Response) => {
    const parsed = bookingRequestParamsSchema.safeParse(req.params);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? "Invalid booking request.");
    const business = await loadBusinessById(parsed.data.id);
    if (!business) throw new NotFoundError("Business not found.");
    if (!req.businessId || req.businessId !== business.id) {
      throw new ForbiddenError("You do not have permission to perform this action.");
    }

    let bookingRequest = await findBookingRequestById({
      businessId: business.id,
      requestId: parsed.data.requestId,
    });
    if (!bookingRequest) throw new NotFoundError("Booking request not found.");
    bookingRequest = await syncExpiredBookingRequestState(bookingRequest);

    if (normalizeBookingRequestStatus(bookingRequest.status) === "submitted_request") {
      const now = new Date();
      const [updatedBookingRequest] = await db
        .update(bookingRequests)
        .set({
          status: "under_review",
          underReviewAt: bookingRequest.underReviewAt ?? now,
          updatedAt: now,
        })
        .where(and(eq(bookingRequests.id, bookingRequest.id), eq(bookingRequests.businessId, business.id)))
        .returning();

      if (updatedBookingRequest) {
        bookingRequest = updatedBookingRequest;
        await createActivityLog({
          businessId: business.id,
          entityType: "booking_request",
          entityId: bookingRequest.id,
          action: "booking.request_under_review",
          userId: req.userId ?? null,
          metadata: {
            bookingRequestId: bookingRequest.id,
          },
        });
      }
    }

    const { services: publicServices } = await listPublicBookingServices(business.id);

    res.json({
      record: await serializeOwnerBookingRequest(bookingRequest, business, {
        requestPolicy: resolveRequestPolicyForBookingRequest({
          business,
          request: bookingRequest,
          services: publicServices,
        }),
      }),
    });
  })
);

businessesRouter.get(
  "/:id/booking-requests/:requestId/availability-hints",
  requireAuth,
  requireTenant,
  requirePermission("appointments.read"),
  wrapAsync(async (req: Request, res: Response) => {
    const parsedParams = bookingRequestParamsSchema.safeParse(req.params);
    if (!parsedParams.success) throw new BadRequestError(parsedParams.error.issues[0]?.message ?? "Invalid booking request.");
    const parsedQuery = bookingRequestAvailabilityHintsQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) throw new BadRequestError(parsedQuery.error.issues[0]?.message ?? "Invalid availability request.");

    const business = await loadBusinessById(parsedParams.data.id);
    if (!business) throw new NotFoundError("Business not found.");
    if (!req.businessId || req.businessId !== business.id) {
      throw new ForbiddenError("You do not have permission to perform this action.");
    }

    let bookingRequest = await findBookingRequestById({
      businessId: business.id,
      requestId: parsedParams.data.requestId,
    });
    if (!bookingRequest) throw new NotFoundError("Booking request not found.");
    bookingRequest = await syncExpiredBookingRequestState(bookingRequest);

    const bookingTimezone = business.timezone ?? "America/Los_Angeles";
    const requestedDateKey =
      cleanOptionalText(parsedQuery.data.date) ??
      bookingRequest.requestedDate ??
      toDateKey(startOfLocalDay(new Date(), bookingTimezone), bookingTimezone);
    const targetDate = parsePublicBookingDate(requestedDateKey, bookingTimezone);

    const { services: publicServices, addonLinks } = await listPublicBookingServices(business.id);
    const selection = resolveBookingServicesSelection({
      businessDefaultFlow: business.bookingDefaultFlow,
      businessSchedule: resolveBookingSchedule(business),
      baseServiceId: bookingRequest.serviceId ?? "",
      addonServiceIds: parseStoredStringArray(bookingRequest.addonServiceIds),
      services: publicServices,
      addonLinks,
    });

    const today = startOfLocalDay(new Date(), bookingTimezone);
    const lastAllowedDate = addDays(today, selection.bookingWindowDays - 1, bookingTimezone);
    if (targetDate.getTime() < today.getTime() || targetDate.getTime() > lastAllowedDate.getTime()) {
      throw new BadRequestError("Choose a date inside the available booking window.");
    }

    const bookingSchedule = resolveBookingSchedule(business);
    if (bookingSchedule.blackoutDates.has(toDateKey(targetDate, bookingTimezone))) {
      res.json({
        date: toDateKey(targetDate, bookingTimezone),
        timezone: bookingTimezone,
        durationMinutes: selection.durationMinutes,
        slots: [],
      });
      return;
    }

    const dayStart = startOfLocalDay(targetDate, bookingTimezone);
    const dayEnd = addDays(dayStart, 1, bookingTimezone);
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

    const candidateSlots = buildSlotsForDate({
      date: targetDate,
      operatingHours: business.operatingHours,
      durationMinutes: selection.durationMinutes,
      leadTimeHours: selection.leadTimeHours,
      incrementMinutes: bookingSchedule.incrementMinutes,
      availableDayIndexes: selection.availableDayIndexes ?? bookingSchedule.availableDayIndexes,
      openTime: selection.openTime ?? bookingSchedule.openTime,
      closeTime: selection.closeTime ?? bookingSchedule.closeTime,
      dailyHours: bookingSchedule.dailyHours,
      timezone: bookingTimezone,
      now: new Date(),
    })
      .filter((slotStart) =>
        isSlotAvailable({
          slotStart,
          durationMinutes: selection.durationMinutes,
          bufferMinutes: selection.bufferMinutes ?? bookingSchedule.bufferMinutes,
          appointmentCapacity: selection.slotCapacity ?? bookingSchedule.slotCapacity,
          blockCapacity: selection.slotCapacity ?? bookingSchedule.slotCapacity,
          existingRows,
        })
      )
      .slice(0, 18);

    res.json({
      date: toDateKey(targetDate, bookingTimezone),
      timezone: bookingTimezone,
      durationMinutes: selection.durationMinutes,
      slots: candidateSlots.map((slotStart) => {
        const slotEnd = new Date(slotStart.getTime() + selection.durationMinutes * 60 * 1000);
        return {
          startTime: slotStart.toISOString(),
          endTime: slotEnd.toISOString(),
          label: formatBookingRequestAlternateSlotLabel({
            startTime: slotStart,
            endTime: slotEnd,
            timeZone: bookingTimezone,
          }),
        };
      }),
    });
  })
);

businessesRouter.post(
  "/:id/booking-requests/:requestId/approve",
  requireAuth,
  requireTenant,
  requirePermission("appointments.write"),
  wrapAsync(async (req: Request, res: Response) => {
    const parsedParams = bookingRequestParamsSchema.safeParse(req.params);
    if (!parsedParams.success) throw new BadRequestError(parsedParams.error.issues[0]?.message ?? "Invalid booking request.");
    const parsedBody = bookingRequestApproveSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) throw new BadRequestError(parsedBody.error.issues[0]?.message ?? "Invalid approval request.");

    const business = await loadBusinessById(parsedParams.data.id);
    if (!business) throw new NotFoundError("Business not found.");
    if (!req.businessId || req.businessId !== business.id) {
      throw new ForbiddenError("You do not have permission to perform this action.");
    }

    let bookingRequest = await findBookingRequestById({
      businessId: business.id,
      requestId: parsedParams.data.requestId,
    });
    if (!bookingRequest) throw new NotFoundError("Booking request not found.");
    bookingRequest = await syncExpiredBookingRequestState(bookingRequest);
    if (["confirmed", "declined", "expired"].includes(bookingRequest.status)) {
      throw new BadRequestError("This booking request can no longer be approved.");
    }
    if (!bookingRequest.requestedTimeStart) {
      throw new BadRequestError("This request does not have an exact requested time to approve.");
    }

    const { services: publicServices, addonLinks } = await listPublicBookingServices(business.id);
    const selection = resolveBookingServicesSelection({
      businessDefaultFlow: business.bookingDefaultFlow,
      businessSchedule: resolveBookingSchedule(business),
      baseServiceId: bookingRequest.serviceId ?? "",
      addonServiceIds: parseStoredStringArray(bookingRequest.addonServiceIds),
      services: publicServices,
      addonLinks,
    });
    await assertBookableRequestSlot({
      business,
      selection,
      startTime: bookingRequest.requestedTimeStart,
    });

    const { client, vehicle } = await resolveBookingRequestClientAndVehicle({ request: bookingRequest });
    const appointment = await createPublicBookingAppointment({
      business,
      client,
      vehicleId: vehicle?.id ?? null,
      locationId: bookingRequest.locationId ?? null,
      selection,
      startTime: bookingRequest.requestedTimeStart,
      requestedServiceMode: normalizeRequestServiceMode(bookingRequest.serviceMode),
      customerNotes: bookingRequest.notes ?? null,
      serviceAddress: bookingRequest.serviceAddress ?? null,
      serviceCity: bookingRequest.serviceCity ?? null,
      serviceState: bookingRequest.serviceState ?? null,
      serviceZip: bookingRequest.serviceZip ?? null,
      campaign: bookingRequest.campaign ?? null,
      sourceDetail: bookingRequest.source ?? null,
      normalizedSource: normalizeLeadSourceValue(bookingRequest.source),
      activityAction: "booking.request_confirmed",
      activityMetadata: {
        bookingRequestId: bookingRequest.id,
        confirmedFrom: "requested_slot",
      },
      internalNotes: [
        "Approved booking request",
        `Booking flow: request`,
        bookingRequest.serviceSummary ? `Requested services: ${bookingRequest.serviceSummary}` : null,
        `Service mode: ${normalizeBookingServiceMode(bookingRequest.serviceMode)}`,
        parsedBody.data.message?.trim() || null,
        bookingRequest.campaign ? `Campaign: ${bookingRequest.campaign}` : null,
        bookingRequest.source ? `Source detail: ${bookingRequest.source}` : null,
      ],
      sendConfirmationTo: bookingRequest.clientEmail ?? null,
      vehicleSummary: buildVehicleSummary({
        year: bookingRequest.vehicleYear,
        make: bookingRequest.vehicleMake,
        model: bookingRequest.vehicleModel,
      }),
      sourceLeadClientId: client.id,
      sourceBookingRequestId: bookingRequest.id,
      createdByUserId: req.userId ?? null,
    });

    const now = new Date();
    const [updated] = await db
      .update(bookingRequests)
      .set({
        clientId: client.id,
        vehicleId: vehicle?.id ?? null,
        appointmentId: appointment.appointmentId,
        status: "confirmed",
        ownerReviewStatus: "approved_requested_slot",
        customerResponseStatus: "accepted_requested_slot",
        ownerResponseMessage: cleanOptionalText(parsedBody.data.message),
        underReviewAt: bookingRequest.underReviewAt ?? now,
        approvedRequestedSlotAt: now,
        ownerRespondedAt: now,
        customerRespondedAt: now,
        confirmedAt: now,
        updatedAt: now,
      })
      .where(eq(bookingRequests.id, bookingRequest.id))
      .returning();

    await createActivityLog({
      businessId: business.id,
      action: "booking.request_approved",
      entityType: "booking_request",
      entityId: bookingRequest.id,
      metadata: {
        appointmentId: appointment.appointmentId,
        confirmedFrom: "requested_slot",
      },
      userId: req.userId,
    });

    res.json({
      ok: true,
      record: await serializeOwnerBookingRequest(updated ?? bookingRequest, business, {
        requestPolicy: resolvePublicBookingRequestPolicy({
          business,
          service: selection.baseService,
        }),
      }),
      appointmentId: appointment.appointmentId,
      confirmationUrl: appointment.confirmationUrl,
      portalUrl: appointment.portalUrl,
      scheduledFor: appointment.scheduledFor,
    });
  })
);

businessesRouter.post(
  "/:id/booking-requests/:requestId/propose-alternates",
  requireAuth,
  requireTenant,
  requirePermission("appointments.write"),
  wrapAsync(async (req: Request, res: Response) => {
    const parsedParams = bookingRequestParamsSchema.safeParse(req.params);
    if (!parsedParams.success) throw new BadRequestError(parsedParams.error.issues[0]?.message ?? "Invalid booking request.");
    const parsedBody = bookingRequestProposeAlternatesSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) throw new BadRequestError(parsedBody.error.issues[0]?.message ?? "Invalid alternate slot proposal.");

    const business = await loadBusinessById(parsedParams.data.id);
    if (!business) throw new NotFoundError("Business not found.");
    if (!req.businessId || req.businessId !== business.id) {
      throw new ForbiddenError("You do not have permission to perform this action.");
    }

    let bookingRequest = await findBookingRequestById({
      businessId: business.id,
      requestId: parsedParams.data.requestId,
    });
    if (!bookingRequest) throw new NotFoundError("Booking request not found.");
    bookingRequest = await syncExpiredBookingRequestState(bookingRequest);
    if (["confirmed", "declined", "expired"].includes(bookingRequest.status)) {
      throw new BadRequestError("This booking request can no longer be updated.");
    }

    const { services: publicServices, addonLinks } = await listPublicBookingServices(business.id);
    const selection = resolveBookingServicesSelection({
      businessDefaultFlow: business.bookingDefaultFlow,
      businessSchedule: resolveBookingSchedule(business),
      baseServiceId: bookingRequest.serviceId ?? "",
      addonServiceIds: parseStoredStringArray(bookingRequest.addonServiceIds),
      services: publicServices,
      addonLinks,
    });
    const requestPolicy = resolvePublicBookingRequestPolicy({
      business,
      service: selection.baseService,
    });
    if (!requestPolicy.allowAlternateSlots) {
      throw new BadRequestError("This request is set to use approval or a new-time prompt instead of alternate slots.");
    }
    if (parsedBody.data.options.length > requestPolicy.alternateSlotLimit) {
      throw new BadRequestError(`Send up to ${requestPolicy.alternateSlotLimit} alternate time option${requestPolicy.alternateSlotLimit === 1 ? "" : "s"} for this service.`);
    }

    const expiresAt = new Date(
      Date.now() +
        (parsedBody.data.expiresInHours ??
          requestPolicy.alternateOfferExpiryHours ??
          DEFAULT_BOOKING_REQUEST_ALTERNATE_OFFER_EXPIRY_HOURS) *
          60 *
          60 *
          1000
    );
    const validatedOptions: BookingRequestAlternateSlotInput[] = [];
    for (const option of parsedBody.data.options) {
      const startTime = new Date(option.startTime);
      if (Number.isNaN(startTime.getTime())) {
        throw new BadRequestError("One of the alternate slot start times is invalid.");
      }
      const endTime =
        cleanOptionalText(option.endTime) != null
          ? new Date(cleanOptionalText(option.endTime)!)
          : new Date(startTime.getTime() + selection.durationMinutes * 60 * 1000);
      if (Number.isNaN(endTime.getTime()) || endTime.getTime() <= startTime.getTime()) {
        throw new BadRequestError("One of the alternate slot end times is invalid.");
      }
      await assertBookableRequestSlot({
        business,
        selection,
        startTime,
      });
      validatedOptions.push({
        startTime,
        endTime,
        label: cleanOptionalText(option.label) ?? "",
        expiresAt,
      });
    }

    const alternateSlotOptions = toBookingRequestAlternateSlots(validatedOptions, business.timezone ?? "America/Los_Angeles");
    const now = new Date();
    const [updated] = await db
      .update(bookingRequests)
      .set({
        status: "awaiting_customer_selection",
        ownerReviewStatus: "proposed_alternates",
        customerResponseStatus: "pending",
        ownerResponseMessage: cleanOptionalText(parsedBody.data.message),
        alternateSlotOptions: serializeBookingRequestAlternateSlotOptions(alternateSlotOptions),
        underReviewAt: bookingRequest.underReviewAt ?? now,
        ownerRespondedAt: now,
        expiresAt,
        updatedAt: now,
      })
      .where(eq(bookingRequests.id, bookingRequest.id))
      .returning();

    await createActivityLog({
      businessId: business.id,
      action: "booking.request_alternates_proposed",
      entityType: "booking_request",
      entityId: bookingRequest.id,
      metadata: {
        optionCount: alternateSlotOptions.length,
        expiresAt: expiresAt.toISOString(),
      },
      userId: req.userId,
    });
    await safeCreateNotification(
      {
        businessId: business.id,
        type: "booking_request_updated",
        title: "Alternate times sent",
        message: `Alternate times were sent for ${bookingRequest.serviceSummary || "this booking request"}.`,
        entityType: "booking_request",
        entityId: bookingRequest.id,
        bucket: "leads",
        dedupeKey: `booking-request-updated:${bookingRequest.id}:alternates`,
        metadata: {
          bookingRequestId: bookingRequest.id,
          ownerReviewStatus: "proposed_alternates",
          path: `/appointments/requests?request=${encodeURIComponent(bookingRequest.id)}`,
        },
      },
      { source: "businesses.booking-requests.propose-alternates" }
    );

    const effectiveRequest = updated ?? bookingRequest;
    const publicAccess = buildBookingRequestPublicAccess(effectiveRequest);
    notifyCustomerAboutBookingRequestUpdate({
      business,
      request: effectiveRequest,
      requestedTiming: buildBookingRequestTimingSummary({
        requestedDate: effectiveRequest.requestedDate,
        requestedTimeStart: effectiveRequest.requestedTimeStart,
        requestedTimeEnd: effectiveRequest.requestedTimeEnd,
        requestedTimeLabel: effectiveRequest.requestedTimeLabel,
        timeZone: business.timezone ?? "America/Los_Angeles",
      }),
      subjectLine: `Alternate booking times from ${business.name}`,
      eyebrow: "Alternate times",
      title: "The shop sent alternate booking times",
      intro:
        "Your original requested time is being reviewed. Choose one of the alternate options below and the shop will confirm it without making you start over.",
      ownerMessage: cleanOptionalText(parsedBody.data.message),
      alternateOptions: alternateSlotOptions,
      expiresAt,
      nextSteps: "Pick the option that works best, or request another day if none of these fit.",
      ctaLabel: "Review options",
      ctaUrl: publicAccess.publicResponseUrl,
      sendSms: true,
      smsEntityKey: "alternates",
    }).catch((error) => {
      warnOnce(`booking:request-alternates:${bookingRequest.id}`, "booking request alternate email failed", {
        businessId: business.id,
        bookingRequestId: bookingRequest.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    res.json({
      ok: true,
      record: await serializeOwnerBookingRequest(effectiveRequest, business, {
        requestPolicy,
      }),
    });
  })
);

businessesRouter.post(
  "/:id/booking-requests/:requestId/request-new-time",
  requireAuth,
  requireTenant,
  requirePermission("appointments.write"),
  wrapAsync(async (req: Request, res: Response) => {
    const parsedParams = bookingRequestParamsSchema.safeParse(req.params);
    if (!parsedParams.success) throw new BadRequestError(parsedParams.error.issues[0]?.message ?? "Invalid booking request.");
    const parsedBody = bookingRequestAskNewTimeSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) throw new BadRequestError(parsedBody.error.issues[0]?.message ?? "Invalid follow-up request.");

    const business = await loadBusinessById(parsedParams.data.id);
    if (!business) throw new NotFoundError("Business not found.");
    if (!req.businessId || req.businessId !== business.id) {
      throw new ForbiddenError("You do not have permission to perform this action.");
    }

    let bookingRequest = await findBookingRequestById({
      businessId: business.id,
      requestId: parsedParams.data.requestId,
    });
    if (!bookingRequest) throw new NotFoundError("Booking request not found.");
    bookingRequest = await syncExpiredBookingRequestState(bookingRequest);
    if (["confirmed", "declined", "expired"].includes(bookingRequest.status)) {
      throw new BadRequestError("This booking request can no longer be updated.");
    }

    const expiresAt = parsedBody.data.expiresInHours
      ? new Date(Date.now() + parsedBody.data.expiresInHours * 60 * 60 * 1000)
      : null;
    const now = new Date();
    const [updated] = await db
      .update(bookingRequests)
      .set({
        status: "awaiting_customer_selection",
        ownerReviewStatus: "requested_new_time",
        customerResponseStatus: "pending",
        ownerResponseMessage: parsedBody.data.message.trim(),
        alternateSlotOptions: "[]",
        underReviewAt: bookingRequest.underReviewAt ?? now,
        ownerRespondedAt: now,
        expiresAt,
        updatedAt: now,
      })
      .where(eq(bookingRequests.id, bookingRequest.id))
      .returning();

    await createActivityLog({
      businessId: business.id,
      action: "booking.request_customer_prompted_for_new_time",
      entityType: "booking_request",
      entityId: bookingRequest.id,
      metadata: {
        expiresAt: expiresAt?.toISOString() ?? null,
      },
      userId: req.userId,
    });
    await safeCreateNotification(
      {
        businessId: business.id,
        type: "booking_request_updated",
        title: "Customer asked for another time",
        message: `A new time was requested for ${bookingRequest.serviceSummary || "this booking request"}.`,
        entityType: "booking_request",
        entityId: bookingRequest.id,
        bucket: "leads",
        dedupeKey: `booking-request-updated:${bookingRequest.id}:ask-new-time`,
        metadata: {
          bookingRequestId: bookingRequest.id,
          ownerReviewStatus: "requested_new_time",
          path: `/appointments/requests?request=${encodeURIComponent(bookingRequest.id)}`,
        },
      },
      { source: "businesses.booking-requests.request-new-time" }
    );

    const effectiveRequest = updated ?? bookingRequest;
    const publicAccess = buildBookingRequestPublicAccess(effectiveRequest);
    notifyCustomerAboutBookingRequestUpdate({
      business,
      request: effectiveRequest,
      requestedTiming: buildBookingRequestTimingSummary({
        requestedDate: effectiveRequest.requestedDate,
        requestedTimeStart: effectiveRequest.requestedTimeStart,
        requestedTimeEnd: effectiveRequest.requestedTimeEnd,
        requestedTimeLabel: effectiveRequest.requestedTimeLabel,
        timeZone: business.timezone ?? "America/Los_Angeles",
      }),
      subjectLine: `Choose another booking time for ${business.name}`,
      eyebrow: "Need another day",
      title: "The shop asked for another day or time",
      intro:
        "The shop still wants to make this work, but they need you to pick another day or share a different time preference.",
      ownerMessage: parsedBody.data.message.trim(),
      alternateOptionsText: "No alternate slots were included in this update. Use the secure link to send another day or time that works for you.",
      expiresAt,
      expiresAtText: expiresAt ? undefined : "No set deadline",
      nextSteps: "Open the request page, choose another day or time that works, and send it back without re-entering your service details.",
      ctaLabel: "Choose another time",
      ctaUrl: publicAccess.publicResponseUrl,
      sendSms: true,
      smsEntityKey: "choose-another-time",
    }).catch((error) => {
      warnOnce(`booking:request-new-time:${bookingRequest.id}`, "booking request new-time email failed", {
        businessId: business.id,
        bookingRequestId: bookingRequest.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    const { services: publicServices } = await listPublicBookingServices(business.id);
    res.json({
      ok: true,
      record: await serializeOwnerBookingRequest(effectiveRequest, business, {
        requestPolicy: resolveRequestPolicyForBookingRequest({
          business,
          request: effectiveRequest,
          services: publicServices,
        }),
      }),
    });
  })
);

businessesRouter.post(
  "/:id/booking-requests/:requestId/decline",
  requireAuth,
  requireTenant,
  requirePermission("appointments.write"),
  wrapAsync(async (req: Request, res: Response) => {
    const parsedParams = bookingRequestParamsSchema.safeParse(req.params);
    if (!parsedParams.success) throw new BadRequestError(parsedParams.error.issues[0]?.message ?? "Invalid booking request.");
    const parsedBody = bookingRequestDeclineSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) throw new BadRequestError(parsedBody.error.issues[0]?.message ?? "Invalid decline request.");

    const business = await loadBusinessById(parsedParams.data.id);
    if (!business) throw new NotFoundError("Business not found.");
    if (!req.businessId || req.businessId !== business.id) {
      throw new ForbiddenError("You do not have permission to perform this action.");
    }

    let bookingRequest = await findBookingRequestById({
      businessId: business.id,
      requestId: parsedParams.data.requestId,
    });
    if (!bookingRequest) throw new NotFoundError("Booking request not found.");
    bookingRequest = await syncExpiredBookingRequestState(bookingRequest);
    if (["confirmed", "declined", "expired"].includes(bookingRequest.status)) {
      throw new BadRequestError("This booking request can no longer be declined.");
    }

    const now = new Date();
    const [updated] = await db
      .update(bookingRequests)
      .set({
        status: "declined",
        ownerReviewStatus: "declined",
        customerResponseStatus: "declined",
        ownerResponseMessage: cleanOptionalText(parsedBody.data.message),
        underReviewAt: bookingRequest.underReviewAt ?? now,
        ownerRespondedAt: now,
        declinedAt: now,
        expiresAt: null,
        updatedAt: now,
      })
      .where(eq(bookingRequests.id, bookingRequest.id))
      .returning();

    await createActivityLog({
      businessId: business.id,
      action: "booking.request_declined",
      entityType: "booking_request",
      entityId: bookingRequest.id,
      metadata: {
        message: cleanOptionalText(parsedBody.data.message),
      },
      userId: req.userId,
    });
    await safeCreateNotification(
      {
        businessId: business.id,
        type: "booking_request_updated",
        title: "Booking request declined",
        message: `${bookingRequest.serviceSummary || "A booking request"} was declined.`,
        entityType: "booking_request",
        entityId: bookingRequest.id,
        bucket: "leads",
        dedupeKey: `booking-request-updated:${bookingRequest.id}:declined`,
        metadata: {
          bookingRequestId: bookingRequest.id,
          ownerReviewStatus: "declined",
          path: `/appointments/requests?request=${encodeURIComponent(bookingRequest.id)}`,
        },
      },
      { source: "businesses.booking-requests.decline" }
    );

    const effectiveRequest = updated ?? bookingRequest;
    notifyCustomerAboutBookingRequestUpdate({
      business,
      request: effectiveRequest,
      requestedTiming: buildBookingRequestTimingSummary({
        requestedDate: effectiveRequest.requestedDate,
        requestedTimeStart: effectiveRequest.requestedTimeStart,
        requestedTimeEnd: effectiveRequest.requestedTimeEnd,
        requestedTimeLabel: effectiveRequest.requestedTimeLabel,
        timeZone: business.timezone ?? "America/Los_Angeles",
      }),
      subjectLine: `Booking request update from ${business.name}`,
      eyebrow: "Request update",
      title: "This booking request could not be confirmed",
      intro:
        "The shop reviewed your request but could not confirm this booking as submitted. If you still want the work done, contact the shop directly for the next step.",
      ownerMessage: cleanOptionalText(parsedBody.data.message),
      nextSteps: "If you still want to move forward, reach out to the shop directly and they can help with another option.",
    }).catch((error) => {
      warnOnce(`booking:request-declined:${bookingRequest.id}`, "booking request decline email failed", {
        businessId: business.id,
        bookingRequestId: bookingRequest.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    const { services: publicServices } = await listPublicBookingServices(business.id);
    res.json({
      ok: true,
      record: await serializeOwnerBookingRequest(effectiveRequest, business, {
        requestPolicy: resolveRequestPolicyForBookingRequest({
          business,
          request: effectiveRequest,
          services: publicServices,
        }),
      }),
    });
  })
);

businessesRouter.get(
  "/:id/public-booking-requests/:requestId",
  publicBookingRequestViewLimiter.middleware,
  wrapAsync(async (req: Request, res: Response) => {
    const parsedParams = bookingRequestParamsSchema.safeParse(req.params);
    if (!parsedParams.success) throw new BadRequestError(parsedParams.error.issues[0]?.message ?? "Invalid booking request.");
    const parsedQuery = bookingRequestTokenQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) throw new BadRequestError(parsedQuery.error.issues[0]?.message ?? "Invalid request access link.");

    const business = await loadPublicBookingBusiness(parsedParams.data.id);
    if (!business) throw new NotFoundError("Booking request not found.");
    const bookingRequest = await findBookingRequestById({
      businessId: business.id,
      requestId: parsedParams.data.requestId,
    });
    if (!bookingRequest) throw new NotFoundError("Booking request not found.");

    const access = verifyCurrentBookingRequestToken(
      parsedQuery.data.token,
      { requestId: bookingRequest.id, businessId: business.id },
      bookingRequest.publicTokenVersion
    );
    if (!access) throw new ForbiddenError("This booking request link is invalid or expired.");

    const syncedRequest = await syncExpiredBookingRequestState(bookingRequest);
    const { services: publicServices } = await listPublicBookingServices(business.id);
    const requestService = publicServices.find((service) => service.id === syncedRequest.serviceId) ?? null;
    const requestPolicy = requestService
      ? resolvePublicBookingRequestPolicy({
          business,
          service: requestService,
        })
      : undefined;
    let confirmationUrl: string | null = null;
    let portalUrl: string | null = null;
    let scheduledFor: string | null = null;
    if (syncedRequest.appointmentId) {
      const [appointment] = await db
        .select({
          publicTokenVersion: appointments.publicTokenVersion,
          startTime: appointments.startTime,
        })
        .from(appointments)
        .where(and(eq(appointments.id, syncedRequest.appointmentId), eq(appointments.businessId, business.id)))
        .limit(1);
      if (appointment) {
        const links = await buildAppointmentPublicLinks({
          appointmentId: syncedRequest.appointmentId,
          businessId: business.id,
          publicTokenVersion: appointment.publicTokenVersion ?? 1,
        });
        confirmationUrl = links.confirmationUrl;
        portalUrl = links.portalUrl;
        scheduledFor = formatBookingDateTime(appointment.startTime, business.timezone);
      }
    }

    res.json({
      record: serializePublicBookingRequest(syncedRequest, business, { requestPolicy }),
      confirmationUrl,
      portalUrl,
      scheduledFor,
    });
  })
);

businessesRouter.post(
  "/:id/public-booking-requests/:requestId/respond",
  publicBookingRequestRespondLimiter.middleware,
  wrapAsync(async (req: Request, res: Response) => {
    const parsedParams = bookingRequestParamsSchema.safeParse(req.params);
    if (!parsedParams.success) throw new BadRequestError(parsedParams.error.issues[0]?.message ?? "Invalid booking request.");
    const parsedQuery = bookingRequestTokenQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) throw new BadRequestError(parsedQuery.error.issues[0]?.message ?? "Invalid request access link.");
    const parsedBody = publicBookingRequestRespondSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) throw new BadRequestError(parsedBody.error.issues[0]?.message ?? "Invalid request response.");

    const business = await loadPublicBookingBusiness(parsedParams.data.id);
    if (!business) throw new NotFoundError("Booking request not found.");
    let bookingRequest = await findBookingRequestById({
      businessId: business.id,
      requestId: parsedParams.data.requestId,
    });
    if (!bookingRequest) throw new NotFoundError("Booking request not found.");

    const access = verifyCurrentBookingRequestToken(
      parsedQuery.data.token,
      { requestId: bookingRequest.id, businessId: business.id },
      bookingRequest.publicTokenVersion
    );
    if (!access) throw new ForbiddenError("This booking request link is invalid or expired.");

    bookingRequest = await syncExpiredBookingRequestState(bookingRequest);
    if (["confirmed", "declined", "expired"].includes(bookingRequest.status)) {
      throw new BadRequestError("This booking request can no longer be updated.");
    }
    const { services: publicServices } = await listPublicBookingServices(business.id);
    const requestService = publicServices.find((service) => service.id === bookingRequest.serviceId) ?? null;
    const requestPolicy = requestService
      ? resolvePublicBookingRequestPolicy({
          business,
          service: requestService,
        })
      : undefined;

    if (parsedBody.data.action === "decline") {
      const now = new Date();
      const [updated] = await db
        .update(bookingRequests)
        .set({
          status: "declined",
          customerResponseStatus: "declined",
          customerResponseMessage: cleanOptionalText(parsedBody.data.message),
          customerRespondedAt: now,
          declinedAt: now,
          updatedAt: now,
        })
        .where(eq(bookingRequests.id, bookingRequest.id))
        .returning();

      await createActivityLog({
        businessId: business.id,
        action: "booking.request_declined_by_customer",
        entityType: "booking_request",
        entityId: bookingRequest.id,
        metadata: {
          message: cleanOptionalText(parsedBody.data.message),
        },
      });
      await safeCreateNotification(
        {
          businessId: business.id,
          type: "booking_request_updated",
          title: "Customer declined the request",
          message: `${bookingRequest.serviceSummary || "This booking request"} was declined by the customer.`,
          entityType: "booking_request",
          entityId: bookingRequest.id,
          bucket: "leads",
          dedupeKey: `booking-request-updated:${bookingRequest.id}:customer-declined`,
          metadata: {
            bookingRequestId: bookingRequest.id,
            customerResponseStatus: "declined",
            path: `/appointments/requests?request=${encodeURIComponent(bookingRequest.id)}`,
          },
        },
        { source: "businesses.public-booking-requests.decline" }
      );

      res.json({
        ok: true,
        record: serializePublicBookingRequest(updated ?? bookingRequest, business, { requestPolicy }),
      });
      return;
    }

    if (parsedBody.data.action === "request_new_time") {
      const nextRequestedTimeStart = parseOptionalDateTime(
        cleanOptionalText(parsedBody.data.requestedTimeStart),
        "Choose a valid requested time."
      );
      const nextRequestedTimeEnd = parseOptionalDateTime(
        cleanOptionalText(parsedBody.data.requestedTimeEnd),
        "Choose a valid requested end time."
      );
      const nextRequestedDate =
        cleanOptionalText(parsedBody.data.requestedDate) ??
        (nextRequestedTimeStart ? toDateKey(nextRequestedTimeStart, business.timezone ?? "America/Los_Angeles") : null);
      const nextRequestedTimeLabel = cleanOptionalText(parsedBody.data.requestedTimeLabel);
      const effectiveRequireExactTime = requestPolicy?.requireExactTime ?? false;
      const effectiveAllowTimeWindows = requestPolicy?.allowTimeWindows ?? true;
      const effectiveAllowFlexibility = requestPolicy?.allowFlexibility ?? true;
      if (!nextRequestedDate) {
        throw new BadRequestError("Choose the day that works best for you.");
      }
      if (effectiveRequireExactTime || !effectiveAllowTimeWindows) {
        if (!nextRequestedTimeStart) {
          throw new BadRequestError("Choose the exact time you want the shop to review.");
        }
      } else if (!nextRequestedTimeStart && !nextRequestedTimeLabel) {
        throw new BadRequestError("Choose an exact time or a time window so the shop can review it.");
      }
      if (!effectiveAllowTimeWindows && nextRequestedTimeLabel) {
        throw new BadRequestError("This request needs an exact time instead of a time window.");
      }
      if (
        !nextRequestedDate &&
        !nextRequestedTimeStart &&
        !nextRequestedTimeLabel &&
        !cleanOptionalText(parsedBody.data.message)
      ) {
        throw new BadRequestError("Share the next day, time, or note so the shop can help.");
      }

      const now = new Date();
      const [updated] = await db
        .update(bookingRequests)
        .set({
          status: "customer_requested_new_time",
          ownerReviewStatus: "pending",
          customerResponseStatus: "requested_new_time",
          requestedDate: nextRequestedDate,
          requestedTimeStart: nextRequestedTimeStart,
          requestedTimeEnd:
            nextRequestedTimeEnd ??
            (nextRequestedTimeStart && bookingRequest.requestedTimeStart && bookingRequest.requestedTimeEnd
              ? new Date(
                  nextRequestedTimeStart.getTime() +
                    (bookingRequest.requestedTimeEnd.getTime() - bookingRequest.requestedTimeStart.getTime())
                )
              : null),
          requestedTimeLabel: nextRequestedTimeLabel,
          customerTimezone: cleanOptionalText(parsedBody.data.customerTimezone) ?? bookingRequest.customerTimezone ?? business.timezone,
          flexibility: effectiveAllowFlexibility
            ? normalizeBookingRequestFlexibility(parsedBody.data.flexibility ?? bookingRequest.flexibility)
            : "same_day_flexible",
          customerResponseMessage: cleanOptionalText(parsedBody.data.message),
          alternateSlotOptions: "[]",
          customerRespondedAt: now,
          expiresAt: null,
          updatedAt: now,
        })
        .where(eq(bookingRequests.id, bookingRequest.id))
        .returning();

      await createActivityLog({
        businessId: business.id,
        action: "booking.request_customer_requested_new_time",
        entityType: "booking_request",
        entityId: bookingRequest.id,
        metadata: {
          requestedTiming: buildBookingRequestTimingSummary({
            requestedDate: nextRequestedDate,
            requestedTimeStart: nextRequestedTimeStart,
            requestedTimeEnd:
              nextRequestedTimeEnd ??
              (nextRequestedTimeStart && bookingRequest.requestedTimeStart && bookingRequest.requestedTimeEnd
                ? new Date(
                    nextRequestedTimeStart.getTime() +
                      (bookingRequest.requestedTimeEnd.getTime() - bookingRequest.requestedTimeStart.getTime())
                  )
                : null),
            requestedTimeLabel: nextRequestedTimeLabel,
            timeZone: business.timezone ?? "America/Los_Angeles",
          }),
        },
      });
      const effectiveRequest = updated ?? bookingRequest;
      await safeCreateNotification(
        {
          businessId: business.id,
          type: "booking_request_updated",
          title: "Customer sent a new requested time",
          message: `${effectiveRequest.serviceSummary || "This booking request"} now has a new preferred time to review.`,
          entityType: "booking_request",
          entityId: bookingRequest.id,
          bucket: "leads",
          dedupeKey: `booking-request-updated:${bookingRequest.id}:customer-requested-new-time`,
          metadata: {
            bookingRequestId: bookingRequest.id,
            customerResponseStatus: "requested_new_time",
            path: `/appointments/requests?request=${encodeURIComponent(bookingRequest.id)}`,
          },
        },
        { source: "businesses.public-booking-requests.request-new-time" }
      );

      const ownerRecipient = cleanOptionalText(business.email ?? undefined);
      if (ownerRecipient && isEmailConfigured()) {
        sendBookingRequestOwnerAlert({
          to: ownerRecipient,
          businessId: business.id,
          ownerName: "Team",
          businessName: business.name,
          clientName: [effectiveRequest.clientFirstName, effectiveRequest.clientLastName].filter(Boolean).join(" ").trim() || "Customer",
          requestedTiming: buildBookingRequestTimingSummary({
            requestedDate: effectiveRequest.requestedDate,
            requestedTimeStart: effectiveRequest.requestedTimeStart,
            requestedTimeEnd: effectiveRequest.requestedTimeEnd,
            requestedTimeLabel: effectiveRequest.requestedTimeLabel,
            timeZone: business.timezone ?? "America/Los_Angeles",
          }),
          serviceSummary: effectiveRequest.serviceSummary,
          vehicle: buildVehicleSummary({
            year: effectiveRequest.vehicleYear,
            make: effectiveRequest.vehicleMake,
            model: effectiveRequest.vehicleModel,
          }),
          flexibility: formatBookingRequestFlexibilityLabel(effectiveRequest.flexibility),
          clientEmail: effectiveRequest.clientEmail,
          clientPhone: effectiveRequest.clientPhone,
          customerMessage: effectiveRequest.customerResponseMessage,
          requestUrl: buildOwnerBookingRequestAppUrl(effectiveRequest.id),
        }).catch((error) => {
          warnOnce(`booking:request-customer-followup:${bookingRequest.id}`, "booking request owner alert failed after customer follow-up", {
            businessId: business.id,
            bookingRequestId: bookingRequest.id,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }

      res.json({
        ok: true,
        record: serializePublicBookingRequest(effectiveRequest, business, { requestPolicy }),
      });
      return;
    }

    const alternateSlotId = cleanOptionalText(parsedBody.data.alternateSlotId);
    if (!alternateSlotId) {
      throw new BadRequestError("Choose one of the alternate time options to continue.");
    }
    if (normalizeBookingRequestStatus(bookingRequest.status) !== "awaiting_customer_selection") {
      throw new BadRequestError("This booking request is not waiting on an alternate slot choice.");
    }

    const alternateSlotOptions = expireBookingRequestAlternateSlotOptions(
      parseBookingRequestAlternateSlotOptions(bookingRequest.alternateSlotOptions)
    );
    const selectedOption = alternateSlotOptions.find((option) => option.id === alternateSlotId);
    if (!selectedOption || selectedOption.status !== "proposed") {
      throw new BadRequestError("That alternate time is no longer available.");
    }

    const { addonLinks } = await listPublicBookingServices(business.id);
    const selection = resolveBookingServicesSelection({
      businessDefaultFlow: business.bookingDefaultFlow,
      businessSchedule: resolveBookingSchedule(business),
      baseServiceId: bookingRequest.serviceId ?? "",
      addonServiceIds: parseStoredStringArray(bookingRequest.addonServiceIds),
      services: publicServices,
      addonLinks,
    });
    const selectedStartTime = new Date(selectedOption.startTime);
    await assertBookableRequestSlot({
      business,
      selection,
      startTime: selectedStartTime,
    });

    const { client, vehicle } = await resolveBookingRequestClientAndVehicle({ request: bookingRequest });
    const appointment = await createPublicBookingAppointment({
      business,
      client,
      vehicleId: vehicle?.id ?? null,
      locationId: bookingRequest.locationId ?? null,
      selection,
      startTime: selectedStartTime,
      requestedServiceMode: normalizeRequestServiceMode(bookingRequest.serviceMode),
      customerNotes: bookingRequest.notes ?? null,
      serviceAddress: bookingRequest.serviceAddress ?? null,
      serviceCity: bookingRequest.serviceCity ?? null,
      serviceState: bookingRequest.serviceState ?? null,
      serviceZip: bookingRequest.serviceZip ?? null,
      campaign: bookingRequest.campaign ?? null,
      sourceDetail: bookingRequest.source ?? null,
      normalizedSource: normalizeLeadSourceValue(bookingRequest.source),
      activityAction: "booking.request_confirmed",
      activityMetadata: {
        bookingRequestId: bookingRequest.id,
        confirmedFrom: "alternate_slot",
        alternateSlotId,
      },
      internalNotes: [
        "Booking request confirmed from alternate slot",
        bookingRequest.serviceSummary ? `Requested services: ${bookingRequest.serviceSummary}` : null,
        `Service mode: ${normalizeBookingServiceMode(bookingRequest.serviceMode)}`,
        cleanOptionalText(parsedBody.data.message) ?? null,
      ],
      sendConfirmationTo: bookingRequest.clientEmail ?? null,
      vehicleSummary: buildVehicleSummary({
        year: bookingRequest.vehicleYear,
        make: bookingRequest.vehicleMake,
        model: bookingRequest.vehicleModel,
      }),
      sourceLeadClientId: client.id,
      sourceBookingRequestId: bookingRequest.id,
    });

    const now = new Date();
    const updatedOptions = alternateSlotOptions.map((option) =>
      option.id === alternateSlotId
        ? { ...option, status: "accepted" as const }
        : option.status === "proposed"
          ? { ...option, status: "rejected" as const }
          : option
    );
    const [updated] = await db
      .update(bookingRequests)
      .set({
        clientId: client.id,
        vehicleId: vehicle?.id ?? null,
        appointmentId: appointment.appointmentId,
        status: "confirmed",
        customerResponseStatus: "accepted_alternate_slot",
        customerResponseMessage: cleanOptionalText(parsedBody.data.message),
        alternateSlotOptions: serializeBookingRequestAlternateSlotOptions(updatedOptions),
        customerRespondedAt: now,
        confirmedAt: now,
        updatedAt: now,
      })
      .where(eq(bookingRequests.id, bookingRequest.id))
      .returning();

    await createActivityLog({
      businessId: business.id,
      action: "booking.request_customer_selected_alternate",
      entityType: "booking_request",
      entityId: bookingRequest.id,
      metadata: {
        alternateSlotId,
        appointmentId: appointment.appointmentId,
      },
    });
    await safeCreateNotification(
      {
        businessId: business.id,
        type: "booking_request_updated",
        title: "Customer picked an alternate time",
        message: `${bookingRequest.serviceSummary || "This booking request"} was confirmed from an alternate slot.`,
        entityType: "booking_request",
        entityId: bookingRequest.id,
        bucket: "leads",
        dedupeKey: `booking-request-updated:${bookingRequest.id}:alternate-accepted`,
        metadata: {
          bookingRequestId: bookingRequest.id,
          appointmentId: appointment.appointmentId,
          customerResponseStatus: "accepted_alternate_slot",
          path: `/appointments/requests?request=${encodeURIComponent(bookingRequest.id)}`,
        },
      },
      { source: "businesses.public-booking-requests.accept-alternate" }
    );

    notifyOwnerAboutBookingRequestConfirmed({
      business,
      request: updated ?? bookingRequest,
      confirmedTiming: appointment.scheduledFor,
      appointmentId: appointment.appointmentId,
      requestUrl: buildOwnerBookingRequestAppUrl(bookingRequest.id),
    }).catch((error) => {
      warnOnce(`booking:request-confirmed-owner:${bookingRequest.id}`, "booking request owner confirmation email failed", {
        businessId: business.id,
        bookingRequestId: bookingRequest.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    res.json({
      ok: true,
      record: serializePublicBookingRequest(updated ?? bookingRequest, business, { requestPolicy }),
      appointmentId: appointment.appointmentId,
      confirmationUrl: appointment.confirmationUrl,
      portalUrl: appointment.portalUrl,
      scheduledFor: appointment.scheduledFor,
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

businessesRouter.get(
  "/:id/public-lead-share-metadata",
  publicShareMetadataLimiter.middleware,
  wrapAsync(async (req: Request, res: Response) => {
    const parsed = publicLeadConfigParamsSchema.safeParse(req.params);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? "Invalid business.");

    const business = await loadPublicLeadBusiness(parsed.data.id);
    if (!business || !business.leadCaptureEnabled) {
      throw new NotFoundError("Lead capture is not available for this business.");
    }

    res.json(buildPublicLeadShareMetadataResponse(business));
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
    await createActivityLog({
      businessId: business.id,
      action: "lead.created",
      entityType: "client",
      entityId: created.id,
      metadata: {
        source: normalizedSource,
        campaign,
        serviceInterest,
      },
    });

    await safeCreateNotification(
      {
        businessId: business.id,
        type: "new_lead",
        title: "New lead captured",
        message:
          `${created.firstName} ${created.lastName}`.trim() +
          (serviceInterest?.trim() ? ` reached out about ${serviceInterest.trim()}.` : " reached out through the lead form."),
        entityType: "client",
        entityId: created.id,
        bucket: "leads",
        dedupeKey: `lead-created:${created.id}`,
        metadata: {
          leadSource: normalizedSource,
          campaign,
          serviceInterest,
          capturedVia: "public_form",
          path: `/clients/${encodeURIComponent(created.id)}?from=${encodeURIComponent("/leads")}`,
        },
      },
      { source: "businesses.public-leads" }
    );

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
    if (!req.membershipRole || !Array.isArray(req.permissions) || !req.permissions.includes("settings.read")) {
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
  assertBookingDailyHoursValid(parsed.data.bookingDailyHours);
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
      bookingRequestRequireExactTime: parsed.data.bookingRequestRequireExactTime ?? false,
      bookingRequestAllowTimeWindows: parsed.data.bookingRequestAllowTimeWindows ?? true,
      bookingRequestAllowFlexibility: parsed.data.bookingRequestAllowFlexibility ?? true,
      bookingRequestAllowAlternateSlots: parsed.data.bookingRequestAllowAlternateSlots ?? true,
      bookingRequestAlternateSlotLimit:
        normalizeBookingRequestAlternateSlotLimit(parsed.data.bookingRequestAlternateSlotLimit),
      bookingRequestAlternateOfferExpiryHours:
        normalizeBookingRequestAlternateOfferExpiryHours(parsed.data.bookingRequestAlternateOfferExpiryHours ?? null),
      bookingRequestConfirmationCopy: parsed.data.bookingRequestConfirmationCopy?.trim() || null,
      bookingRequestOwnerResponsePageCopy: parsed.data.bookingRequestOwnerResponsePageCopy?.trim() || null,
      bookingRequestAlternateAcceptanceCopy: parsed.data.bookingRequestAlternateAcceptanceCopy?.trim() || null,
      bookingRequestChooseAnotherDayCopy: parsed.data.bookingRequestChooseAnotherDayCopy?.trim() || null,
      bookingTrustBulletPrimary: parsed.data.bookingTrustBulletPrimary?.trim() || null,
      bookingTrustBulletSecondary: parsed.data.bookingTrustBulletSecondary?.trim() || null,
      bookingTrustBulletTertiary: parsed.data.bookingTrustBulletTertiary?.trim() || null,
      bookingNotesPrompt: parsed.data.bookingNotesPrompt?.trim() || null,
      bookingBrandLogoUrl: parsed.data.bookingBrandLogoUrl?.trim() || null,
      bookingBrandLogoTransform:
        parsed.data.bookingBrandLogoTransform != null
          ? serializeBookingBrandLogoTransform(parsed.data.bookingBrandLogoTransform)
          : null,
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
      bookingDailyHours:
        parsed.data.bookingDailyHours !== undefined
          ? serializeBookingDailyHoursForStorage(parsed.data.bookingDailyHours)
          : null,
      bookingBlackoutDates:
        parsed.data.bookingBlackoutDates !== undefined ? JSON.stringify(parsed.data.bookingBlackoutDates) : null,
      bookingSlotIntervalMinutes: parsed.data.bookingSlotIntervalMinutes ?? 15,
      bookingBufferMinutes: parsed.data.bookingBufferMinutes ?? null,
      bookingCapacityPerSlot: parsed.data.bookingCapacityPerSlot ?? null,
      bookingUrgencyEnabled: parsed.data.bookingUrgencyEnabled ?? false,
      bookingUrgencyText: parsed.data.bookingUrgencyText?.trim() || null,
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
  if (parsed.data.bookingRequestRequireExactTime !== undefined) {
    updates.bookingRequestRequireExactTime = parsed.data.bookingRequestRequireExactTime ?? false;
  }
  if (parsed.data.bookingRequestAllowTimeWindows !== undefined) {
    updates.bookingRequestAllowTimeWindows = parsed.data.bookingRequestAllowTimeWindows ?? true;
  }
  if (parsed.data.bookingRequestAllowFlexibility !== undefined) {
    updates.bookingRequestAllowFlexibility = parsed.data.bookingRequestAllowFlexibility ?? true;
  }
  if (parsed.data.bookingRequestAllowAlternateSlots !== undefined) {
    updates.bookingRequestAllowAlternateSlots = parsed.data.bookingRequestAllowAlternateSlots ?? true;
  }
  if (parsed.data.bookingRequestAlternateSlotLimit !== undefined) {
    updates.bookingRequestAlternateSlotLimit = normalizeBookingRequestAlternateSlotLimit(
      parsed.data.bookingRequestAlternateSlotLimit
    );
  }
  if (parsed.data.bookingRequestAlternateOfferExpiryHours !== undefined) {
    updates.bookingRequestAlternateOfferExpiryHours = normalizeBookingRequestAlternateOfferExpiryHours(
      parsed.data.bookingRequestAlternateOfferExpiryHours ?? null
    );
  }
  if (parsed.data.bookingRequestConfirmationCopy !== undefined) {
    updates.bookingRequestConfirmationCopy = parsed.data.bookingRequestConfirmationCopy?.trim() || null;
  }
  if (parsed.data.bookingRequestOwnerResponsePageCopy !== undefined) {
    updates.bookingRequestOwnerResponsePageCopy = parsed.data.bookingRequestOwnerResponsePageCopy?.trim() || null;
  }
  if (parsed.data.bookingRequestAlternateAcceptanceCopy !== undefined) {
    updates.bookingRequestAlternateAcceptanceCopy = parsed.data.bookingRequestAlternateAcceptanceCopy?.trim() || null;
  }
  if (parsed.data.bookingRequestChooseAnotherDayCopy !== undefined) {
    updates.bookingRequestChooseAnotherDayCopy = parsed.data.bookingRequestChooseAnotherDayCopy?.trim() || null;
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
  if (parsed.data.bookingBrandLogoTransform !== undefined) {
    updates.bookingBrandLogoTransform =
      parsed.data.bookingBrandLogoTransform != null
        ? serializeBookingBrandLogoTransform(parsed.data.bookingBrandLogoTransform)
        : null;
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
  if (parsed.data.bookingDailyHours !== undefined) {
    updates.bookingDailyHours = serializeBookingDailyHoursForStorage(parsed.data.bookingDailyHours);
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
  if (parsed.data.bookingUrgencyEnabled !== undefined) {
    updates.bookingUrgencyEnabled = parsed.data.bookingUrgencyEnabled ?? false;
  }
  if (parsed.data.bookingUrgencyText !== undefined) {
    updates.bookingUrgencyText = parsed.data.bookingUrgencyText?.trim() || null;
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
  assertBookingDailyHoursValid(parsed.data.bookingDailyHours);
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

      if (Object.keys(legacyUpdates).length === 0) {
        updated = existing;
      } else {
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
      }
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

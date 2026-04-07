import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { businessMemberships, businesses, clients, users } from "../db/schema.js";
import { and, eq, sql } from "drizzle-orm";
import { NotFoundError, ForbiddenError, BadRequestError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { randomUUID } from "crypto";
import { getBusinessTypeDefaults } from "../lib/businessTypeDefaults.js";
import { roleHasPermission } from "../lib/permissions.js";
import { warnOnce } from "../lib/warnOnce.js";
import { wrapAsync } from "../lib/asyncHandler.js";
import { syncOutboundWebhookConnectionForBusiness } from "../lib/integrations.js";
import { createInMemoryRateLimiter } from "../middleware/security.js";
import { createActivityLog } from "../lib/activity.js";
import { buildLeadNotes } from "../lib/leads.js";
import { enqueueTwilioTemplateSms } from "../lib/twilio.js";
import { isEmailConfigured, isStripeConfigured } from "../lib/env.js";
import { sendLeadAutoResponse, sendLeadFollowUpAlert } from "../lib/email.js";

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

const publicLeadConfigLimiter = createInMemoryRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: "Please try again shortly.",
});

const publicLeadSubmitLimiter = createInMemoryRateLimiter({
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

function isAllowedSubscriptionStatus(status: string | null | undefined): boolean {
  return status === "active" || status === "trialing";
}

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
    if (!isAllowedSubscriptionStatus(business.subscriptionStatus)) {
      return null;
    }
  }
  return business;
}

function cleanOptionalText(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
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
    trialEndsAt: record.trialEndsAt ?? null,
    currentPeriodEnd: record.currentPeriodEnd ?? null,
    stripeConnectAccountId: record.stripeConnectAccountId ?? null,
    stripeConnectDetailsSubmitted: record.stripeConnectDetailsSubmitted ?? false,
    stripeConnectChargesEnabled: record.stripeConnectChargesEnabled ?? false,
    stripeConnectPayoutsEnabled: record.stripeConnectPayoutsEnabled ?? false,
    stripeConnectOnboardedAt: record.stripeConnectOnboardedAt ?? null,
    createdAt: record.createdAt ?? new Date(),
    updatedAt: record.updatedAt ?? new Date(),
  };
}

function serializeBusiness(record: BusinessRecord) {
  let integrationWebhookEvents: string[] = [];
  try {
    integrationWebhookEvents = JSON.parse(record.integrationWebhookEvents ?? "[]") as string[];
  } catch {
    integrationWebhookEvents = [];
  }
  return {
    ...record,
    integrationWebhookEvents,
    reviewRequestUrl: record.reviewRequestUrl ?? null,
    bookingRequestUrl: record.bookingRequestUrl ?? null,
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
          ADD COLUMN IF NOT EXISTS notification_lapsed_client_email_enabled boolean DEFAULT true
      `);
    })().catch((error) => {
      ensureBusinessAutomationColumnsPromise = null;
      throw error;
    });
  }
  await ensureBusinessAutomationColumnsPromise;
}

async function loadBusinessById(id: string): Promise<BusinessRecord | null> {
  try {
    const [business] = await db.select().from(businesses).where(eq(businesses.id, id)).limit(1);
    return business ?? null;
  } catch (error) {
    if (!isBusinessSchemaDriftError(error)) throw error;
    try {
      await ensureBusinessAutomationColumns();
      const [business] = await db.select().from(businesses).where(eq(businesses.id, id)).limit(1);
      return business ?? null;
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
    return legacyBusiness ? coerceBusinessRecord(legacyBusiness) : null;
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

    const normalizedSource = (() => {
      const source = (parsedBody.data.source ?? "").trim().toLowerCase();
      if (!source) return "website";
      if (["website", "phone", "walk_in", "referral", "instagram", "facebook", "google", "repeat_customer", "other"].includes(source)) {
        return source;
      }
      if (source.includes("instagram")) return "instagram";
      if (source.includes("facebook")) return "facebook";
      if (source.includes("google")) return "google";
      if (source.includes("referral")) return "referral";
      if (source.includes("phone")) return "phone";
      return "website";
    })() as Parameters<typeof buildLeadNotes>[0]["source"];

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
      integrationWebhookEnabled: parsed.data.integrationWebhookEnabled ?? false,
      integrationWebhookUrl: parsed.data.integrationWebhookUrl ?? null,
      integrationWebhookSecret: parsed.data.integrationWebhookSecret ?? null,
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
      webhookSecret: created.integrationWebhookSecret ?? null,
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
  if (parsed.data.integrationWebhookEnabled !== undefined) {
    updates.integrationWebhookEnabled = parsed.data.integrationWebhookEnabled ?? false;
  }
  if (parsed.data.integrationWebhookUrl !== undefined) {
    updates.integrationWebhookUrl = parsed.data.integrationWebhookUrl ?? null;
  }
  if (parsed.data.integrationWebhookSecret !== undefined) {
    updates.integrationWebhookSecret = parsed.data.integrationWebhookSecret ?? null;
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
      webhookSecret: updated.integrationWebhookSecret ?? null,
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
  res.json(serializeBusiness(updated));
}));

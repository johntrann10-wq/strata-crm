import crypto from "crypto";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { businesses, clients, integrationConnections, notificationLogs } from "../db/schema.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "./errors.js";
import type { TemplateVars } from "./email.js";
import { resolveTemplateMessage } from "./email.js";
import {
  disconnectBusinessIntegrationConnection,
  getBusinessIntegrationConnection,
  readConnectionAccessToken,
  readConnectionConfig,
  upsertBusinessIntegrationConnection,
  type IntegrationConnectionRecord,
} from "./integrationConnections.js";
import {
  enqueueIntegrationJob,
  markIntegrationJobFailed,
  markIntegrationJobSucceeded,
  type IntegrationJobRecord,
} from "./integrationJobs.js";
import { createIntegrationAuditLog } from "./integrationAudit.js";
import { logger } from "./logger.js";
import { createActivityLog } from "./activity.js";
import { buildLeadNotes, parseLeadRecord } from "./leads.js";

const TWILIO_PROVIDER = "twilio_sms";
const TWILIO_API_BASE = "https://api.twilio.com/2010-04-01";
const TWILIO_MESSAGING_BASE = "https://messaging.twilio.com/v1";

export const TWILIO_TEMPLATE_SLUGS = [
  "lead_auto_response",
  "missed_call_text_back",
  "appointment_confirmation",
  "booking_request_received",
  "booking_request_customer_update",
  "appointment_reminder",
  "payment_receipt",
  "review_request",
  "lapsed_client_reengagement",
] as const;

export type TwilioTemplateSlug = (typeof TWILIO_TEMPLATE_SLUGS)[number];

export type TwilioConnectionConfig = {
  accountSid: string;
  messagingServiceSid: string;
  enabledTemplateSlugs: TwilioTemplateSlug[];
  cooldownMinutes: Partial<Record<TwilioTemplateSlug, number>>;
};

type TwilioMessageResponse = {
  sid: string;
  status: string;
  error_code: number | null;
  error_message: string | null;
  to: string;
};

type TwilioMessageJobPayload = {
  templateSlug: TwilioTemplateSlug;
  to: string;
  vars: TemplateVars;
  entityType: string;
  entityId: string;
  subject?: string | null;
};

const DEFAULT_TWILIO_TEMPLATE_SELECTION: TwilioTemplateSlug[] = [
  "lead_auto_response",
  "missed_call_text_back",
  "appointment_confirmation",
  "booking_request_received",
  "booking_request_customer_update",
  "appointment_reminder",
  "review_request",
  "lapsed_client_reengagement",
];

const DEFAULT_TWILIO_COOLDOWNS: Record<TwilioTemplateSlug, number> = {
  lead_auto_response: 30,
  missed_call_text_back: 30,
  appointment_confirmation: 15,
  booking_request_received: 5,
  booking_request_customer_update: 5,
  appointment_reminder: 180,
  payment_receipt: 15,
  review_request: 24 * 60,
  lapsed_client_reengagement: 30 * 24 * 60,
};

function isTwilioTemplateSlug(value: string): value is TwilioTemplateSlug {
  return (TWILIO_TEMPLATE_SLUGS as readonly string[]).includes(value);
}

function getApiBase(): string {
  const value = process.env.API_BASE?.trim();
  if (!value) throw new BadRequestError("API_BASE is required for Twilio callbacks.");
  return value.replace(/\/+$/, "");
}

export function isTwilioConfigured() {
  return !!process.env.API_BASE?.trim();
}

function getTwilioCallbackUrl(connectionId: string) {
  return `${getApiBase()}/api/integrations/twilio/status/${encodeURIComponent(connectionId)}`;
}

function buildTwilioBasicAuth(accountSid: string, authToken: string) {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
}

function parseTwilioTemplateSelection(values: string[] | undefined): TwilioTemplateSlug[] {
  const source = values === undefined ? DEFAULT_TWILIO_TEMPLATE_SELECTION : values;
  return Array.from(new Set(source.filter((value): value is TwilioTemplateSlug => isTwilioTemplateSlug(value))));
}

function parseTwilioCooldowns(
  input: Partial<Record<TwilioTemplateSlug, number>> | undefined
): Partial<Record<TwilioTemplateSlug, number>> {
  const next: Partial<Record<TwilioTemplateSlug, number>> = {};
  for (const slug of TWILIO_TEMPLATE_SLUGS) {
    const value = Number(input?.[slug] ?? DEFAULT_TWILIO_COOLDOWNS[slug]);
    next[slug] = Math.max(1, Math.min(Number.isFinite(value) ? value : DEFAULT_TWILIO_COOLDOWNS[slug], 60 * 24 * 180));
  }
  return next;
}

function normalizeTwilioConfig(input: {
  accountSid: string;
  messagingServiceSid: string;
  enabledTemplateSlugs?: string[];
  cooldownMinutes?: Partial<Record<TwilioTemplateSlug, number>>;
}): TwilioConnectionConfig {
  const accountSid = input.accountSid.trim();
  const messagingServiceSid = input.messagingServiceSid.trim();
  if (!/^AC[0-9a-fA-F]{32}$/.test(accountSid)) {
    throw new BadRequestError("Twilio Account SID must look like AC...");
  }
  if (!/^MG[0-9a-fA-F]{32}$/.test(messagingServiceSid)) {
    throw new BadRequestError("Twilio Messaging Service SID must look like MG...");
  }
  return {
    accountSid,
    messagingServiceSid,
    enabledTemplateSlugs: parseTwilioTemplateSelection(input.enabledTemplateSlugs),
    cooldownMinutes: parseTwilioCooldowns(input.cooldownMinutes),
  };
}

function getTwilioAuthToken(connection: IntegrationConnectionRecord) {
  const token = readConnectionAccessToken(connection);
  if (!token) throw new BadRequestError("Twilio auth token is unavailable.");
  return token;
}

function getTwilioConfig(connection: IntegrationConnectionRecord) {
  const config = readConnectionConfig<TwilioConnectionConfig>(connection);
  if (!config?.accountSid || !config.messagingServiceSid) {
    throw new BadRequestError("Twilio configuration is incomplete.");
  }
  return {
    ...config,
    enabledTemplateSlugs: parseTwilioTemplateSelection(config.enabledTemplateSlugs),
    cooldownMinutes: parseTwilioCooldowns(config.cooldownMinutes),
  };
}

async function twilioRequest<T>(
  connection: Pick<IntegrationConnectionRecord, "id" | "businessId" | "encryptedAccessToken" | "encryptedConfig">,
  path: string,
  init?: RequestInit,
  body?: URLSearchParams
) {
  const config = getTwilioConfig(connection as IntegrationConnectionRecord);
  const authToken = getTwilioAuthToken(connection as IntegrationConnectionRecord);
  const url = path.startsWith("https://") ? path : `${TWILIO_API_BASE}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: buildTwilioBasicAuth(config.accountSid, authToken),
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
    body: body ? body.toString() : init?.body,
  });
  const bodyText = await response.text();
  if (!response.ok) {
    throw new BadRequestError(`Twilio API request failed: ${bodyText || response.statusText}`);
  }
  return bodyText ? (JSON.parse(bodyText) as T) : ({} as T);
}

async function fetchTwilioMessagingServiceWithCredentials(config: TwilioConnectionConfig, authToken: string) {
  const response = await fetch(`${TWILIO_MESSAGING_BASE}/Services/${encodeURIComponent(config.messagingServiceSid)}`, {
    headers: {
      Authorization: buildTwilioBasicAuth(config.accountSid, authToken),
      Accept: "application/json",
    },
  });
  const bodyText = await response.text();
  if (!response.ok) {
    throw new BadRequestError(`Twilio API request failed: ${bodyText || response.statusText}`);
  }
  return bodyText
    ? (JSON.parse(bodyText) as { sid: string; friendly_name?: string; account_sid?: string })
    : ({ sid: config.messagingServiceSid } as { sid: string; friendly_name?: string; account_sid?: string });
}

export function normalizePhoneToE164(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+") && /^\+\d{10,15}$/.test(digits)) return digits;
  const numeric = raw.replace(/\D/g, "");
  if (numeric.length === 10) return `+1${numeric}`;
  if (numeric.length === 11 && numeric.startsWith("1")) return `+${numeric}`;
  return null;
}

export function shouldQueueMissedCallTextBack(params: Record<string, string>) {
  const direction = String(params.Direction ?? params.CallDirection ?? "").toLowerCase();
  if (!direction.includes("inbound")) return false;

  const status = String(params.DialCallStatus ?? params.CallStatus ?? "").toLowerCase();
  if (["busy", "no-answer", "failed", "canceled"].includes(status)) return true;

  if (status === "completed") {
    const duration = Number(params.CallDuration ?? params.Duration ?? "0");
    return !Number.isFinite(duration) || duration <= 0;
  }

  return false;
}

function getFrontendBase() {
  const value = process.env.FRONTEND_URL?.trim();
  return value ? value.replace(/\/+$/, "") : null;
}

function buildMissedCallRequestUrl(business: {
  id: string;
  leadCaptureEnabled: boolean | null;
  bookingRequestUrl: string | null;
}) {
  if (business.leadCaptureEnabled) {
    const base = getFrontendBase();
    if (base) return `${base}/lead/${business.id}?source=phone&campaign=missed_call`;
  }
  const bookingRequestUrl = business.bookingRequestUrl?.trim();
  return bookingRequestUrl || null;
}

function buildMissedCallSummary(callSid: string, calledAt: Date) {
  return `Missed inbound call on ${calledAt.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })} (call ${callSid}).`;
}

function appendInternalNote(existing: string | null | undefined, nextLine: string) {
  const current = String(existing ?? "").trim();
  return current ? `${current}\n${nextLine}` : nextLine;
}

async function findClientByNormalizedPhone(businessId: string, phoneE164: string) {
  const digits = phoneE164.replace(/\D/g, "");
  const [record] = await db
    .select()
    .from(clients)
    .where(
      and(
        eq(clients.businessId, businessId),
        isNull(clients.deletedAt),
        sql`regexp_replace(coalesce(${clients.phone}, ''), '[^0-9]', '', 'g') = ${digits}`
      )
    )
    .orderBy(desc(clients.updatedAt))
    .limit(1);
  return record ?? null;
}

function getCallerNameParts(callerName: string | undefined, phoneE164: string) {
  const trimmed = callerName?.trim() ?? "";
  if (!trimmed) {
    const last4 = phoneE164.replace(/\D/g, "").slice(-4) || "call";
    return { firstName: "Inbound", lastName: `Caller ${last4}` };
  }
  const [firstName, ...rest] = trimmed.split(/\s+/);
  return {
    firstName: firstName || "Inbound",
    lastName: rest.join(" ") || "Caller",
  };
}

async function upsertMissedCallLead(input: {
  businessId: string;
  phoneE164: string;
  callerName: string | undefined;
  nextStepHours: number;
  callSid: string;
  requestUrl: string | null;
}) {
  const existingClient = await findClientByNormalizedPhone(input.businessId, input.phoneE164);
  const summary = buildMissedCallSummary(input.callSid, new Date());
  const nextStep = `Return missed call within ${input.nextStepHours} hour${input.nextStepHours === 1 ? "" : "s"}`;

  if (!existingClient) {
    const caller = getCallerNameParts(input.callerName, input.phoneE164);
    const [created] = await db
      .insert(clients)
      .values({
        businessId: input.businessId,
        firstName: caller.firstName,
        lastName: caller.lastName,
        phone: input.phoneE164,
        notes: buildLeadNotes({
          status: "new",
          source: "phone",
          serviceInterest: "",
          nextStep,
          summary,
          vehicle: "",
        }),
        internalNotes: appendInternalNote(null, "Missed call text-back triggered."),
        marketingOptIn: false,
      })
      .returning();
    if (!created) throw new BadRequestError("Could not create a missed-call lead.");
    return { client: created, created: true, leadCaptured: true };
  }

  const existingLead = parseLeadRecord(existingClient.notes);
  const hasStructuredLead = !!(existingClient.notes?.includes("Lead status:") && existingClient.notes?.includes("Lead source:"));
  let nextNotes = existingClient.notes;
  let leadCaptured = false;

  if (!hasStructuredLead && !String(existingClient.notes ?? "").trim()) {
    nextNotes = buildLeadNotes({
      status: "new",
      source: "phone",
      serviceInterest: "",
      nextStep,
      summary,
      vehicle: "",
    });
    leadCaptured = true;
  } else if (hasStructuredLead && existingLead.status !== "converted") {
    nextNotes = buildLeadNotes({
      status: existingLead.status === "lost" ? "new" : existingLead.status,
      source: existingLead.source || "phone",
      serviceInterest: existingLead.serviceInterest,
      nextStep,
      summary: [existingLead.summary, summary].filter(Boolean).join("\n"),
      vehicle: existingLead.vehicle,
      firstContactedAt: existingLead.firstContactedAt,
    });
    leadCaptured = true;
  }

  const [updated] = await db
    .update(clients)
    .set({
      phone: existingClient.phone ?? input.phoneE164,
      notes: nextNotes,
      internalNotes: appendInternalNote(existingClient.internalNotes, "Missed call text-back triggered."),
      updatedAt: new Date(),
    })
    .where(eq(clients.id, existingClient.id))
    .returning();
  if (!updated) throw new BadRequestError("Could not update the caller record.");
  return { client: updated, created: false, leadCaptured };
}

function getTwilioMessageStatusTone(status: string | null | undefined) {
  const normalized = String(status ?? "").toLowerCase();
  return ["delivered", "sent", "queued", "accepted", "scheduled", "sending"].includes(normalized)
    ? "ok"
    : normalized
      ? "error"
      : "pending";
}

async function isCooldownActive(input: {
  businessId: string;
  templateSlug: TwilioTemplateSlug;
  recipient: string;
  entityType: string;
  entityId: string;
  cooldownMinutes: number;
}) {
  const since = new Date(Date.now() - input.cooldownMinutes * 60 * 1000);
  const [existing] = await db
    .select({ id: notificationLogs.id })
    .from(notificationLogs)
    .where(
      and(
        eq(notificationLogs.businessId, input.businessId),
        eq(notificationLogs.channel, "sms"),
        eq(notificationLogs.recipient, input.recipient),
        gte(notificationLogs.sentAt, since),
        isNull(notificationLogs.error),
        sql`coalesce(${notificationLogs.metadata}::json->>'templateSlug', '') = ${input.templateSlug}`,
        sql`coalesce(${notificationLogs.metadata}::json->>'entityType', '') = ${input.entityType}`,
        sql`coalesce(${notificationLogs.metadata}::json->>'entityId', '') = ${input.entityId}`
      )
    )
    .limit(1);
  return !!existing;
}

async function getOrCreateSmsNotificationLog(input: {
  businessId: string;
  integrationJobId: string;
  recipient: string;
  subject: string | null;
  metadata: Record<string, unknown>;
}) {
  const [existing] = await db
    .select()
    .from(notificationLogs)
    .where(eq(notificationLogs.integrationJobId, input.integrationJobId))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(notificationLogs)
    .values({
      businessId: input.businessId,
      integrationJobId: input.integrationJobId,
      channel: "sms",
      recipient: input.recipient,
      subject: input.subject,
      metadata: JSON.stringify(input.metadata),
      providerStatus: "pending",
      providerStatusAt: new Date(),
    })
    .returning();

  if (!created) throw new BadRequestError("Could not create SMS notification log.");
  return created;
}

async function updateTwilioConnectionState(
  connectionId: string,
  patch: Partial<Pick<typeof integrationConnections.$inferInsert, "lastSuccessfulAt" | "lastError" | "status" | "actionRequired" | "updatedAt">>
) {
  await db
    .update(integrationConnections)
    .set({
      ...patch,
      updatedAt: new Date(),
    })
    .where(eq(integrationConnections.id, connectionId));
}

function buildTwilioSignature(url: string, params: Record<string, string>, authToken: string) {
  const payload =
    url +
    Object.keys(params)
      .sort()
      .map((key) => `${key}${params[key]}`)
      .join("");
  return crypto.createHmac("sha1", authToken).update(payload, "utf8").digest("base64");
}

export function validateTwilioWebhookSignature(input: {
  url: string;
  params: Record<string, string>;
  signature: string | undefined;
  authToken: string;
}) {
  if (!input.signature?.trim()) return false;
  const expected = buildTwilioSignature(input.url, input.params, input.authToken);
  const provided = input.signature.trim();
  if (Buffer.byteLength(expected) !== Buffer.byteLength(provided)) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

export async function connectTwilioBusiness(input: {
  businessId: string;
  userId: string;
  accountSid: string;
  authToken?: string | null;
  messagingServiceSid: string;
  enabledTemplateSlugs?: string[];
}) {
  const existing = await getBusinessIntegrationConnection(input.businessId, TWILIO_PROVIDER);
  const persistedToken = existing ? readConnectionAccessToken(existing) : null;
  const authToken = input.authToken?.trim() || persistedToken;
  if (!authToken) {
    throw new BadRequestError("Twilio Auth Token is required the first time you connect.");
  }

  const config = normalizeTwilioConfig({
    accountSid: input.accountSid,
    messagingServiceSid: input.messagingServiceSid,
    enabledTemplateSlugs: input.enabledTemplateSlugs,
  });
  const service = await fetchTwilioMessagingServiceWithCredentials(config, authToken);

  const connection = await upsertBusinessIntegrationConnection({
    businessId: input.businessId,
    provider: TWILIO_PROVIDER,
    status: "connected",
    displayName: service.friendly_name?.trim() || "Twilio Messaging Service",
    externalAccountId: config.accountSid,
    externalAccountName: service.friendly_name?.trim() || "Twilio",
    accessToken: authToken,
    config,
    scopes: [],
    connectedAt: existing?.connectedAt ?? new Date(),
    disconnectedAt: null,
    lastError: null,
    actionRequired: null,
  });
  if (!connection) throw new BadRequestError("Could not connect Twilio.");

  await createIntegrationAuditLog({
    businessId: input.businessId,
    provider: TWILIO_PROVIDER,
    action: "connected",
    userId: input.userId,
    metadata: {
      accountSid: config.accountSid,
      messagingServiceSid: config.messagingServiceSid,
      enabledTemplateSlugs: config.enabledTemplateSlugs,
      connectionId: connection.id,
    },
  });

  return connection;
}

export async function disconnectTwilioBusiness(businessId: string, userId: string) {
  const record = await disconnectBusinessIntegrationConnection(businessId, TWILIO_PROVIDER);
  if (!record) return null;
  await createIntegrationAuditLog({
    businessId,
    provider: TWILIO_PROVIDER,
    action: "disconnected",
    userId,
    metadata: { connectionId: record.id },
  });
  return record;
}

export async function enqueueTwilioTemplateSms(input: {
  businessId: string;
  userId?: string | null;
  templateSlug: TwilioTemplateSlug;
  to: string | null | undefined;
  vars: TemplateVars;
  entityType: string;
  entityId: string;
}) {
  const connection = await getBusinessIntegrationConnection(input.businessId, TWILIO_PROVIDER);
  if (!connection || connection.status !== "connected") {
    return { queued: false, reason: "not_connected" as const };
  }

  const config = getTwilioConfig(connection);
  if (!config.enabledTemplateSlugs.includes(input.templateSlug)) {
    return { queued: false, reason: "template_disabled" as const };
  }

  const to = normalizePhoneToE164(String(input.to ?? ""));
  if (!to) {
    return { queued: false, reason: "invalid_phone" as const };
  }

  const cooldownMinutes = config.cooldownMinutes[input.templateSlug] ?? DEFAULT_TWILIO_COOLDOWNS[input.templateSlug];
  if (
    await isCooldownActive({
      businessId: input.businessId,
      templateSlug: input.templateSlug,
      recipient: to,
      entityType: input.entityType,
      entityId: input.entityId,
      cooldownMinutes,
    })
  ) {
    return { queued: false, reason: "cooldown" as const };
  }

  const job = await enqueueIntegrationJob({
    businessId: input.businessId,
    provider: TWILIO_PROVIDER,
    connectionId: connection.id,
    jobType: "message.send",
    idempotencyKey: `sms:${input.templateSlug}:${input.entityType}:${input.entityId}:${to}`,
    payload: {
      templateSlug: input.templateSlug,
      to,
      vars: input.vars,
      entityType: input.entityType,
      entityId: input.entityId,
    } satisfies TwilioMessageJobPayload,
    createdByUserId: input.userId ?? null,
  });

  return {
    queued: !!job,
    reason: job ? ("queued" as const) : ("duplicate" as const),
    jobId: job?.id ?? null,
  };
}

export async function runTwilioIntegrationJob(job: IntegrationJobRecord) {
  const payload = JSON.parse(job.payload ?? "{}") as Partial<TwilioMessageJobPayload>;
  if (!payload.templateSlug || !isTwilioTemplateSlug(payload.templateSlug)) {
    await markIntegrationJobFailed(job, new Error("Twilio job payload is missing a valid template slug."));
    return;
  }
  if (!payload.to || !payload.entityType || !payload.entityId) {
    await markIntegrationJobFailed(job, new Error("Twilio job payload is incomplete."));
    return;
  }

  const connection = await getBusinessIntegrationConnection(job.businessId, TWILIO_PROVIDER);
  if (!connection || connection.status !== "connected") {
    await markIntegrationJobFailed(job, new Error("Twilio is not connected for this business."));
    return;
  }

  const config = getTwilioConfig(connection);
  if (!config.enabledTemplateSlugs.includes(payload.templateSlug)) {
    await markIntegrationJobSucceeded(job.id, { skipped: true, reason: "template_disabled" }, {});
    return;
  }

  const message = await resolveTemplateMessage({
    templateSlug: payload.templateSlug,
    businessId: job.businessId,
    vars: payload.vars ?? {},
    subject: payload.subject ?? undefined,
  });
  const body = message.bodyText.replace(/\s+\n/g, "\n").trim();
  if (!body) {
    await markIntegrationJobFailed(job, new Error("Twilio SMS body rendered empty."));
    return;
  }

  const log = await getOrCreateSmsNotificationLog({
    businessId: job.businessId,
    integrationJobId: job.id,
    recipient: payload.to,
    subject: message.subject,
    metadata: {
      templateSlug: payload.templateSlug,
      vars: payload.vars ?? {},
      entityType: payload.entityType,
      entityId: payload.entityId,
      deliveryTone: getTwilioMessageStatusTone(null),
    },
  });

  if (log.providerMessageId) {
    await markIntegrationJobSucceeded(job.id, { skipped: true, reason: "already_sent", providerMessageId: log.providerMessageId }, {});
    return;
  }

  try {
    const response = await twilioRequest<TwilioMessageResponse>(
      connection,
      `/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`,
      { method: "POST" },
      new URLSearchParams({
        To: payload.to,
        Body: body,
        MessagingServiceSid: config.messagingServiceSid,
        StatusCallback: getTwilioCallbackUrl(connection.id),
      })
    );

    await db
      .update(notificationLogs)
      .set({
        providerMessageId: response.sid,
        providerStatus: response.status,
        providerStatusAt: new Date(),
        providerErrorCode: response.error_code != null ? String(response.error_code) : null,
        error: response.error_message ?? null,
        metadata: JSON.stringify({
          templateSlug: payload.templateSlug,
          vars: payload.vars ?? {},
          entityType: payload.entityType,
          entityId: payload.entityId,
          deliveryTone: getTwilioMessageStatusTone(response.status),
        }),
      })
      .where(eq(notificationLogs.id, log.id));

    await updateTwilioConnectionState(connection.id, {
      lastSuccessfulAt: new Date(),
      lastError: null,
      status: "connected",
      actionRequired: null,
    });

    await markIntegrationJobSucceeded(
      job.id,
      {
        to: payload.to,
        templateSlug: payload.templateSlug,
      },
      {
        sid: response.sid,
        status: response.status,
      }
    );
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    await db
      .update(notificationLogs)
      .set({
        error: messageText,
        providerStatus: "failed",
        providerStatusAt: new Date(),
        metadata: JSON.stringify({
          templateSlug: payload.templateSlug,
          vars: payload.vars ?? {},
          entityType: payload.entityType,
          entityId: payload.entityId,
          deliveryTone: getTwilioMessageStatusTone("failed"),
        }),
      })
      .where(eq(notificationLogs.id, log.id));

    await updateTwilioConnectionState(connection.id, {
      lastError: messageText,
      status: "error",
      actionRequired: "Check Twilio credentials, messaging service status, or callback health.",
    });

    await markIntegrationJobFailed(
      job,
      error,
      {
        to: payload.to,
        templateSlug: payload.templateSlug,
      },
      { notificationLogId: log.id }
    );
  }
}

export async function handleTwilioStatusCallback(input: {
  connectionId: string;
  signature: string | undefined;
  params: Record<string, string>;
}) {
  const [connection] = await db
    .select()
    .from(integrationConnections)
    .where(and(eq(integrationConnections.id, input.connectionId), eq(integrationConnections.provider, TWILIO_PROVIDER)))
    .limit(1);
  if (!connection) throw new NotFoundError("Twilio connection not found.");

  const authToken = getTwilioAuthToken(connection);
  const callbackUrl = getTwilioCallbackUrl(input.connectionId);
  if (
    !validateTwilioWebhookSignature({
      url: callbackUrl,
      params: input.params,
      signature: input.signature,
      authToken,
    })
  ) {
    throw new ForbiddenError("Twilio callback signature is invalid.");
  }

  const messageSid = input.params.MessageSid?.trim();
  if (!messageSid) return { updated: false };

  const status = input.params.MessageStatus?.trim() || null;
  const errorCode = input.params.ErrorCode?.trim() || null;
  const errorMessage = input.params.ErrorMessage?.trim() || null;
  const deliveredAt = status === "delivered" ? new Date() : null;

  const [log] = await db
    .select()
    .from(notificationLogs)
    .where(
      and(
        eq(notificationLogs.businessId, connection.businessId),
        eq(notificationLogs.channel, "sms"),
        eq(notificationLogs.providerMessageId, messageSid)
      )
    )
    .limit(1);

  if (!log) {
    logger.warn("Twilio callback arrived without a matching notification log", {
      businessId: connection.businessId,
      connectionId: connection.id,
      messageSid,
      status,
    });
    return { updated: false };
  }

  await db
    .update(notificationLogs)
    .set({
      providerStatus: status,
      providerStatusAt: new Date(),
      deliveredAt: deliveredAt ?? log.deliveredAt,
      providerErrorCode: errorCode,
      error: errorMessage,
      metadata: JSON.stringify({
        ...(typeof log.metadata === "string" && log.metadata.trim() ? JSON.parse(log.metadata) : {}),
        deliveryTone: getTwilioMessageStatusTone(status),
      }),
    })
    .where(eq(notificationLogs.id, log.id));

  if (status === "undelivered" || status === "failed") {
    await createIntegrationAuditLog({
      businessId: connection.businessId,
      provider: TWILIO_PROVIDER,
      action: "delivery_failed",
      metadata: {
        connectionId: connection.id,
        providerMessageId: messageSid,
        status,
        errorCode,
        errorMessage,
      },
    });
  }

  return { updated: true };
}

export async function handleTwilioVoiceWebhook(input: {
  connectionId: string;
  signature: string | undefined;
  params: Record<string, string>;
}) {
  const [connection] = await db
    .select()
    .from(integrationConnections)
    .where(eq(integrationConnections.id, input.connectionId))
    .limit(1);
  if (!connection) throw new NotFoundError("Twilio connection not found.");

  const authToken = getTwilioAuthToken(connection);
  const callbackUrl = `${getApiBase()}/api/integrations/twilio/voice/${encodeURIComponent(input.connectionId)}`;
  if (
    !validateTwilioWebhookSignature({
      url: callbackUrl,
      params: input.params,
      signature: input.signature,
      authToken,
    })
  ) {
    throw new ForbiddenError("Twilio callback signature is invalid.");
  }

  if (!shouldQueueMissedCallTextBack(input.params)) {
    return { skipped: true as const, reason: "not_missed_call" };
  }

  const [business] = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      leadCaptureEnabled: businesses.leadCaptureEnabled,
      missedCallTextBackEnabled: businesses.missedCallTextBackEnabled,
      automationUncontactedLeadHours: businesses.automationUncontactedLeadHours,
      bookingRequestUrl: businesses.bookingRequestUrl,
    })
    .from(businesses)
    .where(eq(businesses.id, connection.businessId))
    .limit(1);

  if (!business) throw new NotFoundError("Business not found.");
  if (!business.missedCallTextBackEnabled) {
    await createActivityLog({
      businessId: business.id,
      action: "lead.missed_call.skipped",
      entityType: "integration_connection",
      entityId: connection.id,
      metadata: { reason: "disabled", callSid: input.params.CallSid ?? null },
    });
    return { skipped: true as const, reason: "disabled" };
  }

  const fromPhone = normalizePhoneToE164(String(input.params.From ?? ""));
  if (!fromPhone) {
    await createActivityLog({
      businessId: business.id,
      action: "lead.missed_call.skipped",
      entityType: "integration_connection",
      entityId: connection.id,
      metadata: { reason: "invalid_phone", callSid: input.params.CallSid ?? null },
    });
    return { skipped: true as const, reason: "invalid_phone" };
  }

  const requestUrl = buildMissedCallRequestUrl(business);
  const nextStepHours = Math.max(1, Math.min(Number(business.automationUncontactedLeadHours ?? 2), 168));
  const leadResult = await upsertMissedCallLead({
    businessId: business.id,
    phoneE164: fromPhone,
    callerName: input.params.CallerName,
    nextStepHours,
    callSid: input.params.CallSid || "unknown-call",
    requestUrl,
  });

  await createActivityLog({
    businessId: business.id,
    action: "lead.missed_call.captured",
    entityType: "client",
    entityId: leadResult.client.id,
    metadata: {
      callSid: input.params.CallSid ?? null,
      phone: fromPhone,
      created: leadResult.created,
      leadCaptured: leadResult.leadCaptured,
    },
  });

  const queued = await enqueueTwilioTemplateSms({
    businessId: business.id,
    templateSlug: "missed_call_text_back",
    to: fromPhone,
    vars: {
      businessName: business.name,
      responseWindow: `within ${nextStepHours} hour${nextStepHours === 1 ? "" : "s"}`,
      requestUrl: requestUrl ?? `${getFrontendBase() ?? getApiBase()}`,
    },
    entityType: "phone_call",
    entityId: input.params.CallSid || leadResult.client.id,
  }).catch((error) => {
    logger.warn("Missed call text-back enqueue failed", {
      businessId: business.id,
      connectionId: connection.id,
      clientId: leadResult.client.id,
      error,
    });
    return {
      queued: false as const,
      reason: "enqueue_failed" as const,
      jobId: null,
    };
  });

  await createActivityLog({
    businessId: business.id,
    action: queued.queued ? "lead.missed_call.text_back_queued" : "lead.missed_call.text_back_failed",
    entityType: "client",
    entityId: leadResult.client.id,
    metadata: {
      callSid: input.params.CallSid ?? null,
      integrationJobId: queued.jobId ?? null,
      queueReason: queued.reason,
      to: fromPhone,
      requestUrl,
    },
  });

  return { skipped: false as const, clientId: leadResult.client.id, integrationJobId: queued.jobId ?? null };
}

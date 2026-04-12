import { and, asc, desc, eq, gte, isNull, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  activityLogs,
  appointments,
  businesses,
  clients,
  dashboardPreferences,
  invoices,
  payments,
  quotes,
  users,
} from "../db/schema.js";
import { createActivityLog } from "./activity.js";
import { sendTemplatedEmail } from "./email.js";
import type { BillingAccessState } from "./billingAccess.js";
import { isEmailConfigured } from "./env.js";
import { updateHomeDashboardPreferences } from "./homeDashboard.js";
import { logger } from "./logger.js";

type DbExecutor = typeof db;

export type BillingActivationMilestoneType =
  | "appointment_created"
  | "quote_created"
  | "invoice_created"
  | "payment_collected"
  | "clients_3_added";

export type BillingPromptStage =
  | "none"
  | "soft_activation"
  | "trial_7_days"
  | "trial_3_days"
  | "trial_1_day"
  | "paused";

export type BillingActivationMilestone = {
  reached: boolean;
  type: BillingActivationMilestoneType | null;
  occurredAt: Date | null;
  detail: string | null;
};

export type BillingPromptState = {
  activationMilestone: BillingActivationMilestone;
  daysLeftInTrial: number | null;
  stage: BillingPromptStage;
  visible: boolean;
  dismissedUntil: Date | null;
  cooldownDays: number;
};

const DEFAULT_PROMPT_COOLDOWN_DAYS = 5;
const PROMPT_EVENT_DEDUPE_HOURS = 6;

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function getBillingPromptCooldownDays(): number {
  const raw = Number(process.env.BILLING_PROMPT_COOLDOWN_DAYS ?? DEFAULT_PROMPT_COOLDOWN_DAYS);
  if (!Number.isFinite(raw)) return DEFAULT_PROMPT_COOLDOWN_DAYS;
  return clampNumber(Math.round(raw), 1, 30);
}

export function getBillingPromptDismissalKey(stage: Exclude<BillingPromptStage, "none" | "paused">) {
  return `billing_prompt:${stage}`;
}

export function getDaysLeftInTrial(trialEndsAt: Date | null | undefined, now = new Date()): number | null {
  if (!trialEndsAt) return null;
  const msLeft = trialEndsAt.getTime() - now.getTime();
  if (!Number.isFinite(msLeft)) return null;
  return Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
}

export function determineBillingPromptStage(params: {
  accessState: BillingAccessState | string | null | undefined;
  trialEndsAt: Date | null | undefined;
  activationMilestoneReached: boolean;
  hasPaymentMethod?: boolean | null | undefined;
  now?: Date;
}): BillingPromptStage {
  const accessState = params.accessState ?? null;
  if (accessState === "paused_missing_payment_method" || accessState === "canceled") {
    return "paused";
  }
  if (accessState !== "active_trial") {
    return "none";
  }
  if (params.hasPaymentMethod) {
    return "none";
  }

  const daysLeft = getDaysLeftInTrial(params.trialEndsAt, params.now);
  if (daysLeft != null) {
    if (daysLeft <= 1) return "trial_1_day";
    if (daysLeft <= 3) return "trial_3_days";
    if (daysLeft <= 7) return "trial_7_days";
  }
  if (params.activationMilestoneReached) {
    return "soft_activation";
  }
  return "none";
}

function parseStringMap(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string")
    );
  } catch {
    return {};
  }
}

async function loadBillingDismissedUntil(params: {
  businessId: string;
  userId: string;
  stage: BillingPromptStage;
  tx?: DbExecutor;
}): Promise<Date | null> {
  if (params.stage === "none" || params.stage === "paused") return null;
  const tx = params.tx ?? db;
  const [preferenceRow] = await tx
    .select({
      snoozedQueueItems: dashboardPreferences.snoozedQueueItems,
    })
    .from(dashboardPreferences)
    .where(and(eq(dashboardPreferences.businessId, params.businessId), eq(dashboardPreferences.userId, params.userId)))
    .limit(1);
  const untilRaw = parseStringMap(preferenceRow?.snoozedQueueItems)[getBillingPromptDismissalKey(params.stage)];
  if (!untilRaw) return null;
  const parsed = new Date(untilRaw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

type MilestoneCandidate = {
  type: BillingActivationMilestoneType;
  occurredAt: Date;
  detail: string;
};

export function pickBillingActivationMilestone(candidates: MilestoneCandidate[]): BillingActivationMilestone {
  const ordered = [...candidates].sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime());
  const first = ordered[0];
  if (!first) {
    return {
      reached: false,
      type: null,
      occurredAt: null,
      detail: null,
    };
  }
  return {
    reached: true,
    type: first.type,
    occurredAt: first.occurredAt,
    detail: first.detail,
  };
}

async function loadActivationMilestone(params: {
  businessId: string;
  tx?: DbExecutor;
}): Promise<BillingActivationMilestone> {
  const tx = params.tx ?? db;

  const [firstAppointment, firstQuote, firstInvoice, firstPayment, firstDepositActivity, thirdClientRows] =
    await Promise.all([
      tx
        .select({ createdAt: appointments.createdAt })
        .from(appointments)
        .where(eq(appointments.businessId, params.businessId))
        .orderBy(asc(appointments.createdAt))
        .limit(1),
      tx
        .select({ createdAt: quotes.createdAt })
        .from(quotes)
        .where(eq(quotes.businessId, params.businessId))
        .orderBy(asc(quotes.createdAt))
        .limit(1),
      tx
        .select({ createdAt: invoices.createdAt })
        .from(invoices)
        .where(eq(invoices.businessId, params.businessId))
        .orderBy(asc(invoices.createdAt))
        .limit(1),
      tx
        .select({ occurredAt: payments.paidAt })
        .from(payments)
        .where(and(eq(payments.businessId, params.businessId), isNull(payments.reversedAt)))
        .orderBy(asc(payments.paidAt))
        .limit(1),
      tx
        .select({ occurredAt: activityLogs.createdAt })
        .from(activityLogs)
        .where(
          and(
            eq(activityLogs.businessId, params.businessId),
            eq(activityLogs.action, "appointment.deposit_paid")
          )
        )
        .orderBy(asc(activityLogs.createdAt))
        .limit(1),
      tx
        .select({ createdAt: clients.createdAt })
        .from(clients)
        .where(and(eq(clients.businessId, params.businessId), isNull(clients.deletedAt)))
        .orderBy(asc(clients.createdAt))
        .limit(3),
    ]);

  const candidates: MilestoneCandidate[] = [];
  if (firstAppointment[0]?.createdAt) {
    candidates.push({
      type: "appointment_created",
      occurredAt: firstAppointment[0].createdAt,
      detail: "First appointment created",
    });
  }
  if (firstQuote[0]?.createdAt) {
    candidates.push({
      type: "quote_created",
      occurredAt: firstQuote[0].createdAt,
      detail: "First quote created",
    });
  }
  if (firstInvoice[0]?.createdAt) {
    candidates.push({
      type: "invoice_created",
      occurredAt: firstInvoice[0].createdAt,
      detail: "First invoice created",
    });
  }
  const paymentOrDepositAt = [firstPayment[0]?.occurredAt, firstDepositActivity[0]?.occurredAt]
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => left.getTime() - right.getTime())[0];
  if (paymentOrDepositAt) {
    candidates.push({
      type: "payment_collected",
      occurredAt: paymentOrDepositAt,
      detail: "First payment or deposit collected",
    });
  }
  if (thirdClientRows.length >= 3 && thirdClientRows[2]?.createdAt) {
    candidates.push({
      type: "clients_3_added",
      occurredAt: thirdClientRows[2].createdAt,
      detail: "First three clients added",
    });
  }

  return pickBillingActivationMilestone(candidates);
}

export async function getBusinessBillingPromptState(params: {
  businessId: string;
  userId: string | null | undefined;
  accessState: BillingAccessState | string | null | undefined;
  trialEndsAt: Date | null | undefined;
  hasPaymentMethod?: boolean | null | undefined;
  now?: Date;
  tx?: DbExecutor;
}): Promise<BillingPromptState> {
  const tx = params.tx ?? db;
  const now = params.now ?? new Date();
  const activationMilestone = await loadActivationMilestone({
    businessId: params.businessId,
    tx,
  });
  const stage = determineBillingPromptStage({
    accessState: params.accessState,
    trialEndsAt: params.trialEndsAt,
    activationMilestoneReached: activationMilestone.reached,
    hasPaymentMethod: params.hasPaymentMethod,
    now,
  });
  const dismissedUntil =
    params.userId && stage !== "none" && stage !== "paused"
      ? await loadBillingDismissedUntil({
          businessId: params.businessId,
          userId: params.userId,
          stage,
          tx,
        })
      : null;
  const visible =
    stage !== "none" &&
    (stage === "paused" || !dismissedUntil || dismissedUntil.getTime() <= now.getTime());

  return {
    activationMilestone,
    daysLeftInTrial: getDaysLeftInTrial(params.trialEndsAt, now),
    stage,
    visible,
    dismissedUntil,
    cooldownDays: getBillingPromptCooldownDays(),
  };
}

type BillingPromptEventType = "shown" | "dismissed" | "converted";

function getPromptEventAction(event: BillingPromptEventType) {
  switch (event) {
    case "shown":
      return "billing.prompt_shown";
    case "dismissed":
      return "billing.prompt_dismissed";
    case "converted":
      return "billing.prompt_converted";
  }
}

async function hasRecentPromptActivity(params: {
  businessId: string;
  userId: string | null;
  event: BillingPromptEventType;
  stage: BillingPromptStage;
  now: Date;
  tx?: DbExecutor;
}) {
  const tx = params.tx ?? db;
  const since = new Date(params.now.getTime() - PROMPT_EVENT_DEDUPE_HOURS * 60 * 60 * 1000);
  const [row] = await tx
    .select({ id: activityLogs.id })
    .from(activityLogs)
    .where(
      and(
        eq(activityLogs.businessId, params.businessId),
        eq(activityLogs.action, getPromptEventAction(params.event)),
        gte(activityLogs.createdAt, since),
        params.userId ? eq(activityLogs.userId, params.userId) : sql`true`,
        sql`coalesce(${activityLogs.metadata}::json->>'stage', '') = ${params.stage}`
      )
    )
    .orderBy(desc(activityLogs.createdAt))
    .limit(1);
  return Boolean(row);
}

export async function recordBillingPromptEvent(params: {
  businessId: string;
  userId: string | null | undefined;
  event: BillingPromptEventType;
  stage: BillingPromptStage;
  tx?: DbExecutor;
}): Promise<void> {
  if (params.stage === "none") return;
  const tx = params.tx ?? db;
  const now = new Date();

  if (
    (params.event === "shown" || params.event === "converted") &&
    (await hasRecentPromptActivity({
      businessId: params.businessId,
      userId: params.userId ?? null,
      event: params.event,
      stage: params.stage,
      now,
      tx,
    }))
  ) {
    return;
  }

  await createActivityLog({
    businessId: params.businessId,
    userId: params.userId ?? null,
    action: getPromptEventAction(params.event),
    entityType: "business",
    entityId: params.businessId,
    metadata: {
      stage: params.stage,
      source: "trial_billing_prompt",
    },
  });

  if (params.event === "dismissed" && params.userId && params.stage !== "paused") {
    const cooldownUntil = new Date(now.getTime() + getBillingPromptCooldownDays() * 24 * 60 * 60 * 1000);
    await updateHomeDashboardPreferences({
      businessId: params.businessId,
      userId: params.userId,
      snoozeQueueItemId: getBillingPromptDismissalKey(params.stage),
      snoozeUntil: cooldownUntil,
    });
  }
}

export async function sendDelayedBillingReminderEmails(params: {
  now?: Date;
  tx?: DbExecutor;
}): Promise<{ sent: number }> {
  if (!isEmailConfigured()) return { sent: 0 };
  const tx = params.tx ?? db;
  const now = params.now ?? new Date();
  const [rows, recentReminderRows] = await Promise.all([
    tx
      .select({
        id: businesses.id,
        name: businesses.name,
        ownerEmail: users.email,
        subscriptionStatus: businesses.subscriptionStatus,
        billingAccessState: businesses.billingAccessState,
        trialEndsAt: businesses.trialEndsAt,
        billingHasPaymentMethod: businesses.billingHasPaymentMethod,
      })
      .from(businesses)
      .leftJoin(users, eq(users.id, businesses.ownerId))
      .where(
        or(
          eq(businesses.billingAccessState, "active_trial"),
          eq(businesses.billingAccessState, "paused_missing_payment_method")
        )
      ),
    tx
      .select({
        businessId: activityLogs.businessId,
        metadata: activityLogs.metadata,
      })
      .from(activityLogs)
      .where(
        and(
          eq(activityLogs.action, "billing.email_reminder_sent"),
          gte(activityLogs.createdAt, new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000))
        )
      ),
  ]);

  const sentStageKeys = new Set(
    recentReminderRows.flatMap((row) => {
      if (!row.metadata) return [];
      try {
        const parsed = JSON.parse(row.metadata) as { stage?: string };
        return parsed.stage ? [`${row.businessId}:${parsed.stage}`] : [];
      } catch {
        return [];
      }
    })
  );

  let sent = 0;
  for (const row of rows) {
    if (!row.ownerEmail?.trim()) continue;
    const promptState = await getBusinessBillingPromptState({
      businessId: row.id,
      userId: null,
      accessState: row.billingAccessState ?? row.subscriptionStatus,
      trialEndsAt: row.trialEndsAt,
      hasPaymentMethod: row.billingHasPaymentMethod,
      now,
      tx,
    });
    if (promptState.stage === "none" || promptState.stage === "soft_activation") continue;
    const stageKey = `${row.id}:${promptState.stage}`;
    if (sentStageKeys.has(stageKey)) continue;

    try {
      await sendTemplatedEmail({
        to: row.ownerEmail,
        businessId: row.id,
        templateSlug: "billing_trial_reminder",
        vars: {
          businessName: row.name,
          trialState:
            promptState.stage === "paused" ? "Trial paused — add payment method to resume" : "Your trial is active",
          trialDetail:
            promptState.stage === "paused"
              ? "Your Strata trial paused because no payment method was saved before the trial ended."
              : promptState.daysLeftInTrial == null
                ? "Add a payment method to keep access after trial."
                : `${promptState.daysLeftInTrial} day${promptState.daysLeftInTrial === 1 ? "" : "s"} left. Add payment method to keep access after trial.`,
          billingUrl: `${process.env.FRONTEND_URL ?? ""}/settings?tab=billing`,
        },
      });
      await createActivityLog({
        businessId: row.id,
        action: "billing.email_reminder_sent",
        entityType: "business",
        entityId: row.id,
        metadata: {
          stage: promptState.stage,
          recipient: row.ownerEmail,
        },
      });
      sent += 1;
    } catch (error) {
      logger.warn("Billing reminder email failed", {
        businessId: row.id,
        stage: promptState.stage,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { sent };
}

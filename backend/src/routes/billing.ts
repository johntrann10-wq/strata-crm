/**
 * Stripe billing: checkout session (subscribe), customer portal, webhook.
 */
import { Router, Request, Response } from "express";
import { db } from "../db/index.js";
import { activityLogs, appointments, businesses, invoices, stripeWebhookEvents, users } from "../db/schema.js";
import { and, desc, eq, gte, or, sql } from "drizzle-orm";
import Stripe from "stripe";
import { z } from "zod";
import {
  stripe,
  STRIPE_WEBHOOK_SECRET,
  createConnectAccount,
  createConnectAccountLink,
  createCheckoutSession,
  createConnectLoginLink,
  createPortalSession,
  isStripeCheckoutConfigured,
  isStripeConnectConfigured,
  isStripePortalConfigured,
  retrieveConnectAccount,
} from "../lib/stripe.js";
import type { StripeConnectAccountState } from "../lib/stripe.js";
import { requireAuth } from "../middleware/auth.js";
import { BadRequestError, ForbiddenError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { wrapAsync } from "../lib/asyncHandler.js";
import { isEmailConfigured, isStripeConfigured } from "../lib/env.js";
import { withIdempotency } from "../lib/idempotency.js";
import { createActivityLog } from "../lib/activity.js";
import { getAppointmentFinanceMirrorUpdates, getAppointmentFinanceSummaryMap } from "../lib/appointmentFinance.js";
import { recordInvoicePayment } from "../lib/invoicePayments.js";
import { sendBillingTrialReminder } from "../lib/email.js";
import { requireTenant } from "../middleware/tenant.js";
import {
  ensureBusinessTrialSubscription,
  refreshBusinessBillingStateFromStripe,
  retryBusinessTrialSubscription,
} from "../lib/billingLifecycle.js";
import {
  getBillingAccessStateForSubscriptionStatus,
  type BillingAccessState,
} from "../lib/billingAccess.js";
import {
  determineBillingPromptStage,
  getBusinessBillingPromptState,
  getDaysLeftInTrial,
  recordBillingPromptEvent,
  type BillingPromptStage,
} from "../lib/billingPrompts.js";
import { deriveStripeBillingWebhookAction, type StripeBillingWebhookAction } from "../lib/stripeBillingWebhooks.js";

export const billingRouter = Router();

const billingPromptEventSchema = z.object({
  event: z.enum(["shown", "dismissed", "converted"]),
  stage: z.enum(["soft_activation", "trial_7_days", "trial_3_days", "trial_1_day", "paused"]),
});

const billingPortalRequestSchema = z.object({
  promptStage: z.enum(["soft_activation", "trial_7_days", "trial_3_days", "trial_1_day", "paused"]).optional(),
  entryPoint: z.enum(["settings", "trial_banner", "paused_recovery"]).default("settings"),
});

function isBillingEnforced(): boolean {
  return process.env.BILLING_ENFORCED === "true" && isStripeConfigured();
}

function canManageStripeConnect(req: Request): boolean {
  return req.membershipRole === "owner" || req.membershipRole === "admin";
}

function canManageBilling(req: Request): boolean {
  return req.membershipRole === "owner" || req.membershipRole === "admin";
}

function getBillingPortalReturnUrl(entryPoint: "settings" | "trial_banner" | "paused_recovery"): string {
  const base = process.env.FRONTEND_URL!;
  switch (entryPoint) {
    case "trial_banner":
      return `${base}/signed-in?billingPortal=return`;
    case "paused_recovery":
      return `${base}/subscribe?billingPortal=return`;
    case "settings":
    default:
      return `${base}/settings?tab=billing&billingPortal=return`;
  }
}

function getBillingStatusForResponse(params: {
  status: string | null | undefined;
  accessState: string | null | undefined;
}): BillingAccessState {
  if (
    params.accessState === "pending_setup" ||
    params.accessState === "pending_setup_failure" ||
    params.accessState === "active_trial" ||
    params.accessState === "active_paid" ||
    params.accessState === "paused_missing_payment_method" ||
    params.accessState === "canceled"
  ) {
    return params.accessState;
  }
  return getBillingAccessStateForSubscriptionStatus(params.status);
}

function getStripeConnectErrorMessage(error: unknown): string {
  if (error instanceof Stripe.errors.StripeError) {
    return error.message || "Stripe could not complete the connected account request.";
  }
  return error instanceof Error ? error.message : "Stripe could not complete the connected account request.";
}

async function syncStripeConnectStatus(businessId: string): Promise<{
  stripeConnectAccountId: string | null;
  stripeConnectDetailsSubmitted: boolean;
  stripeConnectChargesEnabled: boolean;
  stripeConnectPayoutsEnabled: boolean;
  stripeConnectOnboardedAt: Date | null;
}> {
  const [business] = await db
    .select({
      stripeConnectAccountId: businesses.stripeConnectAccountId,
      stripeConnectDetailsSubmitted: businesses.stripeConnectDetailsSubmitted,
      stripeConnectChargesEnabled: businesses.stripeConnectChargesEnabled,
      stripeConnectPayoutsEnabled: businesses.stripeConnectPayoutsEnabled,
      stripeConnectOnboardedAt: businesses.stripeConnectOnboardedAt,
    })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!business) {
    return {
      stripeConnectAccountId: null,
      stripeConnectDetailsSubmitted: false,
      stripeConnectChargesEnabled: false,
      stripeConnectPayoutsEnabled: false,
      stripeConnectOnboardedAt: null,
    };
  }

  if (!business.stripeConnectAccountId || !isStripeConnectConfigured()) {
    return {
      stripeConnectAccountId: business.stripeConnectAccountId ?? null,
      stripeConnectDetailsSubmitted: business.stripeConnectDetailsSubmitted ?? false,
      stripeConnectChargesEnabled: business.stripeConnectChargesEnabled ?? false,
      stripeConnectPayoutsEnabled: business.stripeConnectPayoutsEnabled ?? false,
      stripeConnectOnboardedAt: business.stripeConnectOnboardedAt ?? null,
    };
  }

  let account: StripeConnectAccountState | null = null;
  try {
    account = await retrieveConnectAccount({ accountId: business.stripeConnectAccountId });
  } catch (error) {
    logger.warn("Stripe Connect status sync failed; using stored account state", {
      businessId,
      accountId: business.stripeConnectAccountId,
      error: getStripeConnectErrorMessage(error),
    });
  }
  if (!account) {
    return {
      stripeConnectAccountId: business.stripeConnectAccountId,
      stripeConnectDetailsSubmitted: business.stripeConnectDetailsSubmitted ?? false,
      stripeConnectChargesEnabled: business.stripeConnectChargesEnabled ?? false,
      stripeConnectPayoutsEnabled: business.stripeConnectPayoutsEnabled ?? false,
      stripeConnectOnboardedAt: business.stripeConnectOnboardedAt ?? null,
    };
  }

  const nextOnboardedAt =
    account.ready ? business.stripeConnectOnboardedAt ?? new Date() : null;
  const statusChanged =
    (business.stripeConnectDetailsSubmitted ?? false) !== account.detailsSubmitted ||
    (business.stripeConnectChargesEnabled ?? false) !== account.chargesEnabled ||
    (business.stripeConnectPayoutsEnabled ?? false) !== account.payoutsEnabled ||
    (business.stripeConnectOnboardedAt?.getTime() ?? null) !== (nextOnboardedAt?.getTime() ?? null);

  if (statusChanged) {
    await db
      .update(businesses)
      .set({
        stripeConnectDetailsSubmitted: account.detailsSubmitted,
        stripeConnectChargesEnabled: account.chargesEnabled,
        stripeConnectPayoutsEnabled: account.payoutsEnabled,
        stripeConnectOnboardedAt: nextOnboardedAt,
        updatedAt: new Date(),
      })
      .where(eq(businesses.id, businessId));
  }

  return {
    stripeConnectAccountId: business.stripeConnectAccountId,
    stripeConnectDetailsSubmitted: account.detailsSubmitted,
    stripeConnectChargesEnabled: account.chargesEnabled,
    stripeConnectPayoutsEnabled: account.payoutsEnabled,
    stripeConnectOnboardedAt: nextOnboardedAt,
  };
}

async function loadBillingStatusResponse(req: Request, businessId: string | null | undefined) {
  if (!businessId) {
    return {
      status: null,
      accessState: null,
      trialStartedAt: null,
      trialEndsAt: null,
      currentPeriodEnd: null,
      billingHasPaymentMethod: false,
      billingPaymentMethodAddedAt: null,
      billingSetupError: null,
      billingSetupFailedAt: null,
      billingLastStripeEventId: null,
      billingLastStripeEventType: null,
      billingLastStripeEventAt: null,
      billingLastStripeSyncStatus: null,
      billingLastStripeSyncError: null,
      activationMilestone: {
        reached: false,
        type: null,
        occurredAt: null,
        detail: null,
      },
      billingPrompt: {
        stage: "none",
        visible: false,
        daysLeftInTrial: null,
        dismissedUntil: null,
        cooldownDays: 5,
      },
      billingEnforced: isBillingEnforced(),
      checkoutConfigured: isStripeCheckoutConfigured(),
      portalConfigured: isStripePortalConfigured(),
      stripeConnectConfigured: isStripeConnectConfigured(),
      stripeConnectAccountId: null,
      stripeConnectDetailsSubmitted: false,
      stripeConnectChargesEnabled: false,
      stripeConnectPayoutsEnabled: false,
      stripeConnectOnboardedAt: null,
      stripeConnectReady: false,
    };
  }

  const [b] = await db
    .select({
      subscriptionStatus: businesses.subscriptionStatus,
      billingAccessState: businesses.billingAccessState,
      trialStartedAt: businesses.trialStartedAt,
      trialEndsAt: businesses.trialEndsAt,
      currentPeriodEnd: businesses.currentPeriodEnd,
      billingHasPaymentMethod: businesses.billingHasPaymentMethod,
      billingPaymentMethodAddedAt: businesses.billingPaymentMethodAddedAt,
      billingSetupError: businesses.billingSetupError,
      billingSetupFailedAt: businesses.billingSetupFailedAt,
      billingLastStripeEventId: businesses.billingLastStripeEventId,
      billingLastStripeEventType: businesses.billingLastStripeEventType,
      billingLastStripeEventAt: businesses.billingLastStripeEventAt,
      billingLastStripeSyncStatus: businesses.billingLastStripeSyncStatus,
      billingLastStripeSyncError: businesses.billingLastStripeSyncError,
    })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);
  const billingPrompt = await getBusinessBillingPromptState({
    businessId,
    userId: req.userId,
    accessState: b?.billingAccessState ?? b?.subscriptionStatus,
    trialEndsAt: b?.trialEndsAt ?? null,
    hasPaymentMethod: b?.billingHasPaymentMethod ?? false,
  });
  const connectStatus = await syncStripeConnectStatus(businessId);
  return {
    status: b?.subscriptionStatus ?? null,
    accessState: getBillingStatusForResponse({
      status: b?.subscriptionStatus,
      accessState: b?.billingAccessState,
    }),
    trialStartedAt: b?.trialStartedAt ?? null,
    trialEndsAt: b?.trialEndsAt ?? null,
    currentPeriodEnd: b?.currentPeriodEnd ?? null,
    billingHasPaymentMethod: b?.billingHasPaymentMethod ?? false,
    billingPaymentMethodAddedAt: b?.billingPaymentMethodAddedAt ?? null,
    billingSetupError: b?.billingSetupError ?? null,
    billingSetupFailedAt: b?.billingSetupFailedAt ?? null,
    billingLastStripeEventId: b?.billingLastStripeEventId ?? null,
    billingLastStripeEventType: b?.billingLastStripeEventType ?? null,
    billingLastStripeEventAt: b?.billingLastStripeEventAt ?? null,
    billingLastStripeSyncStatus: b?.billingLastStripeSyncStatus ?? null,
    billingLastStripeSyncError: b?.billingLastStripeSyncError ?? null,
    activationMilestone: {
      reached: billingPrompt.activationMilestone.reached,
      type: billingPrompt.activationMilestone.type,
      occurredAt: billingPrompt.activationMilestone.occurredAt?.toISOString() ?? null,
      detail: billingPrompt.activationMilestone.detail,
    },
    billingPrompt: {
      stage: billingPrompt.stage,
      visible: billingPrompt.visible,
      daysLeftInTrial: billingPrompt.daysLeftInTrial,
      dismissedUntil: billingPrompt.dismissedUntil?.toISOString() ?? null,
      cooldownDays: billingPrompt.cooldownDays,
    },
    billingEnforced: isBillingEnforced(),
    checkoutConfigured: isStripeCheckoutConfigured(),
    portalConfigured: isStripePortalConfigured(),
    stripeConnectConfigured: isStripeConnectConfigured(),
    stripeConnectAccountId: connectStatus.stripeConnectAccountId,
    stripeConnectDetailsSubmitted: connectStatus.stripeConnectDetailsSubmitted,
    stripeConnectChargesEnabled: connectStatus.stripeConnectChargesEnabled,
    stripeConnectPayoutsEnabled: connectStatus.stripeConnectPayoutsEnabled,
    stripeConnectOnboardedAt: connectStatus.stripeConnectOnboardedAt ?? null,
    stripeConnectReady:
      connectStatus.stripeConnectDetailsSubmitted &&
      connectStatus.stripeConnectChargesEnabled &&
      connectStatus.stripeConnectPayoutsEnabled,
  };
}

const STRIPE_WEBHOOK_DEAD_LETTER_THRESHOLD = 3;
const STRIPE_TRIAL_REMINDER_DEDUPE_DAYS = 14;

type StripeWebhookBusinessContext = {
  id: string;
  name: string;
  email: string | null;
  ownerEmail: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string | null;
  billingAccessState: string | null;
  trialEndsAt: Date | null;
  billingHasPaymentMethod: boolean | null;
};

function getStripeWebhookPayload(event: Stripe.Event): string {
  return JSON.stringify({
    id: event.id,
    type: event.type,
    created: event.created,
    livemode: event.livemode,
    object: event.data.object,
  });
}

async function findBusinessForStripeAction(action: StripeBillingWebhookAction): Promise<StripeWebhookBusinessContext | null> {
  const subscriptionId =
    action.kind === "subscription_snapshot" ||
    action.kind === "subscription_deleted" ||
    action.kind === "trial_will_end"
      ? action.subscriptionId
      : action.kind === "invoice_lifecycle"
        ? action.subscriptionId
        : null;
  const customerId =
    action.kind === "subscription_snapshot" ||
    action.kind === "subscription_deleted" ||
    action.kind === "trial_will_end" ||
    action.kind === "invoice_lifecycle"
      ? action.customerId
      : action.kind === "customer_updated"
        ? action.customerId
        : null;

  if (!subscriptionId && !customerId) return null;

  const [business] = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      email: businesses.email,
      ownerEmail: users.email,
      stripeCustomerId: businesses.stripeCustomerId,
      stripeSubscriptionId: businesses.stripeSubscriptionId,
      subscriptionStatus: businesses.subscriptionStatus,
      billingAccessState: businesses.billingAccessState,
      trialEndsAt: businesses.trialEndsAt,
      billingHasPaymentMethod: businesses.billingHasPaymentMethod,
    })
    .from(businesses)
    .leftJoin(users, eq(users.id, businesses.ownerId))
    .where(
      or(
        subscriptionId ? eq(businesses.stripeSubscriptionId, subscriptionId) : sql`false`,
        customerId ? eq(businesses.stripeCustomerId, customerId) : sql`false`
      )
    )
    .limit(1);

  return business ?? null;
}

async function markBusinessStripeSyncState(params: {
  businessId: string;
  event: Stripe.Event;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  status: "synced" | "failed";
  error?: string | null;
}) {
  await db
    .update(businesses)
    .set({
      stripeCustomerId: params.stripeCustomerId ?? undefined,
      stripeSubscriptionId: params.stripeSubscriptionId ?? undefined,
      billingLastStripeEventId: params.event.id,
      billingLastStripeEventType: params.event.type,
      billingLastStripeEventAt: new Date(params.event.created * 1000),
      billingLastStripeSyncStatus: params.status,
      billingLastStripeSyncError: params.error ?? null,
      updatedAt: new Date(),
    })
    .where(eq(businesses.id, params.businessId));
}

async function beginStripeWebhookProcessing(params: {
  event: Stripe.Event;
  businessId: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
}) {
  const [existing] = await db
    .select({
      id: stripeWebhookEvents.id,
      status: stripeWebhookEvents.status,
      attemptCount: stripeWebhookEvents.attemptCount,
    })
    .from(stripeWebhookEvents)
    .where(eq(stripeWebhookEvents.eventId, params.event.id))
    .limit(1);

  if (existing?.status === "processed" || existing?.status === "processing") {
    return { duplicate: true as const, recordId: existing.id };
  }

  if (existing) {
    await db
      .update(stripeWebhookEvents)
      .set({
        businessId: params.businessId,
        stripeCustomerId: params.stripeCustomerId ?? null,
        stripeSubscriptionId: params.stripeSubscriptionId ?? null,
        status: "processing",
        attemptCount: (existing.attemptCount ?? 0) + 1,
        payload: getStripeWebhookPayload(params.event),
        lastError: null,
        deadLetteredAt: null,
        updatedAt: new Date(),
      })
      .where(eq(stripeWebhookEvents.id, existing.id));
    return { duplicate: false as const, recordId: existing.id };
  }

  const [created] = await db
    .insert(stripeWebhookEvents)
    .values({
      eventId: params.event.id,
      businessId: params.businessId,
      stripeCustomerId: params.stripeCustomerId ?? null,
      stripeSubscriptionId: params.stripeSubscriptionId ?? null,
      eventType: params.event.type,
      status: "processing",
      attemptCount: 1,
      payload: getStripeWebhookPayload(params.event),
    })
    .returning({
      id: stripeWebhookEvents.id,
    });

  return { duplicate: false as const, recordId: created.id };
}

async function finalizeStripeWebhookProcessing(params: {
  recordId: string;
  status: "processed" | "failed";
  error?: string | null;
}) {
  const [existing] = await db
    .select({ attemptCount: stripeWebhookEvents.attemptCount })
    .from(stripeWebhookEvents)
    .where(eq(stripeWebhookEvents.id, params.recordId))
    .limit(1);
  const attemptCount = existing?.attemptCount ?? 1;

  await db
    .update(stripeWebhookEvents)
    .set({
      status: params.status,
      processedAt: params.status === "processed" ? new Date() : null,
      lastError: params.error ?? null,
      deadLetteredAt:
        params.status === "failed" && attemptCount >= STRIPE_WEBHOOK_DEAD_LETTER_THRESHOLD
          ? new Date()
          : null,
      updatedAt: new Date(),
    })
    .where(eq(stripeWebhookEvents.id, params.recordId));
}

function getStripeActionRefs(action: StripeBillingWebhookAction): {
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
} {
  switch (action.kind) {
    case "subscription_snapshot":
    case "subscription_deleted":
    case "trial_will_end":
      return {
        stripeCustomerId: action.customerId,
        stripeSubscriptionId: action.subscriptionId,
      };
    case "invoice_lifecycle":
      return {
        stripeCustomerId: action.customerId,
        stripeSubscriptionId: action.subscriptionId,
      };
    case "customer_updated":
      return {
        stripeCustomerId: action.customerId,
        stripeSubscriptionId: null,
      };
    default:
      return {
        stripeCustomerId: null,
        stripeSubscriptionId: null,
      };
  }
}

async function hasRecentTrialReminder(params: {
  businessId: string;
  stage: BillingPromptStage;
  now: Date;
}) {
  const since = new Date(
    params.now.getTime() - STRIPE_TRIAL_REMINDER_DEDUPE_DAYS * 24 * 60 * 60 * 1000
  );
  const [row] = await db
    .select({ id: activityLogs.id })
    .from(activityLogs)
    .where(
      and(
        eq(activityLogs.businessId, params.businessId),
        eq(activityLogs.action, "billing.email_reminder_sent"),
        gte(activityLogs.createdAt, since),
        sql`coalesce(${activityLogs.metadata}::json->>'stage', '') = ${params.stage}`
      )
    )
    .orderBy(desc(activityLogs.createdAt))
    .limit(1);
  return Boolean(row);
}

async function handleTrialWillEndReminder(params: {
  business: StripeWebhookBusinessContext;
  trialEndsAt: Date | null;
  hasPaymentMethod: boolean;
}) {
  const now = new Date();
  await createActivityLog({
    businessId: params.business.id,
    action: "billing.trial_will_end",
    entityType: "business",
    entityId: params.business.id,
    metadata: {
      trialEndsAt: params.trialEndsAt?.toISOString() ?? null,
      hasPaymentMethod: params.hasPaymentMethod,
      source: "stripe_webhook",
    },
  });

  if (!isEmailConfigured()) return;

  const stage = determineBillingPromptStage({
    accessState: "active_trial",
    trialEndsAt: params.trialEndsAt,
    activationMilestoneReached: true,
    hasPaymentMethod: params.hasPaymentMethod,
    now,
  });
  if (
    stage === "none" ||
    stage === "soft_activation" ||
    (await hasRecentTrialReminder({ businessId: params.business.id, stage, now }))
  ) {
    return;
  }

  const recipient = params.business.ownerEmail?.trim() || params.business.email?.trim();
  if (!recipient) return;

  const daysLeft = getDaysLeftInTrial(params.trialEndsAt, now);
  await sendBillingTrialReminder({
    to: recipient,
    businessId: params.business.id,
    businessName: params.business.name,
    trialState: "Your trial is active",
    trialDetail:
      daysLeft == null
        ? "Add a payment method to keep access after trial."
        : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left. Add a payment method to keep access after trial.`,
    billingUrl: `${process.env.FRONTEND_URL ?? ""}/settings?tab=billing`,
  });
  await createActivityLog({
    businessId: params.business.id,
    action: "billing.email_reminder_sent",
    entityType: "business",
    entityId: params.business.id,
    metadata: {
      stage,
      recipient,
      source: "stripe_webhook",
    },
  });
}

async function handleStripeCheckoutCompletedEvent(event: Stripe.Event, action: Extract<StripeBillingWebhookAction, { kind: "checkout_completed" }>) {
  const session = action.session;
  const purpose = session.metadata?.purpose;
  if (purpose === "invoice_payment") {
    const businessId = session.metadata?.businessId;
    const invoiceId = session.metadata?.invoiceId;
    const sessionAmountTotal = session.amount_total;
    if (!businessId || !invoiceId || sessionAmountTotal == null) {
      logger.warn("Stripe invoice checkout completed without required metadata", {
        stripeEventId: event.id,
        sessionId: session.id,
        businessId,
        invoiceId,
      });
      return;
    }

    const idempotencyKey = `stripe-checkout-session-${session.id}`;
    const [business] = await db
      .select({
        stripeConnectAccountId: businesses.stripeConnectAccountId,
      })
      .from(businesses)
      .where(eq(businesses.id, businessId))
      .limit(1);
    if (
      event.account &&
      business?.stripeConnectAccountId &&
      event.account !== business.stripeConnectAccountId
    ) {
      throw new BadRequestError("Connected account mismatch");
    }

    try {
      const payment = await withIdempotency(
        idempotencyKey,
        { businessId, operation: "payment.create" },
        async () =>
          db.transaction(async (tx) =>
            recordInvoicePayment(
              {
                businessId,
                invoiceId,
                amount: sessionAmountTotal / 100,
                method: "card",
                paidAt: new Date(),
                idempotencyKey,
                notes: "Paid through Stripe Checkout",
                referenceNumber: session.id,
                stripeCheckoutSessionId: session.id,
                stripePaymentIntentId:
                  typeof session.payment_intent === "string"
                    ? session.payment_intent
                    : session.payment_intent?.id ?? null,
              },
              tx
            )
          )
      );
      const [invoice] = await db
        .select({ invoiceNumber: invoices.invoiceNumber })
        .from(invoices)
        .where(eq(invoices.id, invoiceId))
        .limit(1);
      await createActivityLog({
        businessId,
        action: "invoice.payment_received",
        entityType: "invoice",
        entityId: invoiceId,
        metadata: {
          paymentId: payment.id,
          invoiceNumber: invoice?.invoiceNumber ?? null,
          amount: payment.amount,
          source: "stripe_checkout",
          stripeCheckoutSessionId: session.id,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.toLowerCase().includes("duplicate request")) throw error;
      logger.info("Stripe invoice checkout webhook duplicate ignored", {
        stripeEventId: event.id,
        sessionId: session.id,
        businessId,
        invoiceId,
      });
    }
    return;
  }

  if (purpose === "appointment_deposit") {
    const businessId = session.metadata?.businessId;
    const appointmentId = session.metadata?.appointmentId;
    const sessionAmountTotal = session.amount_total;
    if (!businessId || !appointmentId || sessionAmountTotal == null) {
      logger.warn("Stripe appointment deposit completed without required metadata", {
        stripeEventId: event.id,
        sessionId: session.id,
        businessId,
        appointmentId,
      });
      return;
    }

    const idempotencyKey = `stripe-appointment-deposit-${session.id}`;
    const [business] = await db
      .select({
        stripeConnectAccountId: businesses.stripeConnectAccountId,
      })
      .from(businesses)
      .where(eq(businesses.id, businessId))
      .limit(1);
    if (
      event.account &&
      business?.stripeConnectAccountId &&
      event.account !== business.stripeConnectAccountId
    ) {
      throw new BadRequestError("Connected account mismatch");
    }

    try {
      await withIdempotency(
        idempotencyKey,
        { businessId, operation: "appointment.deposit" },
        async () =>
          db.transaction(async (tx) => {
            const [appointment] = await tx
              .select({
                id: appointments.id,
                totalPrice: appointments.totalPrice,
                depositAmount: appointments.depositAmount,
              })
              .from(appointments)
              .where(eq(appointments.id, appointmentId))
              .limit(1);
            if (!appointment) throw new Error("Appointment not found for Stripe deposit.");

            const existingFinance = (
              await getAppointmentFinanceSummaryMap(
                businessId,
                [
                  {
                    id: appointment.id,
                    totalPrice: appointment.totalPrice,
                    depositAmount: appointment.depositAmount,
                    paidAt: null,
                  },
                ],
                tx
              )
            ).get(appointment.id);
            if (existingFinance?.depositSatisfied === true) return;

            await createActivityLog({
              businessId,
              action: "appointment.deposit_paid",
              entityType: "appointment",
              entityId: appointmentId,
              metadata: {
                amount: sessionAmountTotal / 100,
                source: "stripe_checkout",
                stripeCheckoutSessionId: session.id,
                stripePaymentIntentId:
                  typeof session.payment_intent === "string"
                    ? session.payment_intent
                    : session.payment_intent?.id ?? null,
              },
            });

            const nextFinance = (
              await getAppointmentFinanceSummaryMap(
                businessId,
                [
                  {
                    id: appointment.id,
                    totalPrice: appointment.totalPrice,
                    depositAmount: appointment.depositAmount,
                    paidAt: null,
                  },
                ],
                tx
              )
            ).get(appointment.id);
            const updates = getAppointmentFinanceMirrorUpdates({
              depositAmount: appointment.depositAmount,
              finance: nextFinance,
              paidAtWhenPaid: null,
              includeUpdatedAt: true,
            });
            await tx
              .update(appointments)
              .set(updates as Partial<typeof appointments.$inferInsert>)
              .where(eq(appointments.id, appointmentId));
          })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.toLowerCase().includes("duplicate request")) throw error;
      logger.info("Stripe appointment deposit webhook duplicate ignored", {
        stripeEventId: event.id,
        sessionId: session.id,
        businessId,
        appointmentId,
      });
    }
    return;
  }

  const businessId = session.metadata?.businessId;
  const stripeCustomerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
  const stripeSubscriptionId =
    typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
  if (businessId && stripeCustomerId && stripeSubscriptionId) {
    await db
      .update(businesses)
      .set({
        stripeCustomerId,
        stripeSubscriptionId,
        subscriptionStatus: "trialing",
        billingAccessState: "active_trial",
        trialStartedAt: new Date(),
        trialEndsAt: null,
        currentPeriodEnd: null,
        billingHasPaymentMethod: false,
        billingPaymentMethodAddedAt: null,
        billingSetupError: null,
        billingSetupFailedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(businesses.id, businessId));
    await markBusinessStripeSyncState({
      businessId,
      event,
      stripeCustomerId,
      stripeSubscriptionId,
      status: "synced",
    });
  }
}

async function handleStripeSubscriptionSnapshotAction(
  event: Stripe.Event,
  action: Extract<StripeBillingWebhookAction, { kind: "subscription_snapshot" }>,
  business: StripeWebhookBusinessContext | null
) {
  if (!business) return;
  const nextHasPaymentMethod = action.hasPaymentMethod || business.billingHasPaymentMethod || false;
  await db
    .update(businesses)
    .set({
      subscriptionStatus: action.status,
      billingAccessState: getBillingAccessStateForSubscriptionStatus(action.status),
      trialStartedAt: action.trialStart,
      currentPeriodEnd: action.currentPeriodEnd,
      trialEndsAt: action.trialEnd,
      stripeSubscriptionId: action.subscriptionId,
      stripeCustomerId: action.customerId ?? business.stripeCustomerId ?? null,
      billingHasPaymentMethod: nextHasPaymentMethod,
      billingPaymentMethodAddedAt: nextHasPaymentMethod ? new Date() : null,
      billingSetupError: null,
      billingSetupFailedAt: null,
      billingLastStripeSyncError: null,
      updatedAt: new Date(),
    })
    .where(eq(businesses.id, business.id));
  await markBusinessStripeSyncState({
    businessId: business.id,
    event,
    stripeCustomerId: action.customerId,
    stripeSubscriptionId: action.subscriptionId,
    status: "synced",
  });
  await createActivityLog({
    businessId: business.id,
    action:
      action.eventType === "customer.subscription.paused"
        ? "billing.subscription_paused"
        : action.eventType === "customer.subscription.resumed"
          ? "billing.subscription_resumed"
          : "billing.subscription_synced",
    entityType: "business",
    entityId: business.id,
    metadata: {
      stripeEventId: event.id,
      stripeCustomerId: action.customerId,
      stripeSubscriptionId: action.subscriptionId,
      subscriptionStatus: action.status,
      accessState: getBillingAccessStateForSubscriptionStatus(action.status),
      source: "stripe_webhook",
    },
  });
}

async function handleStripeTrialWillEndAction(
  event: Stripe.Event,
  action: Extract<StripeBillingWebhookAction, { kind: "trial_will_end" }>,
  business: StripeWebhookBusinessContext | null
) {
  if (!business) return;
  const nextHasPaymentMethod = action.hasPaymentMethod || business.billingHasPaymentMethod || false;
  await db
    .update(businesses)
    .set({
      subscriptionStatus: action.status,
      billingAccessState: getBillingAccessStateForSubscriptionStatus(action.status),
      trialEndsAt: action.trialEnd,
      stripeSubscriptionId: action.subscriptionId,
      stripeCustomerId: action.customerId ?? business.stripeCustomerId ?? null,
      billingHasPaymentMethod: nextHasPaymentMethod,
      billingPaymentMethodAddedAt: nextHasPaymentMethod ? new Date() : null,
      billingLastStripeSyncError: null,
      updatedAt: new Date(),
    })
    .where(eq(businesses.id, business.id));
  await markBusinessStripeSyncState({
    businessId: business.id,
    event,
    stripeCustomerId: action.customerId,
    stripeSubscriptionId: action.subscriptionId,
    status: "synced",
  });
  await handleTrialWillEndReminder({
    business,
    trialEndsAt: action.trialEnd,
    hasPaymentMethod: nextHasPaymentMethod,
  });
}

async function handleStripeSubscriptionDeletedAction(
  event: Stripe.Event,
  action: Extract<StripeBillingWebhookAction, { kind: "subscription_deleted" }>,
  business: StripeWebhookBusinessContext | null
) {
  if (!business) return;
  const nextHasPaymentMethod = action.hasPaymentMethod || business.billingHasPaymentMethod || false;
  await db
    .update(businesses)
    .set({
      subscriptionStatus: "canceled",
      billingAccessState: "canceled",
      stripeSubscriptionId: action.subscriptionId,
      stripeCustomerId: action.customerId ?? business.stripeCustomerId ?? null,
      currentPeriodEnd: null,
      trialEndsAt: null,
      billingHasPaymentMethod: nextHasPaymentMethod,
      billingPaymentMethodAddedAt: nextHasPaymentMethod ? new Date() : null,
      billingSetupError: null,
      billingSetupFailedAt: null,
      billingLastStripeSyncError: null,
      updatedAt: new Date(),
    })
    .where(eq(businesses.id, business.id));
  await markBusinessStripeSyncState({
    businessId: business.id,
    event,
    stripeCustomerId: action.customerId,
    stripeSubscriptionId: action.subscriptionId,
    status: "synced",
  });
  await createActivityLog({
    businessId: business.id,
    action: "billing.subscription_canceled",
    entityType: "business",
    entityId: business.id,
    metadata: {
      stripeEventId: event.id,
      stripeCustomerId: action.customerId,
      stripeSubscriptionId: action.subscriptionId,
      source: "stripe_webhook",
    },
  });
}

async function handleStripeInvoiceLifecycleAction(
  event: Stripe.Event,
  action: Extract<StripeBillingWebhookAction, { kind: "invoice_lifecycle" }>,
  business: StripeWebhookBusinessContext | null
) {
  if (!business) return;

  if (action.eventType === "invoice.created") {
    await markBusinessStripeSyncState({
      businessId: business.id,
      event,
      stripeCustomerId: action.customerId,
      stripeSubscriptionId: action.subscriptionId,
      status: "synced",
    });
    await createActivityLog({
      businessId: business.id,
      action: "billing.invoice_created",
      entityType: "business",
      entityId: business.id,
      metadata: {
        stripeEventId: event.id,
        stripeInvoiceId: action.invoiceId,
        stripeCustomerId: action.customerId,
        stripeSubscriptionId: action.subscriptionId,
        amountDue: action.amountDue,
        source: "stripe_webhook",
      },
    });
    return;
  }

  if (action.eventType === "invoice.payment_succeeded") {
    await refreshBusinessBillingStateFromStripe({ businessId: business.id });
    await markBusinessStripeSyncState({
      businessId: business.id,
      event,
      stripeCustomerId: action.customerId,
      stripeSubscriptionId: action.subscriptionId,
      status: "synced",
    });
    await createActivityLog({
      businessId: business.id,
      action: "billing.invoice_payment_succeeded",
      entityType: "business",
      entityId: business.id,
      metadata: {
        stripeEventId: event.id,
        stripeInvoiceId: action.invoiceId,
        stripeCustomerId: action.customerId,
        stripeSubscriptionId: action.subscriptionId,
        amountPaid: action.amountPaid,
        source: "stripe_webhook",
      },
    });
    return;
  }

  const syncError =
    "Stripe could not collect the latest invoice payment. Add or update a payment method to keep billing healthy.";
  await refreshBusinessBillingStateFromStripe({ businessId: business.id });
  await markBusinessStripeSyncState({
    businessId: business.id,
    event,
    stripeCustomerId: action.customerId,
    stripeSubscriptionId: action.subscriptionId,
    status: "failed",
    error: syncError,
  });
  await createActivityLog({
    businessId: business.id,
    action: "billing.invoice_payment_failed",
    entityType: "business",
    entityId: business.id,
    metadata: {
      stripeEventId: event.id,
      stripeInvoiceId: action.invoiceId,
      stripeCustomerId: action.customerId,
      stripeSubscriptionId: action.subscriptionId,
      amountDue: action.amountDue,
      attemptCount: action.attemptCount,
      source: "stripe_webhook",
    },
  });
}

async function handleStripeCustomerUpdatedAction(
  event: Stripe.Event,
  action: Extract<StripeBillingWebhookAction, { kind: "customer_updated" }>,
  business: StripeWebhookBusinessContext | null
) {
  if (!business) return;
  await db
    .update(businesses)
    .set({
      billingHasPaymentMethod: action.hasPaymentMethod,
      billingPaymentMethodAddedAt: action.hasPaymentMethod ? new Date() : null,
      billingLastStripeSyncError: null,
      updatedAt: new Date(),
    })
    .where(eq(businesses.id, business.id));
  await markBusinessStripeSyncState({
    businessId: business.id,
    event,
    stripeCustomerId: action.customerId,
    stripeSubscriptionId: business.stripeSubscriptionId,
    status: "synced",
  });
}

/** GET /api/billing/status — subscription status for current business (optionalAuth). */
billingRouter.get(
  "/status",
  requireAuth,
  wrapAsync(async (req: Request, res: Response) => {
    res.json(await loadBillingStatusResponse(req, req.businessId));
  })
);

billingRouter.post(
  "/refresh-state",
  requireAuth,
  requireTenant,
  wrapAsync(async (req: Request, res: Response) => {
    const businessId = req.businessId;
    if (!businessId) {
      throw new BadRequestError("No business found.");
    }
    if (!canManageBilling(req)) {
      throw new ForbiddenError("Only owners and admins can refresh billing for this business.");
    }

    await refreshBusinessBillingStateFromStripe({ businessId });
    res.json(await loadBillingStatusResponse(req, businessId));
  })
);

billingRouter.post(
  "/prompt-event",
  requireAuth,
  requireTenant,
  wrapAsync(async (req: Request, res: Response) => {
    const businessId = req.businessId;
    if (!businessId) {
      throw new BadRequestError("No business found.");
    }
    const parsed = billingPromptEventSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError("Valid billing prompt event payload required.");
    }

    await recordBillingPromptEvent({
      businessId,
      userId: req.userId ?? null,
      event: parsed.data.event,
      stage: parsed.data.stage,
    });

    res.json({ ok: true });
  })
);

billingRouter.post(
  "/retry-setup",
  requireAuth,
  requireTenant,
  wrapAsync(async (req: Request, res: Response) => {
    const businessId = req.businessId;
    if (!businessId) {
      throw new BadRequestError("No business found.");
    }
    if (!canManageBilling(req)) {
      throw new ForbiddenError("Only owners and admins can retry billing setup for this business.");
    }

    const result = await retryBusinessTrialSubscription({
      businessId,
      triggeredByUserId: req.userId ?? null,
    });

    res.json({
      ok: true,
      accessState: result.accessState,
      status: result.subscriptionStatus,
    });
  })
);

billingRouter.post(
  "/connect/onboarding-link",
  requireAuth,
  requireTenant,
  wrapAsync(async (req: Request, res: Response) => {
    const businessId = req.businessId;
    const userId = req.userId;
    if (!businessId || !userId) {
      throw new BadRequestError("No business found.");
    }
    if (!canManageStripeConnect(req)) {
      throw new ForbiddenError("Only owners and admins can connect Stripe for this business.");
    }
    if (!isStripeConnectConfigured()) {
      throw new BadRequestError("Stripe Connect is not configured on the backend.");
    }

    const [business] = await db
      .select({
        id: businesses.id,
        name: businesses.name,
        stripeConnectAccountId: businesses.stripeConnectAccountId,
      })
      .from(businesses)
      .where(eq(businesses.id, businessId))
      .limit(1);
    if (!business) {
      throw new BadRequestError("Business not found.");
    }

    const [user] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    let accountId = business.stripeConnectAccountId ?? null;
    if (!accountId) {
      let account;
      try {
        account = await createConnectAccount({
          businessId,
          businessName: business.name,
          email: user?.email ?? null,
        });
      } catch (error) {
        throw new BadRequestError(getStripeConnectErrorMessage(error));
      }
      if (!account) {
        throw new BadRequestError("Stripe Connect is not configured on the backend.");
      }
      accountId = account.accountId;
      await db
        .update(businesses)
        .set({
          stripeConnectAccountId: account.accountId,
          stripeConnectDetailsSubmitted: account.detailsSubmitted,
          stripeConnectChargesEnabled: account.chargesEnabled,
          stripeConnectPayoutsEnabled: account.payoutsEnabled,
          stripeConnectOnboardedAt: account.ready ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(businesses.id, businessId));
    }

    const connectAccountId = accountId;
    if (!connectAccountId) {
      throw new BadRequestError("Could not create Stripe connected account.");
    }

    const base = process.env.FRONTEND_URL!;
    let link;
    try {
      link = await createConnectAccountLink({
        accountId: connectAccountId,
        refreshUrl: `${base}/settings?tab=billing&stripeConnect=refresh`,
        returnUrl: `${base}/settings?tab=billing&stripeConnect=return`,
      });
    } catch (error) {
      throw new BadRequestError(getStripeConnectErrorMessage(error));
    }
    if (!link) {
      throw new BadRequestError("Could not create Stripe onboarding link.");
    }
    res.json(link);
  })
);

billingRouter.post(
  "/connect/dashboard-link",
  requireAuth,
  requireTenant,
  wrapAsync(async (req: Request, res: Response) => {
    const businessId = req.businessId;
    if (!businessId) {
      throw new BadRequestError("No business found.");
    }
    if (!canManageStripeConnect(req)) {
      throw new ForbiddenError("Only owners and admins can access Stripe for this business.");
    }

    const [business] = await db
      .select({
        stripeConnectAccountId: businesses.stripeConnectAccountId,
      })
      .from(businesses)
      .where(eq(businesses.id, businessId))
      .limit(1);
    if (!business?.stripeConnectAccountId) {
      throw new BadRequestError("Connect a Stripe account first.");
    }

    let link;
    try {
      link = await createConnectLoginLink({
        accountId: business.stripeConnectAccountId,
      });
    } catch (error) {
      throw new BadRequestError(getStripeConnectErrorMessage(error));
    }
    if (!link) {
      throw new BadRequestError("Could not create Stripe dashboard link.");
    }
    res.json(link);
  })
);

/** POST /api/billing/create-checkout-session — start subscription (30-day trial). Requires auth + business. */
billingRouter.post(
  "/create-checkout-session",
  requireAuth,
  wrapAsync(async (req: Request, res: Response) => {
    const businessId = req.businessId;
    const userId = req.userId;
    if (!businessId || !userId) {
      throw new BadRequestError("Complete onboarding first to subscribe.");
    }
    const [user] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const [business] = await db
      .select({ stripeCustomerId: businesses.stripeCustomerId })
      .from(businesses)
      .where(eq(businesses.id, businessId))
      .limit(1);
    const email = user?.email;
    if (!email) throw new BadRequestError("User email required.");
    const base = process.env.FRONTEND_URL!;
    const result = await createCheckoutSession({
      businessId,
      customerEmail: email,
      customerId: business?.stripeCustomerId ?? null,
      successUrl: `${base}/settings?tab=billing&subscription=success`,
      cancelUrl: `${base}/subscribe?canceled=1`,
    });
    if (!result) {
      throw new BadRequestError(
        stripe
          ? "Stripe checkout is not configured. Add a valid STRIPE_PRICE_ID and redeploy."
          : "Stripe is not configured on the backend. Add STRIPE_SECRET_KEY and redeploy."
      );
    }
    res.json(result);
  })
);

/** POST /api/billing/portal — Stripe Customer Portal (manage subscription, payment method). */
billingRouter.post(
  "/portal",
  requireAuth,
  requireTenant,
  wrapAsync(async (req: Request, res: Response) => {
    const businessId = req.businessId;
    if (!businessId) throw new BadRequestError("No business found.");
    if (!canManageBilling(req)) {
      throw new ForbiddenError("Only owners and admins can access billing for this business.");
    }
    const [b] = await db
      .select({ stripeCustomerId: businesses.stripeCustomerId })
      .from(businesses)
      .where(eq(businesses.id, businessId))
      .limit(1);
    if (!b?.stripeCustomerId) {
      throw new BadRequestError("No billing account is ready yet. Retry setup from billing settings first.");
    }
    const parsed = billingPortalRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new BadRequestError("Invalid billing portal request.");
    }
    const promptStage = parsed.data.promptStage ?? null;
    if (promptStage) {
      await recordBillingPromptEvent({
        businessId,
        userId: req.userId ?? null,
        event: "converted",
        stage: promptStage,
      });
    }
    const result = await createPortalSession({
      customerId: b.stripeCustomerId,
      returnUrl: getBillingPortalReturnUrl(parsed.data.entryPoint),
    });
    if (!result) throw new BadRequestError("Stripe customer portal is not configured.");
    await createActivityLog({
      businessId,
      userId: req.userId ?? null,
      action: "billing.portal_session_created",
      entityType: "business",
      entityId: businessId,
      metadata: {
        entryPoint: parsed.data.entryPoint,
        promptStage,
        customerId: b.stripeCustomerId,
        membershipRole: req.membershipRole ?? null,
      },
    });
    logger.info("Stripe billing portal session created", {
      businessId,
      userId: req.userId ?? undefined,
      entryPoint: parsed.data.entryPoint,
      promptStage,
    });
    res.json(result);
  })
);

/** Webhook handler — must be used with raw body. Call from app with express.raw(). */
export async function handleStripeWebhook(
  req: Request,
  res: Response
): Promise<void> {
  const rawBody = req.body;
  if (!(rawBody instanceof Buffer)) {
    res.status(400).send("Webhook requires raw body");
    return;
  }
  const sig = req.headers["stripe-signature"] as string | undefined;
  if (!sig || !STRIPE_WEBHOOK_SECRET || !stripe) {
    logger.info("Stripe disabled: webhook ignored");
    res.status(200).json({ received: false, reason: "stripe_disabled" });
    return;
  }
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    logger.warn("Stripe webhook signature verification failed", { err });
    res.status(400).send("Invalid signature");
    return;
  }
  const action = deriveStripeBillingWebhookAction(event);
  const refs = getStripeActionRefs(action);
  let business: StripeWebhookBusinessContext | null = null;
  let webhookRecordId: string | null = null;

  try {
    business = await findBusinessForStripeAction(action);
    const started = await beginStripeWebhookProcessing({
      event,
      businessId: business?.id ?? null,
      stripeCustomerId: refs.stripeCustomerId,
      stripeSubscriptionId: refs.stripeSubscriptionId,
    });
    if (started.duplicate) {
      logger.info("Duplicate Stripe webhook ignored", {
        businessId: business?.id,
        stripeCustomerId: refs.stripeCustomerId,
        stripeSubscriptionId: refs.stripeSubscriptionId,
        stripeEventId: event.id,
        eventType: event.type,
      });
      res.sendStatus(200);
      return;
    }
    webhookRecordId = started.recordId;

    if (action.kind === "checkout_completed") {
      await handleStripeCheckoutCompletedEvent(event, action);
    } else if (action.kind === "subscription_snapshot") {
      await handleStripeSubscriptionSnapshotAction(event, action, business);
    } else if (action.kind === "trial_will_end") {
      await handleStripeTrialWillEndAction(event, action, business);
    } else if (action.kind === "subscription_deleted") {
      await handleStripeSubscriptionDeletedAction(event, action, business);
    } else if (action.kind === "invoice_lifecycle") {
      await handleStripeInvoiceLifecycleAction(event, action, business);
    } else if (action.kind === "customer_updated") {
      await handleStripeCustomerUpdatedAction(event, action, business);
    } else {
      logger.info("Stripe webhook event ignored", {
        stripeEventId: event.id,
        eventType: event.type,
      });
    }

    logger.info("Stripe webhook processed", {
      businessId: business?.id,
      stripeCustomerId: refs.stripeCustomerId,
      stripeSubscriptionId: refs.stripeSubscriptionId,
      stripeEventId: event.id,
      eventType: event.type,
    });
    await finalizeStripeWebhookProcessing({
      recordId: webhookRecordId,
      status: "processed",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Stripe webhook handler error", {
      businessId: business?.id,
      stripeCustomerId: refs.stripeCustomerId,
      stripeSubscriptionId: refs.stripeSubscriptionId,
      stripeEventId: event.id,
      eventType: event.type,
      error: message,
    });
    if (webhookRecordId) {
      await finalizeStripeWebhookProcessing({
        recordId: webhookRecordId,
        status: "failed",
        error: message,
      });
    }
    if (business) {
      await markBusinessStripeSyncState({
        businessId: business.id,
        event,
        stripeCustomerId: refs.stripeCustomerId,
        stripeSubscriptionId: refs.stripeSubscriptionId,
        status: "failed",
        error: message,
      });
    }
    if (err instanceof BadRequestError) {
      res.status(err.statusCode).send(err.message);
      return;
    }
    res.status(500).send("Webhook handler failed");
    return;
  }
  res.sendStatus(200);
}

billingRouter.post(
  "/connect/disconnect",
  requireAuth,
  requireTenant,
  wrapAsync(async (req: Request, res: Response) => {
    const businessId = req.businessId;
    if (!businessId) {
      throw new BadRequestError("No business found.");
    }
    if (!canManageStripeConnect(req)) {
      throw new ForbiddenError("Only owners and admins can disconnect Stripe for this business.");
    }

    const [business] = await db
      .select({
        stripeConnectAccountId: businesses.stripeConnectAccountId,
      })
      .from(businesses)
      .where(eq(businesses.id, businessId))
      .limit(1);
    if (!business?.stripeConnectAccountId) {
      throw new BadRequestError("No Stripe account is connected for this business.");
    }

    await db
      .update(businesses)
      .set({
        stripeConnectAccountId: null,
        stripeConnectDetailsSubmitted: false,
        stripeConnectChargesEnabled: false,
        stripeConnectPayoutsEnabled: false,
        stripeConnectOnboardedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(businesses.id, businessId));

    await createActivityLog({
      businessId,
      action: "billing.stripe_connect_disconnected",
      entityType: "business",
      entityId: businessId,
      metadata: {
        disconnectedAccountId: business.stripeConnectAccountId,
        source: "settings",
      },
    });

    res.json({ ok: true });
  })
);

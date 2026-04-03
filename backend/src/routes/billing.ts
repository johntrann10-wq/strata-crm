/**
 * Stripe billing: checkout session (subscribe), customer portal, webhook.
 */
import { Router, Request, Response } from "express";
import { db } from "../db/index.js";
import { businesses, invoices, users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
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
import { isStripeConfigured } from "../lib/env.js";
import { withIdempotency } from "../lib/idempotency.js";
import { createActivityLog } from "../lib/activity.js";
import { recordInvoicePayment } from "../lib/invoicePayments.js";
import { requireTenant } from "../middleware/tenant.js";

export const billingRouter = Router();

function isBillingEnforced(): boolean {
  return process.env.BILLING_ENFORCED === "true" && isStripeConfigured();
}

function canManageStripeConnect(req: Request): boolean {
  return req.membershipRole === "owner" || req.membershipRole === "admin";
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

/** GET /api/billing/status — subscription status for current business (optionalAuth). */
billingRouter.get(
  "/status",
  requireAuth,
  wrapAsync(async (req: Request, res: Response) => {
    const businessId = req.businessId;
    if (!businessId) {
      res.json({
        status: null,
        trialEndsAt: null,
        currentPeriodEnd: null,
        billingEnforced: isBillingEnforced(),
        checkoutConfigured: isStripeCheckoutConfigured(),
        portalConfigured: isStripePortalConfigured(),
      });
      return;
    }
    const [b] = await db
      .select({
        subscriptionStatus: businesses.subscriptionStatus,
        trialEndsAt: businesses.trialEndsAt,
        currentPeriodEnd: businesses.currentPeriodEnd,
      })
      .from(businesses)
      .where(eq(businesses.id, businessId))
      .limit(1);
    const connectStatus = await syncStripeConnectStatus(businessId);
    res.json({
      status: b?.subscriptionStatus ?? null,
      trialEndsAt: b?.trialEndsAt ?? null,
      currentPeriodEnd: b?.currentPeriodEnd ?? null,
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
    const email = user?.email;
    if (!email) throw new BadRequestError("User email required.");
    const base = process.env.FRONTEND_URL!;
    const result = await createCheckoutSession({
      businessId,
      customerEmail: email,
      successUrl: `${base}/signed-in?subscription=success`,
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
  wrapAsync(async (req: Request, res: Response) => {
    const businessId = req.businessId;
    if (!businessId) throw new BadRequestError("No business found.");
    const [b] = await db
      .select({ stripeCustomerId: businesses.stripeCustomerId })
      .from(businesses)
      .where(eq(businesses.id, businessId))
      .limit(1);
    if (!b?.stripeCustomerId) {
      throw new BadRequestError("No billing account. Subscribe first.");
    }
    const base = process.env.FRONTEND_URL!;
    const result = await createPortalSession({
      customerId: b.stripeCustomerId,
      returnUrl: `${base}/settings`,
    });
    if (!result) throw new BadRequestError("Stripe customer portal is not configured.");
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
  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const purpose = session.metadata?.purpose;
      if (purpose === "invoice_payment") {
        const businessId = session.metadata?.businessId;
        const invoiceId = session.metadata?.invoiceId;
        const sessionAmountTotal = session.amount_total;
        if (!businessId || !invoiceId || sessionAmountTotal == null) {
          logger.warn("Stripe invoice checkout completed without required metadata", {
            sessionId: session.id,
            businessId,
            invoiceId,
          });
        } else {
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
            logger.warn("Stripe invoice checkout completed for unexpected connected account", {
              sessionId: session.id,
              businessId,
              invoiceId,
              eventAccount: event.account,
              expectedAccount: business.stripeConnectAccountId,
            });
            res.status(400).send("Connected account mismatch");
            return;
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
            if (!message.toLowerCase().includes("duplicate request")) {
              throw error;
            }
            logger.info("Stripe invoice checkout webhook duplicate ignored", {
              sessionId: session.id,
              businessId,
              invoiceId,
            });
          }
        }
      } else {
        const businessId = session.metadata?.businessId;
        if (businessId && session.customer && session.subscription) {
          await db
            .update(businesses)
            .set({
              stripeCustomerId: typeof session.customer === "string" ? session.customer : session.customer.id,
              stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : session.subscription.id,
              subscriptionStatus: "trialing",
              trialEndsAt: null, // set by subscription.updated
              currentPeriodEnd: null,
              updatedAt: new Date(),
            })
            .where(eq(businesses.id, businessId));
        }
      }
    } else if (
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.created"
    ) {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
      let [b] = await db
        .select({ id: businesses.id })
        .from(businesses)
        .where(eq(businesses.stripeSubscriptionId, sub.id))
        .limit(1);
      if (!b && customerId) {
        [b] = await db
          .select({ id: businesses.id })
          .from(businesses)
          .where(eq(businesses.stripeCustomerId, customerId))
          .limit(1);
      }
      if (b) {
        const status = sub.status as string;
        const subAny = sub as { current_period_end?: number; trial_end?: number };
        const periodEnd = subAny.current_period_end
          ? new Date(subAny.current_period_end * 1000)
          : null;
        const trialEnd = subAny.trial_end ? new Date(subAny.trial_end * 1000) : null;
        await db
          .update(businesses)
          .set({
            subscriptionStatus: status,
            currentPeriodEnd: periodEnd,
            trialEndsAt: trialEnd,
            stripeSubscriptionId: sub.id,
            updatedAt: new Date(),
          })
          .where(eq(businesses.id, b.id));
      }
    } else if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      await db
        .update(businesses)
        .set({
          subscriptionStatus: "canceled",
          stripeSubscriptionId: null,
          currentPeriodEnd: null,
          trialEndsAt: null,
          updatedAt: new Date(),
        })
        .where(eq(businesses.stripeSubscriptionId, sub.id));
    }
  } catch (err) {
    logger.error("Stripe webhook handler error", { err, eventType: event.type });
    res.status(500).send("Webhook handler failed");
    return;
  }
  res.sendStatus(200);
}

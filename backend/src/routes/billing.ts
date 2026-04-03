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
  createCheckoutSession,
  createPortalSession,
  isStripeCheckoutConfigured,
  isStripePortalConfigured,
} from "../lib/stripe.js";
import { requireAuth } from "../middleware/auth.js";
import { BadRequestError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { wrapAsync } from "../lib/asyncHandler.js";
import { isStripeConfigured } from "../lib/env.js";
import { withIdempotency } from "../lib/idempotency.js";
import { createActivityLog } from "../lib/activity.js";
import { recordInvoicePayment } from "../lib/invoicePayments.js";

export const billingRouter = Router();

function isBillingEnforced(): boolean {
  return process.env.BILLING_ENFORCED === "true" && isStripeConfigured();
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
    res.json({
      status: b?.subscriptionStatus ?? null,
      trialEndsAt: b?.trialEndsAt ?? null,
      currentPeriodEnd: b?.currentPeriodEnd ?? null,
      billingEnforced: isBillingEnforced(),
      checkoutConfigured: isStripeCheckoutConfigured(),
      portalConfigured: isStripePortalConfigured(),
    });
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

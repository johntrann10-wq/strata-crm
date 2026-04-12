import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { db } from "../db/index.js";
import { businesses, users } from "../db/schema.js";
import { logger } from "./logger.js";
import {
  STRIPE_PRICE_ID,
  stripe,
} from "./stripe.js";
import {
  getBillingAccessStateForSubscriptionStatus,
  type BillingAccessState,
} from "./billingAccess.js";

const TRIAL_DAYS = 30;

type BusinessBillingSnapshot = {
  id: string;
  name: string;
  email: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string | null;
  billingAccessState: string | null;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  billingHasPaymentMethod: boolean | null;
  billingPaymentMethodAddedAt: Date | null;
};

function isDummyStripeEnvironment(): boolean {
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  const priceId = STRIPE_PRICE_ID.trim();
  return (
    process.env.NODE_ENV === "test" ||
    key.includes("dummy") ||
    priceId.includes("dummy")
  );
}

function addTrialDays(start: Date, days: number): Date {
  const next = new Date(start);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function deriveSubscriptionDates(subscription: Stripe.Subscription) {
  const trialStart =
    typeof subscription.trial_start === "number"
      ? new Date(subscription.trial_start * 1000)
      : null;
  const trialEnd =
    typeof subscription.trial_end === "number"
      ? new Date(subscription.trial_end * 1000)
      : null;
  const currentPeriodEnd =
    typeof subscription.items.data[0]?.current_period_end === "number"
      ? new Date(subscription.items.data[0].current_period_end * 1000)
      : null;
  return { trialStart, trialEnd, currentPeriodEnd };
}

async function loadBillingSnapshot(businessId: string): Promise<BusinessBillingSnapshot | null> {
  const [record] = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      email: businesses.email,
      stripeCustomerId: businesses.stripeCustomerId,
      stripeSubscriptionId: businesses.stripeSubscriptionId,
      subscriptionStatus: businesses.subscriptionStatus,
      billingAccessState: businesses.billingAccessState,
      trialStartedAt: businesses.trialStartedAt,
      trialEndsAt: businesses.trialEndsAt,
      currentPeriodEnd: businesses.currentPeriodEnd,
      billingHasPaymentMethod: businesses.billingHasPaymentMethod,
      billingPaymentMethodAddedAt: businesses.billingPaymentMethodAddedAt,
    })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  return record ?? null;
}

async function loadBusinessBillingContext(businessId: string): Promise<{
  business: BusinessBillingSnapshot | null;
  ownerEmail: string | null;
}> {
  const [record] = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      email: businesses.email,
      stripeCustomerId: businesses.stripeCustomerId,
      stripeSubscriptionId: businesses.stripeSubscriptionId,
      subscriptionStatus: businesses.subscriptionStatus,
      billingAccessState: businesses.billingAccessState,
      trialStartedAt: businesses.trialStartedAt,
      trialEndsAt: businesses.trialEndsAt,
      currentPeriodEnd: businesses.currentPeriodEnd,
      billingHasPaymentMethod: businesses.billingHasPaymentMethod,
      billingPaymentMethodAddedAt: businesses.billingPaymentMethodAddedAt,
      ownerEmail: users.email,
    })
    .from(businesses)
    .leftJoin(users, eq(users.id, businesses.ownerId))
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!record) {
    return { business: null, ownerEmail: null };
  }

  return {
    ownerEmail: record.ownerEmail ?? null,
    business: {
      id: record.id,
      name: record.name,
      email: record.email,
      stripeCustomerId: record.stripeCustomerId,
      stripeSubscriptionId: record.stripeSubscriptionId,
      subscriptionStatus: record.subscriptionStatus,
      billingAccessState: record.billingAccessState,
      trialStartedAt: record.trialStartedAt,
      trialEndsAt: record.trialEndsAt,
      currentPeriodEnd: record.currentPeriodEnd,
      billingHasPaymentMethod: record.billingHasPaymentMethod,
      billingPaymentMethodAddedAt: record.billingPaymentMethodAddedAt,
    },
  };
}

async function updateBusinessBillingState(
  businessId: string,
  updates: Partial<typeof businesses.$inferInsert>
): Promise<void> {
  await db
    .update(businesses)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(eq(businesses.id, businessId));
}

async function findExistingCustomerByBusinessId(businessId: string): Promise<Stripe.Customer | null> {
  if (!stripe) return null;
  try {
    const result = await stripe.customers.search({
      query: `metadata['businessId']:'${businessId}'`,
      limit: 1,
    });
    const customer = result.data.find((entry) => !entry.deleted);
    return customer ?? null;
  } catch (error) {
    logger.warn("Stripe customer search unavailable; falling back to local customer id only", {
      businessId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function findExistingSubscriptionForCustomer(
  customerId: string,
  businessId: string
): Promise<Stripe.Subscription | null> {
  if (!stripe) return null;
  const list = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 10,
  });
  const matching = list.data.find((subscription) => {
    if (subscription.metadata?.businessId === businessId) return true;
    return subscription.items.data.some((item) => item.price.id === STRIPE_PRICE_ID);
  });
  return matching ?? null;
}

function getStripePaymentMethodState(params: {
  subscription: Pick<Stripe.Subscription, "default_payment_method"> | null | undefined;
  customer: Pick<Stripe.Customer, "invoice_settings"> | null | undefined;
  snapshot: Pick<BusinessBillingSnapshot, "billingHasPaymentMethod" | "billingPaymentMethodAddedAt">;
}) {
  const subscriptionDefault = params.subscription?.default_payment_method;
  const customerDefault = params.customer?.invoice_settings?.default_payment_method;
  const hasPaymentMethod = Boolean(subscriptionDefault || customerDefault || params.snapshot.billingHasPaymentMethod);
  return {
    hasPaymentMethod,
    addedAt:
      hasPaymentMethod
        ? params.snapshot.billingPaymentMethodAddedAt ?? new Date()
        : null,
  };
}

async function syncBusinessFromSubscription(
  businessId: string,
  subscription: Stripe.Subscription,
  customerId: string,
  snapshot: Pick<BusinessBillingSnapshot, "billingHasPaymentMethod" | "billingPaymentMethodAddedAt">,
  customer?: Pick<Stripe.Customer, "invoice_settings"> | null
): Promise<void> {
  const { trialStart, trialEnd, currentPeriodEnd } = deriveSubscriptionDates(subscription);
  const paymentMethodState = getStripePaymentMethodState({
    subscription,
    customer,
    snapshot,
  });
  await updateBusinessBillingState(businessId, {
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
    billingAccessState: getBillingAccessStateForSubscriptionStatus(subscription.status),
    trialStartedAt: trialStart,
    trialEndsAt: trialEnd,
    currentPeriodEnd,
    billingHasPaymentMethod: paymentMethodState.hasPaymentMethod,
    billingPaymentMethodAddedAt: paymentMethodState.addedAt,
    billingSetupError: null,
    billingSetupFailedAt: null,
  });
}

async function ensureMockTrialSubscription(
  snapshot: BusinessBillingSnapshot,
  ownerEmail: string | null
): Promise<void> {
  const now = new Date();
  const existingTrialStart = snapshot.trialStartedAt ?? now;
  const existingTrialEnd = snapshot.trialEndsAt ?? addTrialDays(existingTrialStart, TRIAL_DAYS);
  const status = snapshot.subscriptionStatus ?? "trialing";
  const accessState = getBillingAccessStateForSubscriptionStatus(status);

  await updateBusinessBillingState(snapshot.id, {
    stripeCustomerId: snapshot.stripeCustomerId ?? `cus_mock_${snapshot.id.replace(/-/g, "")}`,
    stripeSubscriptionId: snapshot.stripeSubscriptionId ?? `sub_mock_${snapshot.id.replace(/-/g, "")}`,
    subscriptionStatus: status,
    billingAccessState: accessState,
    trialStartedAt: existingTrialStart,
    trialEndsAt: existingTrialEnd,
    currentPeriodEnd: existingTrialEnd,
    billingHasPaymentMethod: snapshot.billingHasPaymentMethod ?? false,
    billingPaymentMethodAddedAt: snapshot.billingPaymentMethodAddedAt ?? null,
    billingSetupError: null,
    billingSetupFailedAt: null,
  });

  logger.info("Provisioned mock Stripe trial subscription for non-live environment", {
    businessId: snapshot.id,
    ownerEmail,
    accessState,
  });
}

export async function ensureBusinessTrialSubscription(params: {
  businessId: string;
  triggeredByUserId?: string | null;
  allowPendingFailure?: boolean;
}): Promise<{
  accessState: BillingAccessState;
  subscriptionStatus: string | null;
}> {
  const { business, ownerEmail } = await loadBusinessBillingContext(params.businessId);
  if (!business) {
    throw new Error("Business not found for billing provisioning.");
  }

  try {
    if (!STRIPE_PRICE_ID.trim()) {
      throw new Error("Stripe price is not configured.");
    }

    if (isDummyStripeEnvironment()) {
      await ensureMockTrialSubscription(business, ownerEmail);
      return {
        accessState: "active_trial",
        subscriptionStatus: "trialing",
      };
    }

    if (!stripe) {
      throw new Error("Stripe is not configured on the backend.");
    }

    let customerId = business.stripeCustomerId;
    if (!customerId) {
      const existingCustomer = await findExistingCustomerByBusinessId(business.id);
      if (existingCustomer) {
        customerId = existingCustomer.id;
      }
    }

    if (!customerId) {
      const customer = await stripe.customers.create(
        {
          email: ownerEmail ?? business.email ?? undefined,
          name: business.name,
          metadata: {
            businessId: business.id,
          },
        },
        {
          idempotencyKey: `strata-business-customer-${business.id}`,
        }
      );
      customerId = customer.id;
    }

    let subscription: Stripe.Subscription | null = null;
    if (business.stripeSubscriptionId) {
      subscription = await stripe.subscriptions.retrieve(business.stripeSubscriptionId);
    }
    if (!subscription) {
      subscription = await findExistingSubscriptionForCustomer(customerId, business.id);
    }
    if (!subscription) {
      subscription = await stripe.subscriptions.create(
        {
          customer: customerId,
          items: [{ price: STRIPE_PRICE_ID }],
          trial_period_days: TRIAL_DAYS,
          payment_settings: {
            save_default_payment_method: "on_subscription",
          },
          trial_settings: {
            end_behavior: {
              missing_payment_method: "pause",
            },
          },
          metadata: {
            businessId: business.id,
          },
        },
        {
          idempotencyKey: `strata-business-subscription-${business.id}`,
        }
      );
    }

    let customer: Stripe.Customer | null = null;
    try {
      const retrievedCustomer = await stripe.customers.retrieve(customerId);
      customer = retrievedCustomer.deleted ? null : retrievedCustomer;
    } catch (error) {
      logger.warn("Failed to retrieve Stripe customer while syncing subscription", {
        businessId: business.id,
        customerId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    await syncBusinessFromSubscription(business.id, subscription, customerId, business, customer);
    return {
      accessState: getBillingAccessStateForSubscriptionStatus(subscription.status),
      subscriptionStatus: subscription.status,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Failed to provision Stripe trial subscription", {
      businessId: business.id,
      triggeredByUserId: params.triggeredByUserId ?? null,
      stripeCustomerId: business.stripeCustomerId,
      stripeSubscriptionId: business.stripeSubscriptionId,
      error: message,
    });

    await updateBusinessBillingState(business.id, {
      billingAccessState: "pending_setup_failure",
      billingSetupError: message,
      billingSetupFailedAt: new Date(),
    });

    if (!params.allowPendingFailure) {
      throw error;
    }

    return {
      accessState: "pending_setup_failure",
      subscriptionStatus: business.subscriptionStatus,
    };
  }
}

export async function retryBusinessTrialSubscription(params: {
  businessId: string;
  triggeredByUserId?: string | null;
}) {
  await updateBusinessBillingState(params.businessId, {
    billingAccessState: "pending_setup",
    billingSetupError: null,
    billingSetupFailedAt: null,
  });
  return ensureBusinessTrialSubscription({
    businessId: params.businessId,
    triggeredByUserId: params.triggeredByUserId,
    allowPendingFailure: true,
  });
}

export async function getBusinessBillingSnapshot(businessId: string): Promise<BusinessBillingSnapshot | null> {
  return loadBillingSnapshot(businessId);
}

export async function refreshBusinessBillingStateFromStripe(params: {
  businessId: string;
}): Promise<BusinessBillingSnapshot | null> {
  const snapshot = await loadBillingSnapshot(params.businessId);
  if (!snapshot) return null;

  if (isDummyStripeEnvironment() || !stripe) {
    return snapshot;
  }

  let customerId = snapshot.stripeCustomerId;
  if (!customerId) {
    const existingCustomer = await findExistingCustomerByBusinessId(snapshot.id);
    if (existingCustomer) customerId = existingCustomer.id;
  }
  if (!customerId) {
    return snapshot;
  }

  let customer: Stripe.Customer | null = null;
  try {
    const retrievedCustomer = await stripe.customers.retrieve(customerId);
    customer = retrievedCustomer.deleted ? null : retrievedCustomer;
  } catch (error) {
    logger.warn("Failed to refresh Stripe customer state", {
      businessId: snapshot.id,
      customerId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  let subscription: Stripe.Subscription | null = null;
  try {
    if (snapshot.stripeSubscriptionId) {
      subscription = await stripe.subscriptions.retrieve(snapshot.stripeSubscriptionId);
    }
  } catch (error) {
    logger.warn("Failed to retrieve Stripe subscription by stored id during billing refresh", {
      businessId: snapshot.id,
      stripeSubscriptionId: snapshot.stripeSubscriptionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  if (!subscription) {
    subscription = await findExistingSubscriptionForCustomer(customerId, snapshot.id);
  }

  if (subscription) {
    await syncBusinessFromSubscription(snapshot.id, subscription, customerId, snapshot, customer);
    return loadBillingSnapshot(snapshot.id);
  }

  const paymentMethodState = getStripePaymentMethodState({
    subscription: null,
    customer,
    snapshot,
  });
  if (
    paymentMethodState.hasPaymentMethod !== Boolean(snapshot.billingHasPaymentMethod) ||
    (paymentMethodState.addedAt?.getTime() ?? null) !== (snapshot.billingPaymentMethodAddedAt?.getTime() ?? null) ||
    customerId !== snapshot.stripeCustomerId
  ) {
    await updateBusinessBillingState(snapshot.id, {
      stripeCustomerId: customerId,
      billingHasPaymentMethod: paymentMethodState.hasPaymentMethod,
      billingPaymentMethodAddedAt: paymentMethodState.addedAt,
    });
    return loadBillingSnapshot(snapshot.id);
  }

  return snapshot;
}

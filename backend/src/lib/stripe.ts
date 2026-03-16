/**
 * Stripe billing: $29/month, first month free (30-day trial).
 * Set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_ID in env.
 */
import Stripe from "stripe";

const secretKey = process.env.STRIPE_SECRET_KEY;
export const stripe =
  secretKey && secretKey.startsWith("sk_")
    ? new Stripe(secretKey)
    : null;

export const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID ?? "";
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";

const TRIAL_DAYS = 30;

export async function createCheckoutSession(params: {
  businessId: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string } | null> {
  if (!stripe || !STRIPE_PRICE_ID) return null;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: params.customerEmail,
    line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
    subscription_data: { trial_period_days: TRIAL_DAYS },
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: { businessId: params.businessId },
    allow_promotion_codes: true,
  });
  return { url: session.url! };
}

export async function createPortalSession(params: {
  customerId: string;
  returnUrl: string;
}): Promise<{ url: string } | null> {
  if (!stripe) return null;
  const session = await stripe.billingPortal.sessions.create({
    customer: params.customerId,
    return_url: params.returnUrl,
  });
  return { url: session.url };
}

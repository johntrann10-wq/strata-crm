/**
 * Stripe billing: $29/month, first month free (30-day trial).
 * Set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_ID in env.
 */
import Stripe from "stripe";

const secretKey = process.env.STRIPE_SECRET_KEY;
// Avoid module-load crashes (TypeError) when env vars are missing.
// Startup env validation should still fail fast with a clear message.
export const stripe =
  secretKey && secretKey.trim() !== "" && secretKey.startsWith("sk_") ? new Stripe(secretKey) : null;

export const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID ?? "";
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";

const TRIAL_DAYS = 30;

export function isStripeCheckoutConfigured(): boolean {
  return !!(stripe && STRIPE_PRICE_ID.trim());
}

export function isStripePortalConfigured(): boolean {
  return !!stripe;
}

export function isStripeInvoiceCheckoutConfigured(): boolean {
  return !!stripe;
}

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

export async function createInvoicePaymentCheckoutSession(params: {
  businessId: string;
  invoiceId: string;
  invoiceNumber: string | null;
  amountCents: number;
  currency?: string | null;
  customerEmail?: string | null;
  customerName?: string | null;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string } | null> {
  if (!stripe) return null;
  const amountCents = Math.max(0, Math.round(params.amountCents));
  if (amountCents <= 0) return null;
  const currency = (params.currency ?? "usd").trim().toLowerCase() || "usd";
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: params.customerEmail ?? undefined,
    customer_creation: "always",
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    line_items: [
      {
        price_data: {
          currency,
          unit_amount: amountCents,
          product_data: {
            name: params.invoiceNumber ? `Invoice ${params.invoiceNumber}` : "Invoice payment",
            description: params.customerName ? `Payment for ${params.customerName}` : undefined,
          },
        },
        quantity: 1,
      },
    ],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: {
      purpose: "invoice_payment",
      businessId: params.businessId,
      invoiceId: params.invoiceId,
      invoiceNumber: params.invoiceNumber ?? "",
    },
    payment_intent_data: {
      metadata: {
        purpose: "invoice_payment",
        businessId: params.businessId,
        invoiceId: params.invoiceId,
        invoiceNumber: params.invoiceNumber ?? "",
      },
    },
  });
  return { url: session.url! };
}

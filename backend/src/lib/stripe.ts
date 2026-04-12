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

export function isStripeConnectConfigured(): boolean {
  return !!stripe;
}

export type StripeConnectAccountState = {
  accountId: string;
  accountType: Stripe.Account["type"];
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  ready: boolean;
};

export function getStripeConnectAccountState(
  account: Pick<Stripe.Account, "id" | "type" | "details_submitted" | "charges_enabled" | "payouts_enabled">
): StripeConnectAccountState {
  const detailsSubmitted = !!account.details_submitted;
  const chargesEnabled = !!account.charges_enabled;
  const payoutsEnabled = !!account.payouts_enabled;
  return {
    accountId: account.id,
    accountType: account.type,
    detailsSubmitted,
    chargesEnabled,
    payoutsEnabled,
    ready: detailsSubmitted && chargesEnabled && payoutsEnabled,
  };
}

export async function createCheckoutSession(params: {
  businessId: string;
  customerEmail: string;
  customerId?: string | null;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string } | null> {
  if (!stripe || !STRIPE_PRICE_ID) return null;
  const createSession = (customerId?: string | null) =>
    stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId ?? undefined,
      customer_email: customerId ? undefined : params.customerEmail,
      payment_method_collection: "if_required",
      line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
      subscription_data: {
        trial_period_days: TRIAL_DAYS,
        trial_settings: {
          end_behavior: {
            missing_payment_method: "pause",
          },
        },
      },
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: { businessId: params.businessId },
      allow_promotion_codes: true,
    });

  try {
    const session = await createSession(params.customerId ?? null);
    return { url: session.url! };
  } catch (error) {
    const stripeMessage = error instanceof Stripe.errors.StripeError ? error.message ?? "" : "";
    const isStaleCustomerError =
      Boolean(params.customerId) &&
      error instanceof Stripe.errors.StripeInvalidRequestError &&
      (error.code === "resource_missing" || /No such customer/i.test(stripeMessage));

    if (!isStaleCustomerError) {
      throw error;
    }

    const session = await createSession(null);
    return { url: session.url! };
  }
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

export async function createConnectAccount(params: {
  businessId: string;
  businessName: string;
  email?: string | null;
}): Promise<StripeConnectAccountState | null> {
  if (!stripe) return null;
  const account = await stripe.accounts.create({
    type: "standard",
    country: "US",
    email: params.email ?? undefined,
    business_type: "company",
    company: {
      name: params.businessName,
    },
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: {
      businessId: params.businessId,
    },
  });
  return getStripeConnectAccountState(account);
}

export async function createConnectAccountLink(params: {
  accountId: string;
  refreshUrl: string;
  returnUrl: string;
}): Promise<{ url: string } | null> {
  if (!stripe) return null;
  const link = await stripe.accountLinks.create({
    account: params.accountId,
    refresh_url: params.refreshUrl,
    return_url: params.returnUrl,
    type: "account_onboarding",
  });
  return { url: link.url };
}

export async function createConnectLoginLink(params: {
  accountId: string;
}): Promise<{ url: string } | null> {
  if (!stripe) return null;
  const account = await stripe.accounts.retrieve(params.accountId);
  if (account.deleted) return null;
  if (account.type === "standard") {
    return { url: "https://dashboard.stripe.com/" };
  }
  const link = await stripe.accounts.createLoginLink(params.accountId);
  return { url: link.url };
}

export async function retrieveConnectAccount(params: {
  accountId: string;
}): Promise<StripeConnectAccountState | null> {
  if (!stripe) return null;
  const account = await stripe.accounts.retrieve(params.accountId);
  if (account.deleted) return null;
  return getStripeConnectAccountState(account);
}

export async function retrieveCheckoutSession(params: {
  sessionId: string;
  connectedAccountId?: string | null;
}): Promise<Stripe.Checkout.Session | null> {
  if (!stripe) return null;
  const requestOptions =
    params.connectedAccountId && params.connectedAccountId.trim()
      ? { stripeAccount: params.connectedAccountId.trim() }
      : undefined;
  const sessionId = params.sessionId.trim();
  if (!sessionId) return null;
  return stripe.checkout.sessions.retrieve(sessionId, requestOptions);
}

export async function createInvoicePaymentCheckoutSession(params: {
  businessId: string;
  invoiceId: string;
  invoiceNumber: string | null;
  amountCents: number;
  connectedAccountId?: string | null;
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
  const requestOptions =
    params.connectedAccountId && params.connectedAccountId.trim()
      ? { stripeAccount: params.connectedAccountId.trim() }
      : undefined;
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
  }, requestOptions);
  return { url: session.url! };
}

export async function createAppointmentDepositCheckoutSession(params: {
  businessId: string;
  appointmentId: string;
  appointmentTitle?: string | null;
  amountCents: number;
  connectedAccountId?: string | null;
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
  const requestOptions =
    params.connectedAccountId && params.connectedAccountId.trim()
      ? { stripeAccount: params.connectedAccountId.trim() }
      : undefined;
  const session = await stripe.checkout.sessions.create(
    {
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
              name: params.appointmentTitle?.trim() || "Appointment deposit",
              description: params.customerName ? `Deposit for ${params.customerName}` : "Appointment deposit",
            },
          },
          quantity: 1,
        },
      ],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: {
        purpose: "appointment_deposit",
        businessId: params.businessId,
        appointmentId: params.appointmentId,
        appointmentTitle: params.appointmentTitle?.trim() || "",
      },
      payment_intent_data: {
        metadata: {
          purpose: "appointment_deposit",
          businessId: params.businessId,
          appointmentId: params.appointmentId,
          appointmentTitle: params.appointmentTitle?.trim() || "",
        },
      },
    },
    requestOptions
  );
  return { url: session.url! };
}

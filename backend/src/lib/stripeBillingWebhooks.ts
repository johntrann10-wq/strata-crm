import type Stripe from "stripe";

export type StripeBillingWebhookAction =
  | { kind: "checkout_completed"; session: Stripe.Checkout.Session }
  | {
      kind: "subscription_snapshot";
      eventType: string;
      customerId: string | null;
      subscriptionId: string;
      status: string;
      trialStart: Date | null;
      trialEnd: Date | null;
      currentPeriodEnd: Date | null;
      hasPaymentMethod: boolean;
    }
  | {
      kind: "subscription_deleted";
      eventType: string;
      customerId: string | null;
      subscriptionId: string;
      hasPaymentMethod: boolean;
    }
  | {
      kind: "trial_will_end";
      eventType: string;
      customerId: string | null;
      subscriptionId: string;
      status: string;
      trialEnd: Date | null;
      hasPaymentMethod: boolean;
    }
  | {
      kind: "invoice_lifecycle";
      eventType: "invoice.created" | "invoice.payment_failed" | "invoice.payment_succeeded";
      customerId: string | null;
      subscriptionId: string | null;
      invoiceId: string;
      invoiceStatus: string | null;
      amountDue: number | null;
      amountPaid: number | null;
      attemptCount: number | null;
    }
  | {
      kind: "customer_updated";
      eventType: string;
      customerId: string;
      hasPaymentMethod: boolean;
    }
  | { kind: "ignored"; eventType: string };

function getSubscriptionPeriodEnd(subscription: Stripe.Subscription): Date | null {
  const firstItem = subscription.items.data[0];
  return typeof firstItem?.current_period_end === "number"
    ? new Date(firstItem.current_period_end * 1000)
    : null;
}

function getSubscriptionTrialStart(subscription: Stripe.Subscription): Date | null {
  return typeof subscription.trial_start === "number"
    ? new Date(subscription.trial_start * 1000)
    : null;
}

function getSubscriptionTrialEnd(subscription: Stripe.Subscription): Date | null {
  return typeof subscription.trial_end === "number"
    ? new Date(subscription.trial_end * 1000)
    : null;
}

function getSubscriptionCustomerId(subscription: Stripe.Subscription): string | null {
  return typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer?.id ?? null;
}

function getInvoiceCustomerId(invoice: Stripe.Invoice): string | null {
  return typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null;
}

function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const invoiceWithSubscription = invoice as Stripe.Invoice & {
    subscription?: string | Stripe.Subscription | null;
  };
  return typeof invoiceWithSubscription.subscription === "string"
    ? invoiceWithSubscription.subscription
    : invoiceWithSubscription.subscription?.id ?? null;
}

export function deriveStripeBillingWebhookAction(event: Stripe.Event): StripeBillingWebhookAction {
  if (event.type === "checkout.session.completed") {
    return {
      kind: "checkout_completed",
      session: event.data.object as Stripe.Checkout.Session,
    };
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.paused" ||
    event.type === "customer.subscription.resumed"
  ) {
    const subscription = event.data.object as Stripe.Subscription;
    return {
      kind: "subscription_snapshot",
      eventType: event.type,
      customerId: getSubscriptionCustomerId(subscription),
      subscriptionId: subscription.id,
      status: subscription.status,
      trialStart: getSubscriptionTrialStart(subscription),
      trialEnd: getSubscriptionTrialEnd(subscription),
      currentPeriodEnd: getSubscriptionPeriodEnd(subscription),
      hasPaymentMethod: Boolean(subscription.default_payment_method),
    };
  }

  if (event.type === "customer.subscription.trial_will_end") {
    const subscription = event.data.object as Stripe.Subscription;
    return {
      kind: "trial_will_end",
      eventType: event.type,
      customerId: getSubscriptionCustomerId(subscription),
      subscriptionId: subscription.id,
      status: subscription.status,
      trialEnd: getSubscriptionTrialEnd(subscription),
      hasPaymentMethod: Boolean(subscription.default_payment_method),
    };
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    return {
      kind: "subscription_deleted",
      eventType: event.type,
      customerId: getSubscriptionCustomerId(subscription),
      subscriptionId: subscription.id,
      hasPaymentMethod: Boolean(subscription.default_payment_method),
    };
  }

  if (
    event.type === "invoice.created" ||
    event.type === "invoice.payment_failed" ||
    event.type === "invoice.payment_succeeded"
  ) {
    const invoice = event.data.object as Stripe.Invoice;
    return {
      kind: "invoice_lifecycle",
      eventType: event.type,
      customerId: getInvoiceCustomerId(invoice),
      subscriptionId: getInvoiceSubscriptionId(invoice),
      invoiceId: invoice.id,
      invoiceStatus: invoice.status ?? null,
      amountDue: typeof invoice.amount_due === "number" ? invoice.amount_due / 100 : null,
      amountPaid: typeof invoice.amount_paid === "number" ? invoice.amount_paid / 100 : null,
      attemptCount: typeof invoice.attempt_count === "number" ? invoice.attempt_count : null,
    };
  }

  if (event.type === "customer.updated") {
    const customer = event.data.object as Stripe.Customer;
    return {
      kind: "customer_updated",
      eventType: event.type,
      customerId: customer.id,
      hasPaymentMethod: Boolean(customer.invoice_settings?.default_payment_method),
    };
  }

  return {
    kind: "ignored",
    eventType: event.type,
  };
}

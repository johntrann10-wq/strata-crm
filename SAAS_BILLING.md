# Strata — Subscription Billing ($29/month, first month free)

This app is set up for paid subscriptions via **Stripe**.

## Pricing

- **$29/month** per business (tenant)
- **First month free** (30-day trial via Stripe subscription trial)
- Customers can cancel anytime from Stripe Customer Portal

## Flow

1. **Sign up** → User creates account
2. **Onboarding** → User creates business (name, type, etc.)
3. **Subscribe** → After onboarding, user is sent to `/subscribe`. Clicking "Continue to payment" creates a Stripe Checkout session (with 30-day trial) and redirects to Stripe.
4. **Checkout** → User enters payment method on Stripe; no charge until trial ends.
5. **Webhook** → Stripe sends `checkout.session.completed` and `customer.subscription.*` to `POST /api/billing/webhook`. Backend updates `businesses.stripeCustomerId`, `stripeSubscriptionId`, `subscriptionStatus`, `trialEndsAt`, `currentPeriodEnd`.
6. **App access** → All app API routes (calendar, clients, invoices, etc.) use `requireSubscription` middleware. If the business has no active/trialing subscription, the API returns **402** and the user must subscribe or renew.
7. **Settings → Billing** → "Manage subscription" opens Stripe Customer Portal (update payment method, cancel, view invoices).

## Backend

- **Schema**: `businesses` has `stripe_customer_id`, `stripe_subscription_id`, `subscription_status`, `trial_ends_at`, `current_period_end`. See [backend/MIGRATION_STAGE2.md](backend/MIGRATION_STAGE2.md) for SQL.
- **Routes**: `backend/src/routes/billing.ts` — `GET /api/billing/status`, `POST /api/billing/create-checkout-session`, `POST /api/billing/portal`, `POST /api/billing/webhook` (raw body).
- **Middleware**: `requireSubscription` in `backend/src/middleware/subscription.ts` allows access only when `subscriptionStatus` is `active` or `trialing` (or trial not yet ended).

## Stripe setup

1. Create a Stripe account and Product + Price: $29/month recurring. Copy the **Price ID** (`price_...`).
2. Set env: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, `FRONTEND_URL`.
3. Add webhook endpoint in Stripe Dashboard: `https://your-api.com/api/billing/webhook` with events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`. Use the signing secret as `STRIPE_WEBHOOK_SECRET`.
4. Configure [Stripe Customer Portal](https://dashboard.stripe.com/settings/billing/portal) so customers can update payment and cancel.

See [DEPLOY.md](DEPLOY.md) and [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) for full deployment steps.

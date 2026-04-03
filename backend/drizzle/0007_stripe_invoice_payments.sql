ALTER TABLE "payments" ADD COLUMN "stripe_checkout_session_id" text;
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "stripe_payment_intent_id" text;
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "stripe_charge_id" text;

DO $$
BEGIN
  CREATE TYPE "public"."appointment_job_phase" AS ENUM (
    'scheduled',
    'active_work',
    'waiting',
    'curing',
    'hold',
    'pickup_ready'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "job_start_time" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "expected_completion_time" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "pickup_ready_time" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "vehicle_on_site" boolean DEFAULT false;
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "job_phase" "appointment_job_phase" DEFAULT 'scheduled' NOT NULL;
--> statement-breakpoint
UPDATE "appointments"
SET
  "job_start_time" = "start_time",
  "expected_completion_time" = COALESCE("end_time", "start_time")
WHERE "job_start_time" IS NULL;

CREATE TABLE "service_categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid NOT NULL,
  "name" text NOT NULL,
  "key" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "service_categories" ADD CONSTRAINT "service_categories_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "service_categories_business_name_unique" ON "service_categories" USING btree ("business_id","name");
--> statement-breakpoint
CREATE UNIQUE INDEX "service_categories_business_key_unique" ON "service_categories" USING btree ("business_id","key");
--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "category_id" uuid;
--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_category_id_service_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."service_categories"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "service_categories" ("id", "business_id", "name", "key", "sort_order", "active", "created_at", "updated_at")
SELECT
  gen_random_uuid(),
  seed.business_id,
  seed.category_name,
  seed.category_key,
  seed.sort_order,
  true,
  now(),
  now()
FROM (
  SELECT DISTINCT
    s.business_id,
    s.category::text AS category_key,
    CASE s.category::text
      WHEN 'detail' THEN 'Detail'
      WHEN 'tint' THEN 'Tint'
      WHEN 'ppf' THEN 'PPF'
      WHEN 'mechanical' THEN 'Mechanical'
      WHEN 'tire' THEN 'Tire'
      WHEN 'body' THEN 'Body'
      ELSE 'Other'
    END AS category_name,
    CASE s.category::text
      WHEN 'detail' THEN 0
      WHEN 'tint' THEN 1
      WHEN 'ppf' THEN 2
      WHEN 'mechanical' THEN 3
      WHEN 'tire' THEN 4
      WHEN 'body' THEN 5
      ELSE 6
    END AS sort_order
  FROM "services" s
) seed
LEFT JOIN "service_categories" existing
  ON existing.business_id = seed.business_id
 AND existing.key = seed.category_key
WHERE existing.id IS NULL;
--> statement-breakpoint
UPDATE "services" s
SET "category_id" = c.id
FROM "service_categories" c
WHERE s.business_id = c.business_id
  AND c.key = s.category::text
  AND s.category_id IS NULL;

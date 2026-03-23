CREATE TYPE "public"."service_category" AS ENUM('detail', 'tint', 'ppf', 'mechanical', 'tire', 'body', 'other');--> statement-breakpoint
ALTER TABLE "services" RENAME COLUMN "description" TO "notes";--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "category" "service_category" DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "taxable" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "is_addon" boolean DEFAULT false;--> statement-breakpoint
CREATE TABLE "service_addon_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"parent_service_id" uuid NOT NULL,
	"addon_service_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "service_addon_links" ADD CONSTRAINT "service_addon_links_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_addon_links" ADD CONSTRAINT "service_addon_links_parent_service_id_services_id_fk" FOREIGN KEY ("parent_service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_addon_links" ADD CONSTRAINT "service_addon_links_addon_service_id_services_id_fk" FOREIGN KEY ("addon_service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "service_addon_links_parent_addon" ON "service_addon_links" USING btree ("parent_service_id","addon_service_id");--> statement-breakpoint

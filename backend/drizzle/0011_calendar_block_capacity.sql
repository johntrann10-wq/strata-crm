ALTER TABLE "businesses"
  ADD COLUMN IF NOT EXISTS "calendar_block_capacity_per_slot" integer DEFAULT 1;

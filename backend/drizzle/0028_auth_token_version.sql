ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "auth_token_version" integer NOT NULL DEFAULT 1;


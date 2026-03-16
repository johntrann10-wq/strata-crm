# Stage 2 schema changes

If `yarn db:generate` fails, add these columns manually:

**businesses**
- `staff_count` integer NULL
- `operating_hours` text NULL

**clients**
- `marketing_opt_in` boolean DEFAULT true

Example (PostgreSQL):

```sql
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS staff_count integer;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS operating_hours text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS marketing_opt_in boolean DEFAULT true;
```

**notification_logs (Stage 4)**
- `retry_count` integer NOT NULL DEFAULT 0
- `last_retry_at` timestamp with time zone NULL

```sql
ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0;
ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS last_retry_at timestamp with time zone;
```

Then run `yarn db:migrate` as usual (or use your migration workflow).

# Give This to Cursor

**Repo**: This repository (Strata — auto shop management). Ensure Cursor has access to the GitHub repo so it can read and push changes.

**Full brief**: Read and follow **CURSOR_BRIEF.md** in the repo root for complete scope.

**Instructions for Cursor**:

1. **Rewrite all backend logic** from Gadget APIs into production-ready **Node + TypeScript** (PostgreSQL, session/auth, multi-tenant by businessId). Implement all endpoints used by `web/api.ts` and `server/api/`.

2. **Fix all bugs** from the Gadget audit: multi-tenant isolation, email (SMTP), automations, invoices (totals/tax/void), and appointment lifecycle. Enforce **idempotency**, **logging**, **error handling**, and **type safety**.

3. **Add business-type-specific UI and logic** for tire shop vs detail shop vs body shop (e.g. services, forms, validation).

4. **Make all emails** (client and business) **customizable with templates**; add **weekly summary emails** for business users. Use `.env` SMTP_* and a template system.

5. **Fully test** calendar, appointment lifecycle, invoicing, payments, and automations. Optimize **dashboard and analytics**.

6. **Ensure production-ready builds**: frontend `yarn build` (Vercel/Netlify), Node backend (Render/Vercel/Heroku). Document deploy steps. Push a fully working version back to GitHub.

All details and API surface are in **CURSOR_BRIEF.md**.

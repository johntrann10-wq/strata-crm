# Legacy Gadget backend (archived)

This directory holds the **original Gadget.dev** app code: model actions, HTTP routes, permissions, and Gelly filters. It is **not built, deployed, or executed** in production.

**Production API:** the Node/TypeScript service in [`backend/`](../../backend/) at the repo root. The SPA calls that API (often as same-origin `/api/*`, proxied by Netlify edge or Vercel to `STRATA_API_ORIGIN`).

**Why keep this:** historical reference while migrating behavior and for occasional diff against the Gadget-era implementation.

Do not add new features here; implement them in `backend/`.

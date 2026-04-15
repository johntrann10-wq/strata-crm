# Strata Data Encryption Plan
Date: 2026-04-14

## Goal
Encrypt truly sensitive persisted secrets at the application layer without breaking search-heavy product workflows, customer-facing links, or day-to-day operator speed.

## Fields Encrypted
- `businesses.integration_webhook_secret`
  Why: outbound webhook signing secret can be used to forge Strata-signed events if leaked.
  Status: encrypted at rest with the integration vault on all new writes; legacy plaintext values can be backfilled.
- `integration_connections.encrypted_access_token`
  Why: external provider bearer tokens.
  Status: already encrypted at rest; retained as-is.
- `integration_connections.encrypted_refresh_token`
  Why: external provider refresh tokens.
  Status: already encrypted at rest; retained as-is.
- `integration_connections.encrypted_config`
  Why: provider configuration can contain sensitive integration credentials or account-level secrets.
  Status: already encrypted at rest; retained as-is.

## Fields Intentionally Not Encrypted In This Phase
- Client, appointment, job, and vehicle `notes` / `internal_notes`
  Reason: these fields are actively rendered, filtered, templated, and in some cases parsed by workflow logic. Blanket encryption would break search, calendar block detection, lead parsing, template generation, and operational speed.
- Stripe object ids, subscription ids, and webhook metadata summaries
  Reason: these are identifiers, not Stripe-owned card data. They remain useful for reconciliation and support workflows.
- Public document tokens
  Reason: these are not stored in plaintext tables as reusable bearer secrets; revocation and TTL hardening were addressed separately.

## Encryption Design
- Algorithm: AES-256-GCM authenticated encryption.
- Key source: environment-backed integration vault secrets.
- Ciphertext format:
  - New format: `v1:<keyId>:<iv>:<tag>:<ciphertext>`
  - Legacy format remains readable: `v1:<iv>:<tag>:<ciphertext>`
- Rotation support:
  - `INTEGRATION_VAULT_SECRET` is the active write key.
  - `INTEGRATION_VAULT_KEY_ID` labels new ciphertext.
  - `INTEGRATION_VAULT_PREVIOUS_SECRET` and `INTEGRATION_VAULT_PREVIOUS_KEY_ID` allow one-step decryption during rotation.

## Schema / Migration Changes
- No database schema change was required.
- Existing `businesses.integration_webhook_secret` stays in place and now stores ciphertext instead of plaintext.

## Backfill Strategy
1. Deploy code that can read both legacy plaintext and encrypted webhook secrets.
2. Run:
   - `npm --prefix backend run backfill:business-webhook-secrets`
3. Monitor logs for migrated row counts only; no secret values should appear.
4. After all environments are migrated, keep plaintext fallback reads only as a short-term compatibility bridge until confirmed clean.

## Rollout Notes
- New webhook secrets are rejected if the integration vault is not configured.
- Existing encrypted integration connection credentials remain compatible.
- Legacy plaintext business webhook secrets are opportunistically re-encrypted on business reads when the vault is configured.

## Rollback Notes
- Code rollback is safe only if the old code can tolerate encrypted `integration_webhook_secret` values.
- If emergency rollback is required, do not decrypt values in place. Prefer redeploying the current vault-aware code instead.
- Keep the previous vault secret configured during rotations until all old ciphertext is re-written with the new key.

## Validation
- Add unit coverage for encrypted reads/writes.
- Add compatibility coverage for legacy ciphertext and rotated keys.
- Keep logs redacted; only migration counts and row ids are acceptable operational output.

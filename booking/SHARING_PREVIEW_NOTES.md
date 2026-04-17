# Strata Sharing Preview Notes

## Public share URL strategy

- Public booking links should be shared directly as:
  - `/book/:businessId`
- Public service-request links should be shared directly as:
  - `/lead/:businessId`
- Keep meaningful booking query state when present:
  - `service`
  - `category`
- Strip transient params from the public preview/canonical state:
  - `step`
  - `source`
  - `campaign`
  - `utm_*`
  - `ref`
  - `builderPreview*`

## How the preview is selected

- Generic marketing pages still use the static Strata marketing preview image.
- Public booking and lead pages now expose business-aware metadata.
- Vercel rewrites `/book/:businessId` and `/lead/:businessId` into the `public-share-shell` edge handler before the SPA catch-all, so Meta gets route-specific HTML instead of the generic app shell.
- Netlify serves the same routes through the `public-share-preview` edge function.
- If the business has a configured booking logo, the preview image points to:
  - `/api/businesses/:businessId/public-brand-image`
- If no business logo is configured, the preview falls back to the global Strata preview image.

## Why Meta/Facebook should now pick up the right page

- Direct requests to `/book/:businessId` and `/lead/:businessId` now return an HTML shell with the correct:
  - canonical URL
  - `og:url`
  - `og:title`
  - `og:description`
  - `og:image`
  - `twitter:*` image/title/description tags
- This avoids relying only on client-side head updates, which Meta may ignore.

## Post-deploy Meta refresh process

1. Deploy frontend and backend changes together.
2. Open the page source for the public URL and confirm the final HTML contains the intended OG tags.
3. Open the [Meta Sharing Debugger](https://developers.facebook.com/tools/debug/).
4. Paste the exact public URL you want shared.
5. Click `Debug`.
6. Click `Scrape Again`.
7. Repeat `Scrape Again` once or twice if Meta still shows stale data.
8. Confirm:
   - `og:url` matches the intended public page
   - `og:image` points to the correct branded or fallback image
   - title/description match the page being shared

## Important rollout note

- Old posts may continue showing old cached previews.
- Always validate a fresh share after running the debugger.

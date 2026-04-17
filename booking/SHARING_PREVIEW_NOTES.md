# Strata Sharing Preview Notes

## Public share URL strategy

- Booking pages are shared and canonicalized as `/book/:businessId`.
- Service-request pages are shared and canonicalized as `/lead/:businessId`.
- The only public query params preserved in canonical and `og:url` are:
  - `service`
  - `category`
- Everything else is treated as transient and stripped from the public share URL:
  - `step`
  - `source`
  - `campaign`
  - `utm_*`
  - `ref`
  - `builderPreview*`
  - internal preview or editor state

## How the public preview is selected

- `/book/:businessId` and `/lead/:businessId` are the only public share entry points Meta should crawl.
- Vercel rewrites those routes into the `public-share-shell` handler before the SPA catch-all, so crawlers receive server-rendered share tags in the initial HTML.
- Netlify serves the same routes through the `public-share-preview` edge function.
- The share shell normalizes the canonical path to the public surface being rendered, so a booking page always exposes `/book/:businessId` and a lead page always exposes `/lead/:businessId` even if upstream payloads drift.
- Client-side `usePublicShareMeta` mirrors the same title, description, canonical URL, and image after hydration so browser state does not fight the crawled page source.

## Metadata contract

- Booking and lead public pages should expose one authoritative set of:
  - `<link rel="canonical">`
  - `og:url`
  - `og:title`
  - `og:description`
  - `og:image`
  - `twitter:url`
  - `twitter:title`
  - `twitter:description`
  - `twitter:image`
- Duplicate or stale competing tags should be removed before injecting public share metadata.
- Generic marketing pages continue using the global Strata preview image.
- Business-aware public pages use business-aware metadata:
  - booking pages prefer the booking preview image
  - lead pages prefer the business public brand image
  - both fall back to the global Strata social preview when no business-specific image is available

## Post-deploy Meta refresh process

1. Deploy frontend and backend changes together.
2. Open the final public share URL in page source form and confirm the HTML includes the expected canonical, `og:*`, and `twitter:*` tags.
3. Open the [Meta Sharing Debugger](https://developers.facebook.com/tools/debug/).
4. Paste the exact public URL that should be shared.
5. Click `Debug`.
6. Click `Scrape Again`.
7. If the preview is still stale, click `Scrape Again` one or two more times after the new deploy is fully live.
8. Confirm the debugger shows:
  - the final public URL, not a builder preview URL
  - `og:url` matching the intended `/book/:businessId` or `/lead/:businessId` share path
  - the expected `og:title` and `og:description`
  - the correct `og:image`
  - no internal editor, preview, or campaign-only params in the scraped canonical/share URL

## Rollout notes

- Old posts may keep showing old cached previews until Meta refreshes them.
- When testing service/category preselection, use the exact public URL you want customers to share.
- Do not debug with internal builder or admin URLs; Meta should only see the public `/book/*` or `/lead/*` route.

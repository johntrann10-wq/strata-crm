import { useEffect } from "react";

export const publicSocialPreviewVersion = "20260416c";

export type PublicShareMetadataPayload = {
  businessId: string;
  businessName: string;
  title: string;
  description: string;
  canonicalPath: string;
  imagePath: string | null;
  imageAlt: string;
};

export type ResolvedPublicShareMetadata = {
  title: string;
  description: string;
  canonicalUrl: string;
  imageUrl: string;
  imageAlt: string;
};

function trimTrailingSlashes(value: string) {
  return value.replace(/\/+$/, "");
}

function ensureLeadingSlash(value: string) {
  return value.startsWith("/") ? value : `/${value}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function buildAbsoluteUrl(origin: string, path: string) {
  return `${trimTrailingSlashes(origin)}${ensureLeadingSlash(path)}`;
}

const SHAREABLE_QUERY_KEYS = ["service", "category"] as const;

function buildCanonicalUrl(origin: string, canonicalPath: string, currentSearch = "") {
  const url = new URL(buildAbsoluteUrl(origin, canonicalPath));
  const currentParams = new URLSearchParams(currentSearch);
  for (const key of SHAREABLE_QUERY_KEYS) {
    const value = currentParams.get(key);
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
}

export function buildFallbackSocialImageUrl(origin: string) {
  return `${trimTrailingSlashes(origin)}/social-preview.png?v=${publicSocialPreviewVersion}`;
}

export function resolvePublicShareMetadata(
  payload: PublicShareMetadataPayload,
  origin: string,
  currentSearch = ""
): ResolvedPublicShareMetadata {
  const canonicalUrl = buildCanonicalUrl(origin, payload.canonicalPath, currentSearch);
  return {
    title: payload.title.trim() || payload.businessName.trim() || "Strata",
    description: payload.description.trim() || "Book online with a smoother customer flow powered by Strata.",
    canonicalUrl,
    imageUrl: payload.imagePath ? buildAbsoluteUrl(origin, payload.imagePath) : buildFallbackSocialImageUrl(origin),
    imageAlt: payload.imageAlt.trim() || `${payload.businessName.trim() || "Business"} booking preview`,
  };
}

function upsertHeadTag(html: string, pattern: RegExp, tag: string) {
  if (pattern.test(html)) return html.replace(pattern, tag);
  return html.replace("</head>", `  ${tag}\n</head>`);
}

export function injectPublicShareMetadata(html: string, metadata: ResolvedPublicShareMetadata) {
  let next = html;
  const title = escapeHtml(metadata.title);
  const description = escapeHtml(metadata.description);
  const canonicalUrl = escapeHtml(metadata.canonicalUrl);
  const imageUrl = escapeHtml(metadata.imageUrl);
  const imageAlt = escapeHtml(metadata.imageAlt);

  next = upsertHeadTag(next, /<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`);
  next = upsertHeadTag(next, /<meta\s+name="description"[^>]*>/i, `<meta name="description" content="${description}"/>`);
  next = upsertHeadTag(next, /<link\s+rel="canonical"[^>]*>/i, `<link rel="canonical" href="${canonicalUrl}"/>`);
  next = upsertHeadTag(next, /<meta\s+property="og:site_name"[^>]*>/i, `<meta property="og:site_name" content="Strata CRM"/>`);
  next = upsertHeadTag(next, /<meta\s+property="og:type"[^>]*>/i, `<meta property="og:type" content="website"/>`);
  next = upsertHeadTag(next, /<meta\s+property="og:url"[^>]*>/i, `<meta property="og:url" content="${canonicalUrl}"/>`);
  next = upsertHeadTag(next, /<meta\s+property="og:title"[^>]*>/i, `<meta property="og:title" content="${title}"/>`);
  next = upsertHeadTag(next, /<meta\s+property="og:description"[^>]*>/i, `<meta property="og:description" content="${description}"/>`);
  next = upsertHeadTag(next, /<meta\s+property="og:image"[^>]*>/i, `<meta property="og:image" content="${imageUrl}"/>`);
  next = upsertHeadTag(
    next,
    /<meta\s+property="og:image:secure_url"[^>]*>/i,
    `<meta property="og:image:secure_url" content="${imageUrl}"/>`
  );
  next = upsertHeadTag(
    next,
    /<meta\s+property="og:image:alt"[^>]*>/i,
    `<meta property="og:image:alt" content="${imageAlt}"/>`
  );
  next = upsertHeadTag(next, /<meta\s+name="twitter:card"[^>]*>/i, `<meta name="twitter:card" content="summary_large_image"/>`);
  next = upsertHeadTag(next, /<meta\s+name="twitter:url"[^>]*>/i, `<meta name="twitter:url" content="${canonicalUrl}"/>`);
  next = upsertHeadTag(next, /<meta\s+name="twitter:title"[^>]*>/i, `<meta name="twitter:title" content="${title}"/>`);
  next = upsertHeadTag(
    next,
    /<meta\s+name="twitter:description"[^>]*>/i,
    `<meta name="twitter:description" content="${description}"/>`
  );
  next = upsertHeadTag(next, /<meta\s+name="twitter:image"[^>]*>/i, `<meta name="twitter:image" content="${imageUrl}"/>`);
  next = upsertHeadTag(
    next,
    /<meta\s+name="twitter:image:alt"[^>]*>/i,
    `<meta name="twitter:image:alt" content="${imageAlt}"/>`
  );

  return next;
}

function syncMetaTag(params: {
  selector: string;
  attributes: Record<string, string>;
  content: string;
}) {
  const existing = document.head.querySelector(params.selector) as HTMLMetaElement | null;
  const element = existing ?? document.createElement("meta");
  const created = !existing;
  const previousAttributes = {
    content: element.getAttribute("content"),
    name: element.getAttribute("name"),
    property: element.getAttribute("property"),
  };

  for (const [key, value] of Object.entries(params.attributes)) {
    element.setAttribute(key, value);
  }
  element.setAttribute("content", params.content);

  if (created) document.head.appendChild(element);

  return () => {
    if (created) {
      element.remove();
      return;
    }
    if (previousAttributes.content == null) element.removeAttribute("content");
    else element.setAttribute("content", previousAttributes.content);
    if (previousAttributes.name == null) element.removeAttribute("name");
    else element.setAttribute("name", previousAttributes.name);
    if (previousAttributes.property == null) element.removeAttribute("property");
    else element.setAttribute("property", previousAttributes.property);
  };
}

function syncCanonicalLink(href: string) {
  const existing = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  const element = existing ?? document.createElement("link");
  const created = !existing;
  const previousHref = element.getAttribute("href");

  element.setAttribute("rel", "canonical");
  element.setAttribute("href", href);

  if (created) document.head.appendChild(element);

  return () => {
    if (created) {
      element.remove();
      return;
    }
    if (previousHref == null) element.removeAttribute("href");
    else element.setAttribute("href", previousHref);
  };
}

export function usePublicShareMeta(metadata: ResolvedPublicShareMetadata | null) {
  useEffect(() => {
    if (typeof document === "undefined" || !metadata) return;

    const previousTitle = document.title;
    document.title = metadata.title;

    const cleanups = [
      syncMetaTag({
        selector: 'meta[name="description"]',
        attributes: { name: "description" },
        content: metadata.description,
      }),
      syncMetaTag({
        selector: 'meta[property="og:site_name"]',
        attributes: { property: "og:site_name" },
        content: "Strata CRM",
      }),
      syncMetaTag({
        selector: 'meta[property="og:type"]',
        attributes: { property: "og:type" },
        content: "website",
      }),
      syncMetaTag({
        selector: 'meta[property="og:url"]',
        attributes: { property: "og:url" },
        content: metadata.canonicalUrl,
      }),
      syncMetaTag({
        selector: 'meta[property="og:title"]',
        attributes: { property: "og:title" },
        content: metadata.title,
      }),
      syncMetaTag({
        selector: 'meta[property="og:description"]',
        attributes: { property: "og:description" },
        content: metadata.description,
      }),
      syncMetaTag({
        selector: 'meta[property="og:image"]',
        attributes: { property: "og:image" },
        content: metadata.imageUrl,
      }),
      syncMetaTag({
        selector: 'meta[property="og:image:secure_url"]',
        attributes: { property: "og:image:secure_url" },
        content: metadata.imageUrl,
      }),
      syncMetaTag({
        selector: 'meta[property="og:image:alt"]',
        attributes: { property: "og:image:alt" },
        content: metadata.imageAlt,
      }),
      syncMetaTag({
        selector: 'meta[name="twitter:card"]',
        attributes: { name: "twitter:card" },
        content: "summary_large_image",
      }),
      syncMetaTag({
        selector: 'meta[name="twitter:url"]',
        attributes: { name: "twitter:url" },
        content: metadata.canonicalUrl,
      }),
      syncMetaTag({
        selector: 'meta[name="twitter:title"]',
        attributes: { name: "twitter:title" },
        content: metadata.title,
      }),
      syncMetaTag({
        selector: 'meta[name="twitter:description"]',
        attributes: { name: "twitter:description" },
        content: metadata.description,
      }),
      syncMetaTag({
        selector: 'meta[name="twitter:image"]',
        attributes: { name: "twitter:image" },
        content: metadata.imageUrl,
      }),
      syncMetaTag({
        selector: 'meta[name="twitter:image:alt"]',
        attributes: { name: "twitter:image:alt" },
        content: metadata.imageAlt,
      }),
      syncCanonicalLink(metadata.canonicalUrl),
    ];

    return () => {
      document.title = previousTitle;
      for (const cleanup of cleanups.reverse()) cleanup();
    };
  }, [metadata]);
}

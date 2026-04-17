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

export function buildCanonicalUrl(origin: string, canonicalPath: string, currentSearch = "") {
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

function stripHeadTags(html: string, pattern: RegExp) {
  return html.replace(pattern, "");
}

export function injectPublicShareMetadata(html: string, metadata: ResolvedPublicShareMetadata) {
  let next = html;
  const title = escapeHtml(metadata.title);
  const description = escapeHtml(metadata.description);
  const canonicalUrl = escapeHtml(metadata.canonicalUrl);
  const imageUrl = escapeHtml(metadata.imageUrl);
  const imageAlt = escapeHtml(metadata.imageAlt);

  const patterns = [
    /<title>[\s\S]*?<\/title>/gi,
    /<meta\s+name="description"[^>]*>/gi,
    /<link\s+rel="canonical"[^>]*>/gi,
    /<meta\s+property="og:site_name"[^>]*>/gi,
    /<meta\s+property="og:type"[^>]*>/gi,
    /<meta\s+property="og:url"[^>]*>/gi,
    /<meta\s+property="og:title"[^>]*>/gi,
    /<meta\s+property="og:description"[^>]*>/gi,
    /<meta\s+property="og:image"[^>]*>/gi,
    /<meta\s+property="og:image:secure_url"[^>]*>/gi,
    /<meta\s+property="og:image:alt"[^>]*>/gi,
    /<meta\s+property="og:image:width"[^>]*>/gi,
    /<meta\s+property="og:image:height"[^>]*>/gi,
    /<meta\s+name="twitter:card"[^>]*>/gi,
    /<meta\s+name="twitter:url"[^>]*>/gi,
    /<meta\s+name="twitter:title"[^>]*>/gi,
    /<meta\s+name="twitter:description"[^>]*>/gi,
    /<meta\s+name="twitter:image"[^>]*>/gi,
    /<meta\s+name="twitter:image:alt"[^>]*>/gi,
  ];
  for (const pattern of patterns) {
    next = stripHeadTags(next, pattern);
  }

  const shareTags = [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}"/>`,
    `<link rel="canonical" href="${canonicalUrl}"/>`,
    `<meta property="og:site_name" content="Strata CRM"/>`,
    `<meta property="og:type" content="website"/>`,
    `<meta property="og:url" content="${canonicalUrl}"/>`,
    `<meta property="og:title" content="${title}"/>`,
    `<meta property="og:description" content="${description}"/>`,
    `<meta property="og:image" content="${imageUrl}"/>`,
    `<meta property="og:image:secure_url" content="${imageUrl}"/>`,
    `<meta property="og:image:alt" content="${imageAlt}"/>`,
    `<meta name="twitter:card" content="summary_large_image"/>`,
    `<meta name="twitter:url" content="${canonicalUrl}"/>`,
    `<meta name="twitter:title" content="${title}"/>`,
    `<meta name="twitter:description" content="${description}"/>`,
    `<meta name="twitter:image" content="${imageUrl}"/>`,
    `<meta name="twitter:image:alt" content="${imageAlt}"/>`,
  ];
  for (const tag of shareTags) {
    next = upsertHeadTag(next, /$^/, tag);
  }

  return next;
}

function syncMetaTag(params: {
  selector: string;
  attributes: Record<string, string>;
  content: string;
}) {
  const matches = [...document.head.querySelectorAll(params.selector)] as HTMLMetaElement[];
  const existing = matches[0] ?? null;
  const extras = matches.slice(1);
  const element = existing ?? document.createElement("meta");
  const created = !existing;
  const previousAttributes = {
    content: element.getAttribute("content"),
    name: element.getAttribute("name"),
    property: element.getAttribute("property"),
  };
  const removedExtras = extras.map((entry) => entry.cloneNode(true) as HTMLMetaElement);

  for (const extra of extras) extra.remove();

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
    for (const extra of removedExtras) {
      document.head.appendChild(extra);
    }
  };
}

function syncCanonicalLink(href: string) {
  const matches = [...document.head.querySelectorAll('link[rel="canonical"]')] as HTMLLinkElement[];
  const existing = matches[0] ?? null;
  const extras = matches.slice(1);
  const element = existing ?? document.createElement("link");
  const created = !existing;
  const previousHref = element.getAttribute("href");
  const removedExtras = extras.map((entry) => entry.cloneNode(true) as HTMLLinkElement);

  for (const extra of extras) extra.remove();

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
    for (const extra of removedExtras) {
      document.head.appendChild(extra);
    }
  };
}

function removeHeadTags(selector: string) {
  const elements = [...document.head.querySelectorAll(selector)] as HTMLElement[];
  if (elements.length === 0) return () => undefined;

  const entries = elements.map((element) => ({
    element,
    nextSibling: element.nextSibling,
  }));

  for (const { element } of entries) {
    element.remove();
  }

  return () => {
    for (const { element, nextSibling } of entries) {
      if (nextSibling && nextSibling.parentNode === document.head) {
        document.head.insertBefore(element, nextSibling);
      } else {
        document.head.appendChild(element);
      }
    }
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
      removeHeadTags('meta[property="og:image:width"]'),
      removeHeadTags('meta[property="og:image:height"]'),
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

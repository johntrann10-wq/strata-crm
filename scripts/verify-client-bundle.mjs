/**
 * Post-build verification for the SPA client bundle.
 * - Fail if forbidden API host strings appear in client assets
 * - Patch the static SPA shell with stable SEO/social metadata
 * - Copy stable preview/icon assets into build/client for crawlers
 */
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const root = path.join(repoRoot, "build/client");
const staticIndexPath = path.join(root, "index.html");
const siteUrl = "https://stratacrm.app";
const homepageSocialPreviewFileName = "social-preview-home-20260417b.png";
const fallbackTitle = "Strata CRM | Scheduling, CRM, Invoices, and Payments for Auto Service Shops";
const fallbackDescription =
  "Strata CRM helps automotive service businesses run scheduling, clients, vehicles, jobs, quotes, invoices, deposits, team access, and payments in one clear operating system.";
const stableSocialImagePath = `/${homepageSocialPreviewFileName}`;
const stableSocialImageUrl = `${siteUrl}${stableSocialImagePath}`;
const configuredApiOrigin =
  process.env.VITE_API_URL?.trim() || process.env.NEXT_PUBLIC_API_URL?.trim() || "";
const configuredApiHost = configuredApiOrigin ? new URL(configuredApiOrigin).host.toLowerCase() : "";
const forbidden = [{ re: /strata\.gadget\.app/i, msg: "strata.gadget.app (legacy Gadget host)" }];
const forbiddenSecrets = [
  { re: /\bsk_(live|test)_[A-Za-z0-9]+\b/i, msg: "Stripe secret key" },
  { re: /\bwhsec_[A-Za-z0-9]+\b/i, msg: "Stripe webhook secret" },
  { re: /\bre_[A-Za-z0-9]{8,}\b/i, msg: "Resend API key" },
  { re: /\bghp_[A-Za-z0-9]{20,}\b/i, msg: "GitHub personal access token" },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/i, msg: "private key material" },
];
const configuredIosAppIdentifiers = Array.from(
  new Set(
    [
      process.env.IOS_APP_IDENTIFIER,
      process.env.IOS_APP_IDENTIFIERS,
      process.env.APPLE_APP_IDENTIFIER,
      process.env.APPLE_APP_IDENTIFIERS,
    ]
      .flatMap((value) => value?.split(",") ?? [])
      .map((value) => value.trim())
      .filter(Boolean),
  ),
);

if (configuredApiHost && configuredApiHost !== "localhost" && configuredApiHost !== "127.0.0.1") {
  forbidden.push({
    re: /railway\.app/i,
    msg: `unexpected railway.app host (expected only ${configuredApiHost})`,
    allow: new RegExp(configuredApiHost.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
  });
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(filePath);
      continue;
    }

    if (!/\.(js|css|html)$/i.test(entry.name)) continue;

    const contents = fs.readFileSync(filePath, "utf8");
    for (const { re, msg, allow } of forbidden) {
      if (re.test(contents) && !(allow && allow.test(contents))) {
        console.error(`[verify-client-bundle] Forbidden pattern (${msg}) in ${filePath}`);
        process.exit(1);
      }
    }

    for (const { re, msg } of forbiddenSecrets) {
      if (re.test(contents)) {
        console.error(`[verify-client-bundle] Client bundle appears to contain ${msg} in ${filePath}`);
        process.exit(1);
      }
    }
  }
}

function ensureStaticAsset(sourceRelativePath, destinationFileName) {
  const sourcePath = path.join(repoRoot, "web", sourceRelativePath);
  const destinationPath = path.join(root, destinationFileName);
  if (!fs.existsSync(sourcePath)) {
    console.warn(`[verify-client-bundle] missing source asset: ${sourcePath}`);
    return;
  }
  fs.copyFileSync(sourcePath, destinationPath);
}

function upsertTag(html, tagMarkup, matcher) {
  if (matcher.test(html)) {
    return html.replace(matcher, tagMarkup);
  }

  return html.replace("</head>", `    ${tagMarkup}\n</head>`);
}

function patchSpaIndexHead() {
  if (!fs.existsSync(staticIndexPath)) {
    console.warn("[verify-client-bundle] build/client/index.html missing - skip SPA head patch");
    return;
  }

  let html = fs.readFileSync(staticIndexPath, "utf8");
  if (!html.includes("<head>")) {
    console.warn("[verify-client-bundle] index.html missing <head> - skip SPA head patch");
    return;
  }

  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${fallbackTitle}</title>`);

  const headTags = [
    [`<meta name="description" content="${fallbackDescription}"/>`, /<meta\s+name="description"[^>]*>/i],
    [`<meta name="application-name" content="Strata CRM"/>`, /<meta\s+name="application-name"[^>]*>/i],
    [`<meta name="theme-color" content="#f97316"/>`, /<meta\s+name="theme-color"[^>]*>/i],
    [`<meta property="og:site_name" content="Strata CRM"/>`, /<meta\s+property="og:site_name"[^>]*>/i],
    [`<meta property="og:type" content="website"/>`, /<meta\s+property="og:type"[^>]*>/i],
    [`<meta property="og:url" content="${siteUrl}/"/>`, /<meta\s+property="og:url"[^>]*>/i],
    [`<meta property="og:title" content="${fallbackTitle}"/>`, /<meta\s+property="og:title"[^>]*>/i],
    [`<meta property="og:description" content="${fallbackDescription}"/>`, /<meta\s+property="og:description"[^>]*>/i],
    [`<meta property="og:image" content="${stableSocialImageUrl}"/>`, /<meta\s+property="og:image"[^>]*>/i],
    [`<meta property="og:image:secure_url" content="${stableSocialImageUrl}"/>`, /<meta\s+property="og:image:secure_url"[^>]*>/i],
    [`<meta property="og:image:width" content="1200"/>`, /<meta\s+property="og:image:width"[^>]*>/i],
    [`<meta property="og:image:height" content="630"/>`, /<meta\s+property="og:image:height"[^>]*>/i],
    [
      `<meta property="og:image:alt" content="Strata CRM preview showing scheduling, CRM, invoicing, and payments for automotive service shops."/>`,
      /<meta\s+property="og:image:alt"[^>]*>/i,
    ],
    [`<meta name="twitter:card" content="summary_large_image"/>`, /<meta\s+name="twitter:card"[^>]*>/i],
    [`<meta name="twitter:url" content="${siteUrl}/"/>`, /<meta\s+name="twitter:url"[^>]*>/i],
    [`<meta name="twitter:title" content="${fallbackTitle}"/>`, /<meta\s+name="twitter:title"[^>]*>/i],
    [`<meta name="twitter:description" content="${fallbackDescription}"/>`, /<meta\s+name="twitter:description"[^>]*>/i],
    [`<meta name="twitter:image" content="${stableSocialImageUrl}"/>`, /<meta\s+name="twitter:image"[^>]*>/i],
    [
      `<meta name="twitter:image:alt" content="Strata CRM preview showing scheduling, CRM, invoicing, and payments for automotive service shops."/>`,
      /<meta\s+name="twitter:image:alt"[^>]*>/i,
    ],
    [`<link rel="canonical" href="${siteUrl}/"/>`, /<link\s+rel="canonical"[^>]*>/i],
    [`<link rel="icon" href="/favicon.svg" type="image/svg+xml"/>`, /<link\s+rel="icon"[^>]*favicon\.svg[^>]*>/i],
    [`<link rel="shortcut icon" href="/favicon.svg" type="image/svg+xml"/>`, /<link\s+rel="shortcut icon"[^>]*>/i],
    [`<link rel="apple-touch-icon" href="/apple-touch-icon.png"/>`, /<link\s+rel="apple-touch-icon"[^>]*>/i],
  ];

  for (const [tagMarkup, matcher] of headTags) {
    html = upsertTag(html, tagMarkup, matcher);
  }

  fs.writeFileSync(staticIndexPath, html);
  console.log("[verify-client-bundle] Patched static SPA metadata in build/client/index.html");
}

function writeAppleAssociationFiles() {
  const associationPayload = {
    applinks: {
      details: configuredIosAppIdentifiers.length
        ? [
            {
              appIDs: configuredIosAppIdentifiers,
              components: [
                {
                  "/": "/app-return",
                  comment: "Handle Safari-to-app auth return links inside the Strata iOS shell.",
                },
                {
                  "/": "/app-return/*",
                  comment: "Allow iOS handoffs that append a trailing slash or nested auth-return path.",
                },
              ],
            },
          ]
        : [],
    },
    webcredentials: {
      apps: configuredIosAppIdentifiers,
    },
  };

  const outputPaths = [
    path.join(root, "apple-app-site-association"),
    path.join(root, ".well-known", "apple-app-site-association"),
  ];
  const associationJson = JSON.stringify(associationPayload, null, 2);

  for (const outputPath of outputPaths) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, associationJson);
  }

  if (!configuredIosAppIdentifiers.length) {
    console.warn(
      "[verify-client-bundle] Wrote placeholder apple-app-site-association files with no app identifiers. Set IOS_APP_IDENTIFIER (or IOS_APP_IDENTIFIERS) in production to enable universal links.",
    );
    return;
  }

  console.log(
    `[verify-client-bundle] Wrote apple-app-site-association for ${configuredIosAppIdentifiers.join(", ")}`,
  );
}

if (!fs.existsSync(root)) {
  console.warn("[verify-client-bundle] build/client missing - skip");
  process.exit(0);
}

walk(root);
ensureStaticAsset("social-preview.png", "social-preview.png");
ensureStaticAsset("social-preview.png", homepageSocialPreviewFileName);
ensureStaticAsset("favicon.svg", "favicon.svg");
ensureStaticAsset("apple-touch-icon.png", "apple-touch-icon.png");
patchSpaIndexHead();
writeAppleAssociationFiles();
console.log("[verify-client-bundle] OK (no forbidden API host strings)");

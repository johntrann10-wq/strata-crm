import {
  injectPublicShareMetadata,
  resolvePublicShareMetadata,
  type PublicShareMetadataPayload,
} from "../web/lib/publicShareMeta";

type PublicShareSurface = "booking" | "lead";

function extractBusinessId(pathname: string, surface: PublicShareSurface) {
  const prefix = surface === "booking" ? "/book/" : "/lead/";
  if (!pathname.startsWith(prefix)) return null;
  const remainder = pathname.slice(prefix.length);
  const businessId = remainder.split("/")[0];
  return businessId ? decodeURIComponent(businessId) : null;
}

function shareMetadataEndpoint(surface: PublicShareSurface, businessId: string) {
  if (surface === "booking") {
    return `/api/businesses/${encodeURIComponent(businessId)}/public-booking-share-metadata`;
  }
  return `/api/businesses/${encodeURIComponent(businessId)}/public-lead-share-metadata`;
}

export async function renderPublicShareShell(request: Request, surface: PublicShareSurface): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return fetch(new URL("/index.html", request.url).toString(), { method: request.method });
  }

  const currentUrl = new URL(request.url);
  const businessId = extractBusinessId(currentUrl.pathname, surface);
  const shellResponse = await fetch(new URL("/index.html", currentUrl).toString(), {
    headers: { Accept: "text/html" },
  });

  if (!businessId || !shellResponse.ok) {
    return new Response(request.method === "HEAD" ? null : await shellResponse.text(), {
      status: shellResponse.status,
      headers: shellResponse.headers,
    });
  }

  const metadataResponse = await fetch(new URL(shareMetadataEndpoint(surface, businessId), currentUrl).toString(), {
    headers: { Accept: "application/json" },
  }).catch(() => null);

  const shellHtml = await shellResponse.text();
  if (!metadataResponse?.ok) {
    return new Response(request.method === "HEAD" ? null : shellHtml, {
      status: shellResponse.status,
      headers: shellResponse.headers,
    });
  }

  const payload = (await metadataResponse.json()) as PublicShareMetadataPayload;
  const html = injectPublicShareMetadata(
    shellHtml,
    resolvePublicShareMetadata(payload, currentUrl.origin, currentUrl.search)
  );

  const headers = new Headers(shellResponse.headers);
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "no-cache, must-revalidate");

  return new Response(request.method === "HEAD" ? null : html, {
    status: shellResponse.status,
    headers,
  });
}

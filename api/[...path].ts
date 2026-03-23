/**
 * Vercel Edge proxy only — not part of the legacy Gadget `api/` tree (see `legacy/gadget/`).
 * Forwards same-origin /api/* to the real API host.
 * Set STRATA_API_ORIGIN (e.g. https://your-api.onrender.com) in Vercel env — no VITE_API_URL needed for the browser.
 * Falls back to VITE_API_URL if present so one variable can serve build + proxy during migration.
 */
export const config = { runtime: "edge" };

export default async function handler(request: Request): Promise<Response> {
  const raw =
    process.env.STRATA_API_ORIGIN?.trim() ||
    process.env.VITE_API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    "";
  const upstream = raw.replace(/\/+$/, "");
  if (!upstream) {
    return new Response(
      JSON.stringify({
        message:
          "Proxy misconfiguration: set STRATA_API_ORIGIN (or VITE_API_URL / NEXT_PUBLIC_API_URL) on Vercel to your backend origin.",
      }),
      { status: 502, headers: { "Content-Type": "application/json; charset=utf-8" } }
    );
  }

  const incoming = new URL(request.url);
  const targetUrl = `${upstream}${incoming.pathname}${incoming.search}`;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === "host" || lower === "connection") return;
    if (lower === "content-length") return;
    headers.set(key, value);
  });

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    const buf = await request.arrayBuffer();
    if (buf.byteLength) init.body = buf;
  }

  return fetch(targetUrl, init);
}

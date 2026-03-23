/** Same-origin /api proxy for Netlify Edge. Set STRATA_API_ORIGIN (or VITE_API_URL / NEXT_PUBLIC_API_URL). */
declare const Netlify: { env: { get: (key: string) => string | undefined } };

export default async function strataApiProxy(request: Request): Promise<Response> {
  const raw =
    Netlify.env.get("STRATA_API_ORIGIN")?.trim() ||
    Netlify.env.get("VITE_API_URL")?.trim() ||
    Netlify.env.get("NEXT_PUBLIC_API_URL")?.trim() ||
    "";
  const upstream = raw.replace(/\/+$/, "");
  if (!upstream) {
    return new Response(
      JSON.stringify({
        message:
          "Proxy misconfiguration: set STRATA_API_ORIGIN (or VITE_API_URL / NEXT_PUBLIC_API_URL) on Netlify to your backend origin.",
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

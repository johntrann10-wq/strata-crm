import { renderPublicShareShell } from "../public-share/publicPageShell";

export const config = { runtime: "edge" };

type PublicShareSurface = "booking" | "lead";

function buildPublicRouteRequest(
  request: Request
): { request: Request; surface: PublicShareSurface } | null {
  const incoming = new URL(request.url);
  const surface = incoming.searchParams.get("surface");
  const businessId = incoming.searchParams.get("businessId");

  if (!businessId || (surface !== "booking" && surface !== "lead")) {
    return null;
  }

  incoming.searchParams.delete("surface");
  incoming.searchParams.delete("businessId");
  incoming.pathname =
    surface === "booking"
      ? `/book/${encodeURIComponent(businessId)}`
      : `/lead/${encodeURIComponent(businessId)}`;

  return {
    surface,
    request: new Request(incoming.toString(), request),
  };
}

export default async function handler(request: Request): Promise<Response> {
  const resolved = buildPublicRouteRequest(request);
  if (!resolved) {
    return new Response("Not found", { status: 404 });
  }

  return renderPublicShareShell(resolved.request, resolved.surface);
}

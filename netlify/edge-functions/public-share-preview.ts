import { renderPublicShareShell } from "../../public-share/publicPageShell";

export default async function publicSharePreview(request: Request): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  if (pathname.startsWith("/lead/")) {
    return renderPublicShareShell(request, "lead");
  }
  return renderPublicShareShell(request, "booking");
}

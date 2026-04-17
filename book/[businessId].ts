import { renderPublicShareShell } from "../public-share/publicPageShell";

export const config = { runtime: "edge" };

export default async function handler(request: Request): Promise<Response> {
  return renderPublicShareShell(request, "booking");
}

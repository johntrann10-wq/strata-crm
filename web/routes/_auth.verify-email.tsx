import { Link, useOutletContext } from "react-router";
import type { RootOutletContext } from "../root";
import type { Route } from "./+types/_auth.verify-email";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const apiBase = process.env.API_BASE ?? "";
  try {
    const res = await fetch(`${apiBase}/api/auth/verify-email?code=${encodeURIComponent(code ?? "")}`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { success: false, error: { message: (data as { message?: string }).message ?? "Verification failed" } };
    return { success: true, error: null };
  } catch (error) {
    return { success: false, error: { message: (error as Error).message } };
  }
};

export default function ({ loaderData }: Route.ComponentProps) {
  const context = useOutletContext<RootOutletContext>();
  const signInPath = context.gadgetConfig?.authentication?.signInPath ?? "/sign-in";
  const { success, error } = loaderData;

  if (error) {
    return <p className="format-message error">{error.message}</p>;
  }

  return success ? (
    <p className="format-message success">
      Email has been verified successfully. <Link to={signInPath}>Sign in now</Link>
    </p>
  ) : null;
}
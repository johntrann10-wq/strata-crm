import { Link, useOutletContext } from "react-router";
import type { RootOutletContext } from "../root";

// SPA mode: no loader; verification is handled on the backend when the user
// clicks the link, this page just shows a success message and sign-in link.
export default function VerifyEmailStatic() {
  const context = useOutletContext<RootOutletContext>();
  const signInPath = context.gadgetConfig?.authentication?.signInPath ?? "/sign-in";

  return (
    <p className="format-message success">
      If your verification link is valid, your email has been verified.{" "}
      <Link to={signInPath}>Sign in now</Link>
    </p>
  );
}
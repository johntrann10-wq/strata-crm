import { SignInComponent } from "@/components/auth/sign-in";
import { useNavigate, useOutletContext } from "react-router";
import type { RootOutletContext } from "../root";

export default function AuthSignInRoute() {
  const { gadgetConfig } = useOutletContext<RootOutletContext>();
  const navigate = useNavigate();
  const afterAuth =
    gadgetConfig?.authentication?.redirectOnSuccessfulSignInPath ?? "/signed-in";

  return (
    <SignInComponent
      options={{
        onSuccess: () => navigate(afterAuth, { replace: true }),
      }}
    />
  );
}
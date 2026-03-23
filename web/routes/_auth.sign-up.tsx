import { SignUpComponent } from "@/components/auth/sign-up";
import { useNavigate, useOutletContext } from "react-router";
import type { RootOutletContext } from "../root";

export default function AuthSignUpRoute() {
  const { gadgetConfig } = useOutletContext<RootOutletContext>();
  const navigate = useNavigate();
  const afterAuth =
    gadgetConfig?.authentication?.redirectOnSuccessfulSignInPath ?? "/signed-in";

  return (
    <SignUpComponent
      options={{
        onSuccess: () => navigate(afterAuth, { replace: true }),
      }}
    />
  );
}
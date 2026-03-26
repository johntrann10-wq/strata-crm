import { SignUpComponent } from "@/components/auth/sign-up";
import { useNavigate } from "react-router";

export default function AuthSignUpRoute() {
  const navigate = useNavigate();

  return (
    <SignUpComponent
      options={{
        onSuccess: () => navigate("/onboarding", { replace: true }),
      }}
    />
  );
}

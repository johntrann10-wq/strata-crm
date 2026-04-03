import { SignUpComponent } from "@/components/auth/sign-up";
import { useNavigate, useSearchParams } from "react-router";

export default function AuthSignUpRoute() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isInviteFlow = Boolean(searchParams.get("inviteToken"));

  return (
    <SignUpComponent
      options={{
        onSuccess: () => navigate(isInviteFlow ? "/signed-in" : "/onboarding", { replace: true }),
      }}
    />
  );
}

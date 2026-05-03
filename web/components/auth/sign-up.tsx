import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionForm } from "../../hooks/useApi";
import { AppleAuthButton } from "./AppleAuthButton";
import { AuthSupportLinks } from "./AuthSupportLinks";
import { GoogleMark } from "./GoogleMark";
import { Link, useLocation, useNavigate } from "react-router";
import { api, API_BASE } from "../../api";
import { StrataLogoLockup } from "@/components/brand/StrataLogo";
import { trackEvent } from "@/lib/analytics";
import { buildGoogleAuthRedirectPath, isNativeIOSApp, openNativeBrowserUrl } from "@/lib/mobileShell";
import { useMemo, useState, type FormEvent, type MouseEvent } from "react";

function buildGoogleAuthHref(search: string): string {
  const params = new URLSearchParams(search);
  params.set("redirectPath", buildGoogleAuthRedirectPath(search));
  const query = params.toString();
  const authOrigin = isNativeIOSApp() ? "https://stratacrm.app" : API_BASE;
  return `${authOrigin}/api/auth/google/start${query ? `?${query}` : ""}`;
}

export const SignUpComponent = (props: {
  options?: Parameters<typeof useActionForm>[1];
  searchParamsOverride?: string;
  overrideOnSignIn?: () => void;
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const search = props.searchParamsOverride ?? location.search;
  const googleAuthHref = buildGoogleAuthHref(search);
  const isNativeIOSSession = isNativeIOSApp();
  const showGoogleSignup = !isNativeIOSSession;
  const inviteState = useMemo(() => {
    const params = new URLSearchParams(search);
    return {
      inviteToken: params.get("inviteToken") ?? "",
      email: params.get("email") ?? "",
      firstName: params.get("firstName") ?? "",
      lastName: params.get("lastName") ?? "",
      businessName: params.get("businessName") ?? "",
    };
  }, [search]);
  const isInviteFlow = Boolean(inviteState.inviteToken);

  const {
    submit,
    register,
    formState: { errors, isSubmitting },
  } = useActionForm(api.user.signUp, {
    ...props.options,
    onSuccess: (...args) => {
      trackEvent("signup_completed", { method: "email" });
      props.options?.onSuccess?.(...args);
    },
  });
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);
  const [googleError, setGoogleError] = useState<string | null>(null);

  const handleGoogleSignUp = async (event: MouseEvent<HTMLAnchorElement>) => {
    trackEvent("signup_started", { method: "google", invite_flow: isInviteFlow });
    setGoogleError(null);
    if (!isNativeIOSSession) return;
    event.preventDefault();
    try {
      await openNativeBrowserUrl(googleAuthHref);
    } catch {
      setGoogleError("Google sign-up could not open right now. Use Apple or email to finish signup in-app.");
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");
    if (password !== confirmPassword) {
      event.preventDefault();
      setConfirmPasswordError("Passwords do not match.");
      return;
    }
    setConfirmPasswordError(null);
    setGoogleError(null);
    trackEvent("signup_started", { method: "email", invite_flow: isInviteFlow });
    void submit(event);
  };

  const authError = googleError ?? errors?.root?.message ?? null;

  return (
    <div className="mx-auto w-full max-w-[24rem] sm:max-w-md">
      <div className="mx-auto mb-6 flex flex-col items-center gap-3 sm:mb-8">
        <StrataLogoLockup
          className="flex-col gap-3"
          markClassName="h-10 w-10"
          wordmarkClassName="text-[15px] font-semibold tracking-tight text-foreground"
        />
      </div>

      <div className="mb-6 text-center sm:mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[22px]">
          {isNativeIOSSession ? "Set up Strata access" : "Create your account"}
        </h1>
        <p className="mt-1.5 text-[15px] leading-6 text-muted-foreground sm:text-[13px] sm:leading-5">
          {isInviteFlow && inviteState.businessName
            ? `Finish joining ${inviteState.businessName} and claim your team access.`
            : isNativeIOSSession
              ? "Set up secure access for the mobile app."
              : "Start your free Strata account and get a full 30-day trial."}
        </p>
      </div>

      <Card className="rounded-[1.75rem] border-white/70 bg-white/94 p-5 shadow-[0_24px_60px_rgba(15,23,42,0.10)] sm:p-8">
        <form onSubmit={handleSubmit}>
          {inviteState.inviteToken ? <input type="hidden" name="inviteToken" value={inviteState.inviteToken} /> : null}
          <div className="flex flex-col gap-5">
            {isInviteFlow ? (
              <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-left text-[12px] text-orange-900">
                Use the invited email below to claim your team access. Once you finish setup, your shop permissions will be attached automatically.
              </div>
            ) : null}


            {authError ? (
              <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-left">
                <p className="text-[13px] font-semibold text-destructive">
                  {isNativeIOSSession ? "We couldn't set up access yet." : "We couldn't create your account yet."}
                </p>
                <p className="mt-1 text-[13px] text-destructive/90">{authError}</p>
                <p className="mt-2 text-[12px] text-muted-foreground">Try again in the app. If the problem keeps happening, support is linked below.</p>
              </div>
            ) : null}

            <div className="flex flex-col gap-3">
              <AppleAuthButton
                inviteFlow={isInviteFlow}
                inviteToken={inviteState.inviteToken || undefined}
                mode="sign-up"
                onSuccess={() => {
                  props.options?.onSuccess?.();
                  if (!props.options?.onSuccess) {
                    navigate(isInviteFlow ? "/signed-in" : "/onboarding", { replace: true });
                  }
                }}
              />

              {showGoogleSignup ? (
                <Button
                  variant="outline"
                  className="h-11 w-full rounded-lg text-[15px] font-medium shadow-none sm:h-9 sm:text-[13px]"
                  asChild
                >
                  <a href={googleAuthHref} onClick={(event) => void handleGoogleSignUp(event)}>
                    <GoogleMark className="mr-2 h-4 w-4 shrink-0" />
                    Start free trial with Google
                  </a>
                </Button>
              ) : null}
            </div>

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-[12px] text-muted-foreground">or</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Email and password</p>
                <p className="mt-1 text-[13px] text-muted-foreground">Use email and password.</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="firstName" className="text-[13px] font-medium text-foreground">
                    First name
                  </Label>
                  <Input
                    id="firstName"
                    placeholder="Jane"
                    autoComplete="given-name"
                    {...register("firstName")}
                    defaultValue={inviteState.firstName}
                    className="h-11 rounded-lg text-[15px] shadow-none sm:h-9 sm:text-[13px]"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="lastName" className="text-[13px] font-medium text-foreground">
                    Last name
                  </Label>
                  <Input
                    id="lastName"
                    placeholder="Doe"
                    autoComplete="family-name"
                    {...register("lastName")}
                    defaultValue={inviteState.lastName}
                    className="h-11 rounded-lg text-[15px] shadow-none sm:h-9 sm:text-[13px]"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email" className="text-[13px] font-medium text-foreground">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  inputMode="email"
                  enterKeyHint="next"
                  {...register("email")}
                  defaultValue={inviteState.email}
                  readOnly={isInviteFlow}
                  className={`h-11 rounded-lg text-[15px] shadow-none sm:h-9 sm:text-[13px]${authError ? " border-destructive" : ""}`}
                />
                <p className="text-[12px] text-muted-foreground">
                  If your shop already added you to the team, use that same email to claim your access.
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password" className="text-[13px] font-medium text-foreground">
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="********"
                  autoComplete="new-password"
                  enterKeyHint="next"
                  {...register("password")}
                  className={`h-11 rounded-lg text-[15px] shadow-none sm:h-9 sm:text-[13px]${authError ? " border-destructive" : ""}`}
                />
                <p className="text-[12px] text-muted-foreground">Use at least 8 characters so your account is easier to protect.</p>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="confirmPassword" className="text-[13px] font-medium text-foreground">
                  Confirm password
                </Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  placeholder="********"
                  autoComplete="new-password"
                  enterKeyHint="done"
                  onChange={() => setConfirmPasswordError(null)}
                  className={`h-11 rounded-lg text-[15px] shadow-none sm:h-9 sm:text-[13px]${confirmPasswordError ? " border-destructive" : ""}`}
                />
                {confirmPasswordError ? <p className="text-[12px] text-destructive">{confirmPasswordError}</p> : null}
              </div>
            </div>

            <Button
              className="mt-1 h-11 w-full rounded-lg border-0 bg-orange-500 text-[15px] font-medium text-white shadow-none hover:bg-orange-500/90 sm:h-9 sm:text-[13px]"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? (isNativeIOSSession ? "Setting up access..." : "Creating account...") : isNativeIOSSession ? "Continue with email" : "Start free trial"}
            </Button>

            {!isNativeIOSSession ? (
              <p className="text-center text-[12px] text-muted-foreground">
                30-day free trial - No card required - Founder pricing $29/mo
              </p>
            ) : null}
          </div>
        </form>
      </Card>

      <p className="mt-6 text-center text-[15px] leading-6 text-muted-foreground sm:text-[13px] sm:leading-5">
        {isNativeIOSSession ? "Already set up?" : "Already have an account?"}{" "}
        <Link
          className="font-medium text-foreground hover:underline"
          to={`/sign-in${search}`}
          onClick={(e) => {
            trackEvent("signin_viewed", { source: "sign_up_screen" });
            if (!props.overrideOnSignIn) return;
            e.preventDefault();
            props.overrideOnSignIn?.();
          }}
        >
          Sign in
        </Link>
      </p>
      <AuthSupportLinks className="mt-4" />
    </div>
  );
};

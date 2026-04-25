import { type MouseEvent, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { StrataLogoLockup } from "@/components/brand/StrataLogo";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trackEvent } from "@/lib/analytics";
import { buildGoogleAuthRedirectPath, isNativeShell, openNativeBrowserUrl } from "@/lib/mobileShell";
import { api, API_BASE } from "../../api";
import { useActionForm } from "../../hooks/useApi";
import { AppleAuthButton } from "./AppleAuthButton";
import { AuthSupportLinks } from "./AuthSupportLinks";
import { GoogleMark } from "./GoogleMark";

function buildGoogleAuthHref(search: string) {
  const params = new URLSearchParams(search);
  params.set("redirectPath", buildGoogleAuthRedirectPath(search));
  const query = params.toString();
  const authOrigin = isNativeShell() ? "https://stratacrm.app" : API_BASE;
  return `${authOrigin}/api/auth/google/start${query ? `?${query}` : ""}`;
}

export const SignInComponent = (props: {
  options?: Parameters<typeof useActionForm>[1];
  searchParamsOverride?: string;
  overrideOnSignUp?: () => void;
}) => {
  const location = useLocation();
  const search = props.searchParamsOverride ?? location.search;
  const navigate = useNavigate();
  const fallbackAfterAuth = "/signed-in";
  const googleAuthHref = buildGoogleAuthHref(search);
  const isNativeShellSession = isNativeShell();
  const [googleError, setGoogleError] = useState<string | null>(null);
  const inviteState = useMemo(() => {
    const params = new URLSearchParams(search);
    return {
      inviteToken: params.get("inviteToken") ?? "",
      email: params.get("email") ?? "",
      businessName: params.get("businessName") ?? "",
      accountDeleted: params.get("accountDeleted") === "1",
    };
  }, [search]);
  const isInviteFlow = Boolean(inviteState.inviteToken);

  const {
    submit,
    register,
    formState: { errors, isSubmitting },
  } = useActionForm(api.user.signIn, {
    ...props.options,
    onSuccess: () => {
      trackEvent("signin_completed", { method: "email" });
      props.options?.onSuccess?.();
      if (!props.options?.onSuccess) {
        navigate(fallbackAfterAuth, { replace: true });
      }
    },
  });

  const handleGoogleSignIn = async (event: MouseEvent<HTMLAnchorElement>) => {
    trackEvent("signin_started", { method: "google" });
    setGoogleError(null);
    if (!isNativeShellSession) return;
    event.preventDefault();
    try {
      await openNativeBrowserUrl(googleAuthHref);
    } catch {
      setGoogleError("Google sign-in could not open right now. Try again, or use Apple or email instead.");
    }
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
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[22px]">Welcome back</h1>
        <p className="mt-1.5 text-[15px] leading-6 text-muted-foreground sm:text-[13px] sm:leading-5">
          {isInviteFlow && inviteState.businessName
            ? `Sign in to join ${inviteState.businessName} with your existing account.`
            : "Sign in to your account"}
        </p>
      </div>

      <Card className="rounded-[1.75rem] border-white/70 bg-white/94 p-5 shadow-[0_24px_60px_rgba(15,23,42,0.10)] sm:p-8">
        <form
          onSubmit={(event) => {
            trackEvent("signin_started", { method: "email" });
            setGoogleError(null);
            void submit(event);
          }}
        >
          {inviteState.accountDeleted ? (
            <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-left text-[12px] text-emerald-900">
              Your account was deleted successfully. If you need retained billing or tax records from a previous
              workspace, contact support.
            </div>
          ) : null}

          {isInviteFlow ? (
            <div className="mb-5 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-left text-[12px] text-orange-900">
              Already have a Strata login? Sign in with the invited email below and your team access will be attached automatically.
            </div>
          ) : null}

          {isNativeShellSession ? (
            <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50/90 px-4 py-3 text-left text-[12px] text-slate-700">
              Use Apple, Google, or email with the same Strata account. Google opens a secure browser sheet and returns to Strata when finished.
            </div>
          ) : null}

          {authError ? (
            <div className="mb-5 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-left">
              <p className="text-[13px] font-semibold text-destructive">We couldn&apos;t sign you in yet.</p>
              <p className="mt-1 text-[13px] text-destructive/90">{authError}</p>
              <p className="mt-2 text-[12px] text-muted-foreground">Check your details and try again. If it keeps happening, support is linked below.</p>
            </div>
          ) : null}

          <div className="flex flex-col gap-3">
            <AppleAuthButton
              inviteFlow={isInviteFlow}
              inviteToken={inviteState.inviteToken || undefined}
              mode="sign-in"
              onSuccess={() => {
                props.options?.onSuccess?.();
                if (!props.options?.onSuccess) {
                  navigate(fallbackAfterAuth, { replace: true });
                }
              }}
            />

            <a
              href={googleAuthHref}
              onClick={(event) => void handleGoogleSignIn(event)}
              className="flex h-11 w-full items-center justify-center gap-2.5 rounded-lg border border-border bg-background text-[15px] font-medium transition-colors hover:bg-muted sm:h-10 sm:text-[13px]"
            >
              <GoogleMark className="h-4 w-4 shrink-0" />
              Sign in with Google
            </a>
          </div>

          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Email and password</p>
              <p className="mt-1 text-[13px] text-muted-foreground">Use the same credentials you already use in Strata.</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="mb-1.5 block text-[13px] font-medium text-foreground/80 sm:text-[12px]">
                Email
              </label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                inputMode="email"
                enterKeyHint="next"
                autoFocus={!isInviteFlow}
                {...register("email")}
                defaultValue={inviteState.email}
                className={`h-11 rounded-lg text-[15px] sm:h-9 sm:text-[13px]${authError ? " border-destructive" : ""}`}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="password" className="block text-[13px] font-medium text-foreground/80 sm:text-[12px]">
                  Password
                </label>
                <Link to={`/forgot-password${search}`} className="text-[13px] font-medium text-orange-600 hover:underline sm:text-[12px]">
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="........"
                autoComplete="current-password"
                enterKeyHint="done"
                {...register("password")}
                className={`h-11 rounded-lg text-[15px] sm:h-9 sm:text-[13px]${authError ? " border-destructive" : ""}`}
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-1 h-11 w-full cursor-pointer rounded-lg border-0 bg-orange-500 text-[15px] font-medium text-white shadow-none transition-colors hover:bg-orange-500/90 disabled:opacity-60 sm:h-9 sm:text-[13px]"
            >
              {isSubmitting ? "Signing in..." : "Sign in with email"}
            </button>
          </div>
        </form>
      </Card>

      <p className="mt-6 text-center text-[15px] leading-6 text-muted-foreground sm:text-[13px] sm:leading-5">
        Don't have an account?{" "}
        <Link
          to={`/sign-up${search}`}
          className="font-medium text-foreground hover:underline"
          onClick={(e) => {
            trackEvent("signup_viewed", { source: "sign_in_screen" });
            if (!props.overrideOnSignUp) return;
            e.preventDefault();
            props.overrideOnSignUp?.();
          }}
        >
          Sign up
        </Link>
      </p>
      <AuthSupportLinks className="mt-4" />
    </div>
  );
};

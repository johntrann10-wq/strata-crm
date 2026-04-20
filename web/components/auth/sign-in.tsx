import { useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { StrataLogoLockup } from "@/components/brand/StrataLogo";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trackEvent } from "@/lib/analytics";
import { buildGoogleAuthRedirectPath } from "@/lib/mobileShell";
import { api, API_BASE } from "../../api";
import { useActionForm } from "../../hooks/useApi";
import { GoogleMark } from "./GoogleMark";

function buildGoogleAuthHref(search: string) {
  const params = new URLSearchParams(search);
  params.set("redirectPath", buildGoogleAuthRedirectPath(search));
  const query = params.toString();
  return `${API_BASE}/api/auth/google/start${query ? `?${query}` : ""}`;
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
  const inviteState = useMemo(() => {
    const params = new URLSearchParams(search);
    return {
      inviteToken: params.get("inviteToken") ?? "",
      email: params.get("email") ?? "",
      businessName: params.get("businessName") ?? "",
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

  return (
    <div className="w-full max-w-sm">
      <div className="mx-auto mb-8 flex flex-col items-center gap-3">
        <StrataLogoLockup
          className="flex-col gap-3"
          markClassName="h-10 w-10"
          wordmarkClassName="text-[15px] font-semibold tracking-tight text-foreground"
        />
      </div>

      <div className="mb-8 text-center">
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">Welcome back</h1>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          {isInviteFlow && inviteState.businessName
            ? `Sign in to join ${inviteState.businessName} with your existing account.`
            : "Sign in to your account"}
        </p>
      </div>

      <Card className="rounded-2xl border border-border p-8 shadow-sm">
        <form
          onSubmit={(event) => {
            trackEvent("signin_started", { method: "email" });
            void submit(event);
          }}
        >
          {isInviteFlow ? (
            <div className="mb-5 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-left text-[12px] text-orange-900">
              Already have a Strata login? Sign in with the invited email below and your team access will be attached automatically.
            </div>
          ) : null}

          <a
            href={googleAuthHref}
            onClick={() => trackEvent("signin_started", { method: "google" })}
            className="flex h-10 w-full items-center justify-center gap-2.5 rounded-lg border border-border bg-background text-[13px] font-medium transition-colors hover:bg-muted"
          >
            <GoogleMark className="h-4 w-4 shrink-0" />
            Sign in with Google
          </a>

          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="mb-1.5 block text-[12px] font-medium text-foreground/80">
                Email
              </label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                autoComplete="off"
                {...register("email")}
                defaultValue={inviteState.email}
                className={`h-9 rounded-lg text-[13px]${errors?.root?.message ? " border-destructive" : ""}`}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="password" className="block text-[12px] font-medium text-foreground/80">
                  Password
                </label>
                <Link to={`/forgot-password${search}`} className="text-[12px] font-medium text-orange-600 hover:underline">
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="........"
                autoComplete="off"
                {...register("password")}
                className={`h-9 rounded-lg text-[13px]${errors?.root?.message ? " border-destructive" : ""}`}
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-1 h-9 w-full cursor-pointer rounded-lg border-0 bg-orange-500 text-[13px] font-medium text-white shadow-none transition-colors hover:bg-orange-500/90 disabled:opacity-60"
            >
              {isSubmitting ? "Signing in..." : "Sign in with email"}
            </button>

            {errors?.root?.message ? <p className="text-center text-sm text-destructive">{errors.root.message}</p> : null}
          </div>
        </form>
      </Card>

      <p className="mt-6 text-center text-[13px] text-muted-foreground">
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
    </div>
  );
};

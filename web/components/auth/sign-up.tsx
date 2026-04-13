import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionForm } from "../../hooks/useApi";
import { GoogleMark } from "./GoogleMark";
import { Link, useLocation } from "react-router";
import { api, API_BASE } from "../../api";
import { StrataLogoLockup } from "@/components/brand/StrataLogo";
import { trackEvent } from "@/lib/analytics";
import { useMemo, useState, type FormEvent } from "react";
import { CheckCircle2 } from "lucide-react";

function buildGoogleAuthHref(search: string): string {
  const params = new URLSearchParams(search);
  if (!params.has("redirectPath")) {
    params.set("redirectPath", "/signed-in");
  }
  const query = params.toString();
  return `${API_BASE}/api/auth/google/start${query ? `?${query}` : ""}`;
}

export const SignUpComponent = (props: {
  options?: Parameters<typeof useActionForm>[1];
  searchParamsOverride?: string;
  overrideOnSignIn?: () => void;
}) => {
  const location = useLocation();
  const search = props.searchParamsOverride ?? location.search;
  const googleAuthHref = buildGoogleAuthHref(search);
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
    trackEvent("signup_started", { method: "email", invite_flow: isInviteFlow });
    void submit(event);
  };

  return (
    <div className="w-full max-w-5xl">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <div className="w-full max-w-sm">
          <div className="mx-auto mb-8 flex flex-col items-center gap-3">
            <StrataLogoLockup
              className="flex-col gap-3"
              markClassName="h-10 w-10"
              wordmarkClassName="text-[15px] font-semibold text-foreground tracking-tight"
            />
          </div>

          <div className="text-center mb-8">
            <h1 className="text-[22px] font-semibold tracking-tight text-foreground">Create your account</h1>
            <p className="text-[13px] text-muted-foreground mt-1.5">
              {isInviteFlow && inviteState.businessName
                ? `Finish joining ${inviteState.businessName} and claim your team access.`
                : "Start your free Strata account and get a full 30-day trial."}
            </p>
          </div>

          <Card className="shadow-sm border border-border rounded-2xl p-8">
            <form onSubmit={handleSubmit}>
              {inviteState.inviteToken ? <input type="hidden" name="inviteToken" value={inviteState.inviteToken} /> : null}
              <div className="flex flex-col gap-5">
                {isInviteFlow ? (
                  <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-left text-[12px] text-orange-900">
                    Use the invited email below to claim your team access. Once you finish signup, your shop permissions will be attached automatically.
                  </div>
                ) : null}
                <Button
                  variant="outline"
                  className="w-full h-9 text-[13px] font-medium rounded-lg shadow-none"
                  asChild
                >
                  <a href={googleAuthHref} onClick={() => trackEvent("signup_started", { method: "google", invite_flow: isInviteFlow })}>
                    <GoogleMark className="mr-2 h-4 w-4 shrink-0" />
                    Start free trial with Google
                  </a>
                </Button>

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[12px] text-muted-foreground">or</span>
                  <div className="flex-1 h-px bg-border" />
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
                      className="h-9 text-[13px] rounded-lg shadow-none"
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
                      className="h-9 text-[13px] rounded-lg shadow-none"
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
                    autoComplete="off"
                    {...register("email")}
                    defaultValue={inviteState.email}
                    readOnly={isInviteFlow}
                    className={`h-9 text-[13px] rounded-lg shadow-none${errors?.root?.message ? " border-destructive" : ""}`}
                  />
                  <p className="text-[12px] text-muted-foreground">
                    If your shop already added you to the team, use that same email to claim your account.
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
                    autoComplete="off"
                    {...register("password")}
                    className={`h-9 text-[13px] rounded-lg shadow-none${errors?.root?.message ? " border-destructive" : ""}`}
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
                    autoComplete="off"
                    onChange={() => setConfirmPasswordError(null)}
                    className={`h-9 text-[13px] rounded-lg shadow-none${confirmPasswordError ? " border-destructive" : ""}`}
                  />
                  {confirmPasswordError ? <p className="text-[12px] text-destructive">{confirmPasswordError}</p> : null}
                </div>

                <Button
                  className="w-full h-9 bg-orange-500 hover:bg-orange-500/90 text-white text-[13px] font-medium rounded-lg shadow-none border-0 mt-1"
                  disabled={isSubmitting}
                  type="submit"
                >
                  Start free trial
                </Button>

                <p className="text-center text-[12px] text-muted-foreground">
                  30-day free trial - No card required - Founder pricing $29/mo
                </p>

                {errors?.root?.message && (
                  <p className="text-[12px] text-destructive text-center">{errors.root.message}</p>
                )}
              </div>
            </form>
          </Card>

          <p className="text-center mt-6 text-[13px] text-muted-foreground">
            Already have an account?{" "}
            <Link
              className="text-foreground font-medium hover:underline"
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
        </div>

        <div className="space-y-5">
          <div className="rounded-2xl border border-orange-100 bg-white/95 p-6 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-700">Why Strata</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-gray-950">
              See your week, clients, and payments in one place.
            </h2>
            <p className="mt-3 text-sm leading-6 text-gray-600">
              Built for detailers who want clean scheduling, cleaner invoices, and a team that stays aligned.
            </p>
            <div className="mt-4 space-y-3">
              {[
                "Weekly scheduling that keeps the front desk fast.",
                "Client + vehicle history attached to every job.",
                "Invoices and payments that stay connected to the work.",
              ].map((item) => (
                <div key={item} className="flex items-start gap-2 text-sm text-gray-700">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-orange-600" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[24px] border border-orange-100 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
            <img
              src="/marketing/strata-ui/weekly-calendar-desktop.png"
              alt="Strata weekly schedule preview."
              className="h-72 w-full object-cover"
              loading="lazy"
            />
            <div className="absolute -bottom-8 right-6 w-32 rounded-[20px] border border-orange-100 bg-white shadow-[0_12px_26px_rgba(15,23,42,0.16)]">
              <img
                src="/marketing/strata-ui/appointment-details-mobile.png"
                alt="Strata mobile appointment preview."
                className="h-full w-full rounded-[20px] object-cover"
                loading="lazy"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

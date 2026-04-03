import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionForm } from "../../hooks/useApi";
import { GoogleMark } from "./GoogleMark";
import { Link, useLocation } from "react-router";
import { api, API_BASE } from "../../api";
import { StrataLogoLockup } from "@/components/brand/StrataLogo";

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

  const {
    submit,
    register,
    formState: { errors, isSubmitting },
  } = useActionForm(api.user.signUp, props.options);

  return (
    <div className="w-full max-w-sm">
      {/* Logo / brand header */}
      <div className="mx-auto mb-8 flex flex-col items-center gap-3">
        <StrataLogoLockup
          className="flex-col gap-3"
          markClassName="h-10 w-10"
          wordmarkClassName="text-[15px] font-semibold text-foreground tracking-tight"
        />
      </div>

      {/* Heading */}
      <div className="text-center mb-8">
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">Create your account</h1>
        <p className="text-[13px] text-muted-foreground mt-1.5">
          Start your free Strata account or finish setup with an email your shop owner already added.
        </p>
      </div>

      {/* Form card */}
      <Card className="shadow-sm border border-border rounded-2xl p-8">
        <form onSubmit={submit}>
          <div className="flex flex-col gap-5">
            {/* Google button */}
            <Button
              variant="outline"
              className="w-full h-9 text-[13px] font-medium rounded-lg shadow-none"
              asChild
            >
              <a href={googleAuthHref}>
                <GoogleMark className="mr-2 h-4 w-4 shrink-0" />
                Sign up with Google
              </a>
            </Button>

            {/* OR divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[12px] text-muted-foreground">or</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Email field */}
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
                className={`h-9 text-[13px] rounded-lg shadow-none${errors?.root?.message ? " border-destructive" : ""}`}
              />
              <p className="text-[12px] text-muted-foreground">
                If your shop already added you to the team, use that same email to claim your account.
              </p>
            </div>

            {/* Password field */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password" className="text-[13px] font-medium text-foreground">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                autoComplete="off"
                {...register("password")}
                className={`h-9 text-[13px] rounded-lg shadow-none${errors?.root?.message ? " border-destructive" : ""}`}
              />
            </div>

            {/* Submit button */}
            <Button
              className="w-full h-9 bg-orange-500 hover:bg-orange-500/90 text-white text-[13px] font-medium rounded-lg shadow-none border-0 mt-1"
              disabled={isSubmitting}
              type="submit"
            >
              Sign up with email
            </Button>

            {errors?.root?.message && (
              <p className="text-[12px] text-destructive text-center">{errors.root.message}</p>
            )}
          </div>
        </form>
      </Card>

      {/* Sign in link */}
      <p className="text-center mt-6 text-[13px] text-muted-foreground">
        Already have an account?{" "}
        <Link
          className="text-foreground font-medium hover:underline"
          to={`/sign-in${search}`}
          onClick={
            props.overrideOnSignIn
              ? (e) => {
                  e.preventDefault();
                  props.overrideOnSignIn?.();
                }
              : undefined
          }
        >
          Sign in
        </Link>
      </p>
    </div>
  );
};

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionForm } from "../../hooks/useApi";
import { Wrench } from "lucide-react";
import { Link, useLocation } from "react-router";
import { api, API_BASE } from "../../api";

export const SignUpComponent = (props: {
  options?: Parameters<typeof useActionForm>[1];
  searchParamsOverride?: string;
  overrideOnSignIn?: () => void;
}) => {
  const location = useLocation();
  const search = props.searchParamsOverride ?? location.search;

  const {
    submit,
    register,
    formState: { errors, isSubmitSuccessful, isSubmitting },
  } = useActionForm(api.user.signUp, props.options);

  return (
    <div className="w-full max-w-sm">
      {/* Logo / brand header */}
      <div className="mx-auto mb-8 flex flex-col items-center gap-3">
        <Wrench className="h-8 w-8 text-orange-500" />
        <span className="text-[15px] font-semibold text-foreground tracking-tight">Strata</span>
      </div>

      {/* Heading */}
      <div className="text-center mb-8">
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">Create your account</h1>
        <p className="text-[13px] text-muted-foreground mt-1.5">Start your free Strata account</p>
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
              <a href={`${API_BASE}/api/auth/google/start${search}`}>
                <img
                  className="mr-2 h-4 w-4"
                  src="https://assets.gadget.dev/assets/default-app-assets/google.svg"
                  alt="Google logo"
                />
                Sign up with Google
              </a>
            </Button>

            {/* OR divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[12px] text-muted-foreground">or</span>
              <div className="flex-1 h-px bg-border" />
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
                className={`h-9 text-[13px] rounded-lg shadow-none${errors?.user?.email?.message ? " border-destructive" : ""}`}
              />
              {errors?.user?.email?.message && (
                <p className="text-[12px] text-destructive">{errors.user.email.message}</p>
              )}
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
                className={`h-9 text-[13px] rounded-lg shadow-none${errors?.user?.password?.message ? " border-destructive" : ""}`}
              />
              {errors?.user?.password?.message && (
                <p className="text-[12px] text-destructive">{errors.user.password.message}</p>
              )}
            </div>

            {/* Success message */}
            {isSubmitSuccessful && (
              <p className="text-[13px] text-emerald-600 text-center py-2">Please check your inbox</p>
            )}

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
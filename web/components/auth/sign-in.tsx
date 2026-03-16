import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useActionForm } from "../../hooks/useApi";
import { Wrench } from "lucide-react";
import { Link, useLocation } from "react-router";
import { api, API_BASE } from "../../api";

export const SignInComponent = (props: {
  options?: Parameters<typeof useActionForm>[1];
  searchParamsOverride?: string;
  overrideOnSignUp?: () => void;
}) => {
  const location = useLocation();
  const search = props.searchParamsOverride ?? location.search;

  const {
    submit,
    register,
    formState: { errors, isSubmitting },
  } = useActionForm(api.user.signIn, props.options);

  return (
    <div className="w-full max-w-sm">
      {/* Logo / Brand Header */}
      <div className="mx-auto mb-8 flex flex-col items-center gap-3">
        <Wrench className="h-8 w-8 text-orange-500" />
        <span className="text-[15px] font-semibold text-foreground tracking-tight">Strata</span>
      </div>

      {/* Heading */}
      <div className="text-center mb-8">
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">Welcome back</h1>
        <p className="text-[13px] text-muted-foreground mt-1.5">Sign in to your account</p>
      </div>

      {/* Form Card */}
      <Card className="shadow-sm border border-border rounded-2xl p-8">
        <form onSubmit={submit}>
          {/* Google Sign In */}
          <a
            href={`${API_BASE}/api/auth/google/start${search}`}
            className="w-full h-10 border border-border bg-background hover:bg-muted text-[13px] font-medium rounded-lg flex items-center justify-center gap-2.5 transition-colors"
          >
            <img
              className="h-4 w-4"
              src="https://assets.gadget.dev/assets/default-app-assets/google.svg"
              alt="Google logo"
            />
            Sign in with Google
          </a>

          {/* OR Divider */}
          <div className="flex items-center gap-3 my-6">
            <span className="flex-1 h-px bg-border" />
            <span className="text-[11px] text-muted-foreground uppercase tracking-[0.06em]">or</span>
            <span className="flex-1 h-px bg-border" />
          </div>

          <div className="flex flex-col gap-4">
            {/* Email Field */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-[12px] font-medium text-foreground/80 mb-1.5 block">
                Email
              </label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                autoComplete="off"
                {...register("email")}
                className={`h-9 text-[13px] rounded-lg${errors?.user?.email?.message ? " border-destructive" : ""}`}
              />
              {errors?.user?.email?.message && (
                <p className="text-sm text-destructive">{errors.user.email.message}</p>
              )}
            </div>

            {/* Password Field */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-[12px] font-medium text-foreground/80 mb-1.5 block">
                Password
              </label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                autoComplete="off"
                {...register("password")}
                className={`h-9 text-[13px] rounded-lg${errors?.user?.password?.message ? " border-destructive" : ""}`}
              />
              {errors?.user?.password?.message && (
                <p className="text-sm text-destructive">{errors.user.password.message}</p>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-9 bg-orange-500 hover:bg-orange-500/90 text-white text-[13px] font-medium rounded-lg shadow-none border-0 mt-1 transition-colors disabled:opacity-60 cursor-pointer"
            >
              {isSubmitting ? "Signing in…" : "Sign in with email"}
            </button>

            {errors?.root?.message && (
              <p className="text-sm text-destructive text-center">{errors.root.message}</p>
            )}

            {/* Forgot Password */}
            <p className="text-[12px] text-muted-foreground mt-4 text-center">
              Forgot your password?{" "}
              <Link to={`/forgot-password${search}`} className="text-foreground hover:underline">
                Reset password
              </Link>
            </p>
          </div>
        </form>
      </Card>

      {/* Sign Up Link */}
      <p className="text-center mt-6 text-[13px] text-muted-foreground">
        Don't have an account?{" "}
        <Link
          to={`/sign-up${search}`}
          className="text-foreground font-medium hover:underline"
          onClick={
            props.overrideOnSignUp
              ? (e) => {
                  e.preventDefault();
                  props.overrideOnSignUp?.();
                }
              : undefined
          }
        >
          Sign up
        </Link>
      </p>
    </div>
  );
};
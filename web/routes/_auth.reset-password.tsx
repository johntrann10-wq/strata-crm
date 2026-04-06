import { StrataLogoLockup } from "@/components/brand/StrataLogo";
import { api } from "@/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAction } from "@/hooks/useApi";
import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

export default function ResetPasswordRoute() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = useMemo(() => {
    const directToken =
      searchParams.get("token") ??
      searchParams.get("resetToken") ??
      searchParams.get("reset_token");
    if (directToken) return directToken;
    if (typeof window === "undefined") return "";
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    if (!hash) return "";
    const hashParams = new URLSearchParams(hash);
    return (
      hashParams.get("token") ??
      hashParams.get("resetToken") ??
      hashParams.get("reset_token") ??
      ""
    );
  }, [searchParams]);
  const [{ fetching }, resetPassword] = useAction(api.user.resetPassword);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!token) {
      setError("This password reset link is missing or invalid.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    const result = await resetPassword({ token, password });
    if (result.error) {
      setError(result.error.message ?? "Could not reset password.");
      return;
    }
    setComplete(true);
    setTimeout(() => navigate("/sign-in", { replace: true }), 1200);
  };

  return (
    <div className="w-full max-w-sm">
      <div className="mx-auto mb-8 flex flex-col items-center gap-3">
        <StrataLogoLockup
          className="flex-col gap-3"
          markClassName="h-10 w-10"
          wordmarkClassName="text-[15px] font-semibold text-foreground tracking-tight"
        />
      </div>

      <div className="mb-8 text-center">
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">Choose a new password</h1>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          Use a strong password you won&apos;t reuse elsewhere.
        </p>
      </div>

      <Card className="rounded-2xl border border-border p-8 shadow-sm">
        {complete ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-foreground">Your password has been reset.</p>
            <p className="text-[12px] text-muted-foreground">You&apos;ll be redirected to sign in in a moment.</p>
            <Button asChild className="h-9 w-full rounded-lg bg-orange-500 text-[13px] font-medium text-white hover:bg-orange-500/90">
              <Link to="/sign-in">Go to sign in</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password" className="text-[13px] font-medium text-foreground">
                New password
              </Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={`h-9 rounded-lg text-[13px] shadow-none${error ? " border-destructive" : ""}`}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirmPassword" className="text-[13px] font-medium text-foreground">
                Confirm new password
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className={`h-9 rounded-lg text-[13px] shadow-none${error ? " border-destructive" : ""}`}
              />
            </div>
            {error ? <p className="text-center text-[12px] text-destructive">{error}</p> : null}
            <Button type="submit" disabled={fetching} className="h-9 w-full rounded-lg bg-orange-500 text-[13px] font-medium text-white hover:bg-orange-500/90">
              {fetching ? "Resetting password…" : "Reset password"}
            </Button>
          </form>
        )}
      </Card>

      <p className="mt-6 text-center text-[13px] text-muted-foreground">
        Back to <Link to="/sign-in" className="font-medium text-foreground hover:underline">sign in</Link>
      </p>
    </div>
  );
}

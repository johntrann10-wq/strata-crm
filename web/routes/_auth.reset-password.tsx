import { StrataLogoLockup } from "@/components/brand/StrataLogo";
import { api } from "@/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthSupportLinks } from "@/components/auth/AuthSupportLinks";
import { useAction } from "@/hooks/useApi";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

function extractResetToken(value: string): string {
  const normalized = value
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
  if (!normalized) return "";

  const jwtMatch = normalized.match(/[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/);
  if (jwtMatch?.[0]) return jwtMatch[0];

  const compact = normalized.replace(/\s+/g, "");
  const match = compact.match(/[?#&](?:token|resetToken|reset_token)=([^&#]+)/i);
  if (match?.[1]) return decodeURIComponent(match[1]);

  if (!compact.includes("://") && !compact.includes("?") && !compact.includes("#")) {
    return compact;
  }

  try {
    const url = new URL(compact);
    return (
      url.searchParams.get("token") ??
      url.searchParams.get("resetToken") ??
      url.searchParams.get("reset_token") ??
      ""
    );
  } catch {
    return "";
  }
}

export default function ResetPasswordRoute() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [token, setToken] = useState(() => {
    if (typeof window === "undefined") return "";
    return extractResetToken(window.location.href);
  });
  const resolvedToken = useMemo(() => {
    const directToken =
      searchParams.get("token") ??
      searchParams.get("resetToken") ??
      searchParams.get("reset_token");
    return directToken || token;
  }, [searchParams, token]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const nextToken =
      extractResetToken(window.location.href) ||
      extractResetToken(window.location.search) ||
      extractResetToken(window.location.hash);
    if (nextToken && nextToken !== token) {
      setToken(nextToken);
    }
  }, [searchParams, token]);
  const [{ fetching }, resetPassword] = useAction(api.user.resetPassword);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!resolvedToken) {
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
    const result = await resetPassword({ token: resolvedToken, password });
    if (result.error) {
      setError(result.error.message ?? "Could not reset password.");
      return;
    }
    setComplete(true);
    setTimeout(() => navigate("/sign-in", { replace: true }), 1200);
  };

  return (
    <div className="mx-auto w-full max-w-[24rem] sm:max-w-md">
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

      <Card className="rounded-[1.75rem] border-white/70 bg-white/94 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.10)] sm:p-8">
        {complete ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-foreground">Your password has been reset.</p>
            <p className="text-[12px] text-muted-foreground">You&apos;ll be redirected to sign in in a moment.</p>
            <Button asChild className="h-9 w-full rounded-lg bg-orange-500 text-[13px] font-medium text-white hover:bg-orange-500/90">
              <Link to="/sign-in">Go to sign in</Link>
            </Button>
          </div>
        ) : !resolvedToken ? (
          <div className="space-y-4 text-center">
            <p className="text-sm font-medium text-foreground">This reset link is missing or invalid.</p>
            <p className="text-[12px] text-muted-foreground">Request a fresh password reset email, then reopen the new link from this device.</p>
            <div className="flex flex-col gap-3 pt-1">
              <Button asChild className="h-9 w-full rounded-lg bg-orange-500 text-[13px] font-medium text-white hover:bg-orange-500/90">
                <Link to="/forgot-password">Request a new reset link</Link>
              </Button>
              <Button asChild variant="outline" className="h-9 w-full rounded-lg text-[13px] font-medium">
                <Link to="/sign-in">Back to sign in</Link>
              </Button>
            </div>
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
              {fetching ? "Resetting password..." : "Reset password"}
            </Button>
          </form>
        )}
      </Card>

      <p className="mt-6 text-center text-[13px] text-muted-foreground">
        Back to <Link to="/sign-in" className="font-medium text-foreground hover:underline">sign in</Link>
      </p>
      <AuthSupportLinks className="mt-4" />
    </div>
  );
}

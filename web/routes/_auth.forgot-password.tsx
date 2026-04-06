import { StrataLogoLockup } from "@/components/brand/StrataLogo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/api";
import { useAction } from "@/hooks/useApi";
import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";

export default function ForgotPasswordRoute() {
  const [searchParams] = useSearchParams();
  const [{ fetching }, sendReset] = useAction(api.user.forgotPassword);
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const normalized = email.trim();
    if (!normalized) {
      setError("Email is required.");
      return;
    }
    const result = await sendReset({ email: normalized });
    if (result.error) {
      setError(result.error.message ?? "Could not send password reset email.");
      return;
    }
    setSent(true);
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
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">Reset your password</h1>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          Enter your account email and we&apos;ll send a secure reset link if the account exists.
        </p>
      </div>

      <Card className="rounded-2xl border border-border p-8 shadow-sm">
        {sent ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-foreground">If an account exists for <span className="font-medium">{email.trim()}</span>, a password reset link has been sent.</p>
            <p className="text-[12px] text-muted-foreground">Check your inbox and spam folder, then use the secure link to choose a new password.</p>
            <Button asChild className="h-9 w-full rounded-lg bg-orange-500 text-[13px] font-medium text-white hover:bg-orange-500/90">
              <Link to={`/sign-in?email=${encodeURIComponent(email.trim())}`}>Back to sign in</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email" className="text-[13px] font-medium text-foreground">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={`h-9 rounded-lg text-[13px] shadow-none${error ? " border-destructive" : ""}`}
              />
            </div>
            {error ? <p className="text-center text-[12px] text-destructive">{error}</p> : null}
            <Button type="submit" disabled={fetching} className="h-9 w-full rounded-lg bg-orange-500 text-[13px] font-medium text-white hover:bg-orange-500/90">
              {fetching ? "Sending reset link…" : "Send reset link"}
            </Button>
          </form>
        )}
      </Card>

      <p className="mt-6 text-center text-[13px] text-muted-foreground">
        Remembered it? <Link to={`/sign-in${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ""}`} className="font-medium text-foreground hover:underline">Back to sign in</Link>
      </p>
    </div>
  );
}

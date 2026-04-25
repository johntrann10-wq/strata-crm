import { useEffect, useState } from "react";
import { ApiError, api } from "@/api";
import { persistAuthState } from "@/lib/auth";
import { trackEvent } from "@/lib/analytics";
import {
  authorizeAppleSignIn,
  getAppleSignInErrorMessage,
  isAppleSignInCanceled,
  isAppleSignInSupported,
} from "@/lib/appleSignIn";

function AppleMark(props: { className?: string }) {
  return (
    <svg aria-hidden="true" className={props.className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M16.37 12.17c.03 3.28 2.88 4.37 2.91 4.39-.02.08-.45 1.54-1.49 3.06-.89 1.31-1.83 2.62-3.28 2.65-1.42.03-1.88-.84-3.5-.84-1.63 0-2.13.82-3.47.87-1.4.05-2.47-1.4-3.37-2.7C2.33 17.71 1 14.27 2.74 11.25c.86-1.5 2.4-2.45 4.08-2.48 1.37-.03 2.67.92 3.5.92.83 0 2.4-1.14 4.05-.97.69.03 2.64.28 3.89 2.11-.1.06-2.32 1.35-2.29 4.04ZM13.29 6.99c.75-.91 1.26-2.18 1.12-3.44-1.08.04-2.39.72-3.16 1.63-.69.8-1.29 2.09-1.13 3.32 1.21.09 2.44-.61 3.17-1.51Z" />
    </svg>
  );
}

export function AppleAuthButton(props: {
  inviteFlow?: boolean;
  inviteToken?: string;
  mode: "sign-in" | "sign-up";
  onSuccess?: () => void;
}) {
  const [supported, setSupported] = useState(false);
  const [isCheckingSupport, setIsCheckingSupport] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void isAppleSignInSupported()
      .then((value) => {
        if (!active) return;
        setSupported(value);
      })
      .finally(() => {
        if (!active) return;
        setIsCheckingSupport(false);
      });

    return () => {
      active = false;
    };
  }, []);

  if (isCheckingSupport || !supported) return null;

  const analyticsPrefix = props.mode === "sign-up" ? "signup" : "signin";
  const buttonLabel = props.mode === "sign-up" ? "Sign up with Apple" : "Sign in with Apple";

  const handleAppleAuth = async () => {
    setError(null);
    setIsLoading(true);
    trackEvent(`${analyticsPrefix}_started`, { invite_flow: props.inviteFlow, method: "apple" });

    try {
      const credential = await authorizeAppleSignIn();
      const response = await api.user.signInWithApple({
        identityToken: credential.identityToken,
        authorizationCode: credential.authorizationCode ?? undefined,
        email: credential.email ?? undefined,
        firstName: credential.givenName ?? undefined,
        lastName: credential.familyName ?? undefined,
        fullName: credential.fullName ?? undefined,
        isPrivateEmail: credential.isPrivateEmail ?? undefined,
        inviteToken: props.inviteToken ?? undefined,
      });

      persistAuthState(response.token, { source: "apple-native" });
      trackEvent(`${analyticsPrefix}_completed`, {
        invite_flow: props.inviteFlow,
        method: "apple",
        private_relay: response.appleEmailIsPrivateRelay,
      });
      props.onSuccess?.();
    } catch (caughtError) {
      if (isAppleSignInCanceled(caughtError)) {
        return;
      }

      if (caughtError instanceof ApiError) {
        setError(caughtError.message);
        return;
      }

      setError(getAppleSignInErrorMessage(caughtError));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => void handleAppleAuth()}
        disabled={isLoading}
        className="flex h-11 w-full items-center justify-center gap-2.5 rounded-lg border border-black bg-black px-4 text-[15px] font-medium text-white transition-colors hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-60 sm:h-10 sm:text-[13px]"
      >
        <AppleMark className="h-4 w-4 shrink-0" />
        {isLoading ? "Connecting to Apple..." : buttonLabel}
      </button>
      {props.inviteFlow ? (
        <p className="text-center text-xs text-muted-foreground">
          Apple sign-in can still claim your team invite. If Apple hides your email, Strata uses the invite link to attach access.
        </p>
      ) : null}
      {error ? <p className="text-center text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

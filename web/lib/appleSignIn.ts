import { Capacitor, registerPlugin } from "@capacitor/core";
import { isNativeShell } from "./mobileShell";

type NativeAppleSignInResult = {
  authorizationCode?: string | null;
  email?: string | null;
  familyName?: string | null;
  fullName?: string | null;
  givenName?: string | null;
  identityToken: string;
  isPrivateEmail?: boolean;
  user: string;
};

type AppleSignInPlugin = {
  authorize(): Promise<NativeAppleSignInResult>;
  isSupported(): Promise<{ value: boolean }>;
};

type PluginLikeError = Error & {
  code?: string;
};

export const APPLE_SIGN_IN_CANCELED = "APPLE_SIGN_IN_CANCELED";
export const APPLE_SIGN_IN_UNAVAILABLE = "APPLE_SIGN_IN_UNAVAILABLE";

const NativeAppleSignIn = registerPlugin<AppleSignInPlugin>("AppleSignIn");

function getErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const code = "code" in error ? (error as { code?: unknown }).code : null;
  return typeof code === "string" ? code : null;
}

function createAppleSignInError(message: string, code: string): PluginLikeError {
  const error = new Error(message) as PluginLikeError;
  error.code = code;
  return error;
}

export async function isAppleSignInSupported(): Promise<boolean> {
  if (!isNativeShell()) return false;
  if (Capacitor.getPlatform() !== "ios") return false;

  try {
    const result = await NativeAppleSignIn.isSupported();
    return result?.value === true;
  } catch {
    return true;
  }
}

export async function authorizeAppleSignIn(): Promise<NativeAppleSignInResult> {
  if (!(await isAppleSignInSupported())) {
    throw createAppleSignInError("Sign in with Apple is not available on this device.", APPLE_SIGN_IN_UNAVAILABLE);
  }

  return NativeAppleSignIn.authorize();
}

export function isAppleSignInCanceled(error: unknown): boolean {
  const code = getErrorCode(error);
  if (code === APPLE_SIGN_IN_CANCELED) return true;
  if (!(error instanceof Error)) return false;
  return error.message.toLowerCase().includes("cancel");
}

export function getAppleSignInErrorMessage(error: unknown): string {
  const code = getErrorCode(error);
  if (code === APPLE_SIGN_IN_UNAVAILABLE) {
    return "Sign in with Apple is not available in this build yet. Please reinstall the latest iOS app build and try again.";
  }
  if (code === "APPLE_SIGN_IN_IN_PROGRESS") {
    return "Another Apple sign-in request is already in progress.";
  }
  if (code === "APPLE_SIGN_IN_MISSING_TOKEN") {
    return "Apple did not return a usable sign-in credential. Please try again.";
  }
  if (code === "APPLE_SIGN_IN_INVALID_CREDENTIAL") {
    return "Apple sign-in returned an unexpected credential. Please try again.";
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "We couldn't complete Sign in with Apple. Please try again.";
}

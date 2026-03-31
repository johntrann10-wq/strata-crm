import { OAuth2Client } from "google-auth-library";

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const apiBase = process.env.API_BASE;
const redirectUri = apiBase ? `${apiBase}/api/auth/google/callback` : "";

if (!clientId || !clientSecret) {
  // We don't throw here to avoid crashing startup if Google isn't configured;
  // routes will guard on the client existing.
  console.warn(
    "[googleAuth] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / API_BASE not fully configured; Google OAuth disabled."
  );
}

export const googleClient =
  clientId && clientSecret && redirectUri
    ? new OAuth2Client({
        clientId,
        clientSecret,
        redirectUri,
      })
    : null;


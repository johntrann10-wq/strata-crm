import { createPublicKey } from "node:crypto";
import jwt, { type JwtHeader, type JwtPayload } from "jsonwebtoken";
import { AppError, BadRequestError } from "./errors.js";
import { logger } from "./logger.js";

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_JWKS_URL = `${APPLE_ISSUER}/auth/keys`;
const DEFAULT_APPLE_CLIENT_IDS = ["app.stratacrm.mobile", "app.stratacrm.ios"];
const DEFAULT_JWKS_CACHE_MS = 60 * 60 * 1000;

type AppleJwk = {
  alg?: string;
  e: string;
  kid: string;
  kty: string;
  n: string;
  use?: string;
};

type AppleJwksResponse = {
  keys?: AppleJwk[];
};

type AppleIdentityTokenClaims = JwtPayload & {
  aud?: string | string[];
  email?: string;
  email_verified?: boolean | "true" | "false";
  is_private_email?: boolean | "true" | "false";
  iss?: string;
  nonce?: string;
  sub?: string;
};

export type VerifiedAppleIdentity = {
  audience: string | string[] | undefined;
  email: string | null;
  emailVerified: boolean;
  isPrivateEmail: boolean;
  nonce: string | null;
  subject: string;
};

let cachedAppleJwks: { expiresAt: number; keys: AppleJwk[] } | null = null;
let inFlightAppleJwksRequest: Promise<AppleJwk[]> | null = null;

function parseAppleBooleanClaim(value: unknown): boolean {
  return value === true || value === "true";
}

function parseCacheControlMaxAge(headerValue: string | null): number | null {
  if (!headerValue) return null;
  const match = headerValue.match(/max-age=(\d+)/i);
  if (!match) return null;
  const seconds = Number.parseInt(match[1] ?? "", 10);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return seconds * 1000;
}

export function resolveAppleSignInClientIds(): string[] {
  const configured = [process.env.APPLE_SIGN_IN_CLIENT_IDS, process.env.STRATA_CAPACITOR_APP_ID]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(",");

  const configuredClientIds = configured
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return Array.from(new Set([...DEFAULT_APPLE_CLIENT_IDS, ...configuredClientIds]));
}

async function fetchAppleJwks(forceRefresh = false): Promise<AppleJwk[]> {
  if (!forceRefresh && cachedAppleJwks && cachedAppleJwks.expiresAt > Date.now()) {
    return cachedAppleJwks.keys;
  }

  if (!forceRefresh && inFlightAppleJwksRequest) {
    return inFlightAppleJwksRequest;
  }

  const request = (async () => {
    let response: Response;
    try {
      response = await fetch(APPLE_JWKS_URL, {
        headers: {
          Accept: "application/json",
        },
      });
    } catch (error) {
      logger.error("Failed to reach Apple JWKS endpoint", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new AppError("Apple sign-in is temporarily unavailable. Please try again.", 503, "APPLE_AUTH_UNAVAILABLE");
    }

    if (!response.ok) {
      logger.error("Apple JWKS endpoint returned an unexpected response", {
        status: response.status,
        statusText: response.statusText,
      });
      throw new AppError("Apple sign-in is temporarily unavailable. Please try again.", 503, "APPLE_AUTH_UNAVAILABLE");
    }

    const payload = (await response.json()) as AppleJwksResponse;
    const keys = Array.isArray(payload.keys) ? payload.keys.filter((key) => Boolean(key?.kid && key?.n && key?.e)) : [];
    if (keys.length === 0) {
      throw new AppError("Apple sign-in is temporarily unavailable. Please try again.", 503, "APPLE_AUTH_UNAVAILABLE");
    }

    const cacheMs = parseCacheControlMaxAge(response.headers.get("cache-control")) ?? DEFAULT_JWKS_CACHE_MS;
    cachedAppleJwks = {
      keys,
      expiresAt: Date.now() + cacheMs,
    };
    return keys;
  })();

  inFlightAppleJwksRequest = request.finally(() => {
    inFlightAppleJwksRequest = null;
  });

  return inFlightAppleJwksRequest;
}

function decodeIdentityTokenHeader(identityToken: string): JwtHeader {
  const decoded = jwt.decode(identityToken, { complete: true });
  if (!decoded || typeof decoded !== "object" || !("header" in decoded)) {
    throw new BadRequestError("Apple sign-in returned an invalid identity token.");
  }
  return decoded.header as JwtHeader;
}

function findAppleJwk(keys: AppleJwk[], header: JwtHeader): AppleJwk | null {
  const keyId = typeof header.kid === "string" ? header.kid : null;
  if (!keyId) return null;
  return (
    keys.find((key) => key.kid === keyId && (!header.alg || !key.alg || key.alg === header.alg)) ??
    keys.find((key) => key.kid === keyId) ??
    null
  );
}

export async function verifyAppleIdentityToken(identityToken: string): Promise<VerifiedAppleIdentity> {
  if (!identityToken.trim()) {
    throw new BadRequestError("Apple sign-in did not return an identity token.");
  }

  const header = decodeIdentityTokenHeader(identityToken);
  if (header.alg !== "RS256") {
    throw new BadRequestError("Apple sign-in returned an invalid identity token.");
  }

  let jwk = findAppleJwk(await fetchAppleJwks(false), header);
  if (!jwk) {
    jwk = findAppleJwk(await fetchAppleJwks(true), header);
  }

  if (!jwk) {
    throw new BadRequestError("Apple sign-in returned an unknown signing key.");
  }

  const publicKey = createPublicKey({
    key: jwk as any,
    format: "jwk",
  });
  const audiences = resolveAppleSignInClientIds();

  let claims: AppleIdentityTokenClaims;
  try {
    claims = jwt.verify(identityToken, publicKey, {
      algorithms: ["RS256"],
      audience: audiences.length === 1 ? audiences[0] : (audiences as [string, ...string[]]),
      issuer: APPLE_ISSUER,
    }) as AppleIdentityTokenClaims;
  } catch (error) {
    logger.warn("Apple identity token verification failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new BadRequestError("Apple sign-in could not be verified. Please try again.");
  }

  if (!claims.sub) {
    throw new BadRequestError("Apple sign-in did not include a stable account identifier.");
  }

  return {
    subject: claims.sub,
    email: typeof claims.email === "string" && claims.email.trim() ? claims.email.trim() : null,
    emailVerified: parseAppleBooleanClaim(claims.email_verified),
    isPrivateEmail: parseAppleBooleanClaim(claims.is_private_email),
    nonce: typeof claims.nonce === "string" && claims.nonce.trim() ? claims.nonce.trim() : null,
    audience: claims.aud,
  };
}

export function __resetAppleJwkCacheForTests(): void {
  cachedAppleJwks = null;
  inFlightAppleJwksRequest = null;
}

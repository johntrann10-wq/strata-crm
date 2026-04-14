import jwt from "jsonwebtoken";

const JWT_ISSUER = "strata-backend";
const ACCESS_TOKEN_AUDIENCE = "strata-api";
const PUBLIC_DOCUMENT_AUDIENCE = "strata-public-document";
const PASSWORD_RESET_AUDIENCE = "strata-password-reset";
const TEAM_INVITE_AUDIENCE = "strata-team-invite";
const INTEGRATION_STATE_AUDIENCE = "strata-integration-state";

function requireJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) throw new Error("JWT_SECRET is required");
  return secret;
}

export function createAccessToken(userId: string, tokenVersion: number = 1): string {
  return jwt.sign({ userId, ver: tokenVersion }, requireJwtSecret(), {
    algorithm: "HS256",
    audience: ACCESS_TOKEN_AUDIENCE,
    expiresIn: "7d",
    issuer: JWT_ISSUER,
    subject: userId,
  });
}

export function verifyAccessToken(token: string): { userId?: string; ver?: number } | null {
  try {
    return jwt.verify(token, requireJwtSecret(), {
      algorithms: ["HS256"],
      audience: ACCESS_TOKEN_AUDIENCE,
      issuer: JWT_ISSUER,
    }) as { userId?: string; ver?: number };
  } catch {
    return null;
  }
}

export function createScopedPublicDocumentToken<T extends Record<string, unknown>>(payload: T): string {
  return jwt.sign(payload, requireJwtSecret(), {
    algorithm: "HS256",
    audience: PUBLIC_DOCUMENT_AUDIENCE,
    expiresIn: "14d",
    issuer: JWT_ISSUER,
  });
}

export function verifyScopedPublicDocumentToken<T>(token: string): T | null {
  try {
    return jwt.verify(token, requireJwtSecret(), {
      algorithms: ["HS256"],
      audience: PUBLIC_DOCUMENT_AUDIENCE,
      issuer: JWT_ISSUER,
    }) as T;
  } catch {
    return null;
  }
}

export function createPasswordResetToken(userId: string, email: string): string {
  return jwt.sign({ userId, email }, requireJwtSecret(), {
    algorithm: "HS256",
    audience: PASSWORD_RESET_AUDIENCE,
    expiresIn: "1h",
    issuer: JWT_ISSUER,
    subject: userId,
  });
}

export function verifyPasswordResetToken(token: string): { userId?: string; email?: string } | null {
  try {
    return jwt.verify(token, requireJwtSecret(), {
      algorithms: ["HS256"],
      audience: PASSWORD_RESET_AUDIENCE,
      issuer: JWT_ISSUER,
    }) as { userId?: string; email?: string };
  } catch {
    return null;
  }
}

export function createTeamInviteToken(userId: string, email: string, businessId: string): string {
  return jwt.sign({ userId, email, businessId }, requireJwtSecret(), {
    algorithm: "HS256",
    audience: TEAM_INVITE_AUDIENCE,
    expiresIn: "7d",
    issuer: JWT_ISSUER,
    subject: userId,
  });
}

export function verifyTeamInviteToken(token: string): { userId?: string; email?: string; businessId?: string } | null {
  try {
    return jwt.verify(token, requireJwtSecret(), {
      algorithms: ["HS256"],
      audience: TEAM_INVITE_AUDIENCE,
      issuer: JWT_ISSUER,
    }) as { userId?: string; email?: string; businessId?: string };
  } catch {
    return null;
  }
}

export function createIntegrationStateToken<T extends Record<string, unknown>>(payload: T): string {
  return jwt.sign(payload, requireJwtSecret(), {
    algorithm: "HS256",
    audience: INTEGRATION_STATE_AUDIENCE,
    expiresIn: "15m",
    issuer: JWT_ISSUER,
  });
}

export function verifyIntegrationStateToken<T>(token: string): T | null {
  try {
    return jwt.verify(token, requireJwtSecret(), {
      algorithms: ["HS256"],
      audience: INTEGRATION_STATE_AUDIENCE,
      issuer: JWT_ISSUER,
    }) as T;
  } catch {
    return null;
  }
}

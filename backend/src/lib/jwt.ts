import jwt from "jsonwebtoken";

const JWT_ISSUER = "strata-backend";
const ACCESS_TOKEN_AUDIENCE = "strata-api";
const PUBLIC_DOCUMENT_AUDIENCE = "strata-public-document";
const PASSWORD_RESET_AUDIENCE = "strata-password-reset";

function requireJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) throw new Error("JWT_SECRET is required");
  return secret;
}

export function createAccessToken(userId: string): string {
  return jwt.sign({ userId }, requireJwtSecret(), {
    algorithm: "HS256",
    audience: ACCESS_TOKEN_AUDIENCE,
    expiresIn: "7d",
    issuer: JWT_ISSUER,
    subject: userId,
  });
}

export function verifyAccessToken(token: string): { userId?: string } | null {
  try {
    return jwt.verify(token, requireJwtSecret(), {
      algorithms: ["HS256"],
      audience: ACCESS_TOKEN_AUDIENCE,
      issuer: JWT_ISSUER,
    }) as { userId?: string };
  } catch {
    return null;
  }
}

export function createScopedPublicDocumentToken<T extends Record<string, unknown>>(payload: T): string {
  return jwt.sign(payload, requireJwtSecret(), {
    algorithm: "HS256",
    audience: PUBLIC_DOCUMENT_AUDIENCE,
    expiresIn: "30d",
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

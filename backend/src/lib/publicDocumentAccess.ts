import jwt from "jsonwebtoken";

type PublicDocumentKind = "quote" | "invoice";

type PublicDocumentTokenPayload = {
  kind: PublicDocumentKind;
  entityId: string;
  businessId: string;
};

function requireJwtSecret() {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) throw new Error("JWT_SECRET is required");
  return secret;
}

export function createPublicDocumentToken(payload: PublicDocumentTokenPayload): string {
  return jwt.sign(payload, requireJwtSecret(), { expiresIn: "30d" });
}

export function verifyPublicDocumentToken(
  token: string,
  expected: { kind: PublicDocumentKind; entityId: string }
): PublicDocumentTokenPayload | null {
  try {
    const payload = jwt.verify(token, requireJwtSecret()) as PublicDocumentTokenPayload;
    if (payload.kind !== expected.kind) return null;
    if (payload.entityId !== expected.entityId) return null;
    if (!payload.businessId) return null;
    return payload;
  } catch {
    return null;
  }
}

function normalizeUrl(value: string | undefined | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.replace(/\/+$/, "") : null;
}

export function getPublicApiBaseUrl(): string {
  const explicit =
    normalizeUrl(process.env.PUBLIC_API_URL) ??
    normalizeUrl(process.env.API_PUBLIC_URL) ??
    normalizeUrl(process.env.BACKEND_PUBLIC_URL) ??
    normalizeUrl(process.env.RAILWAY_STATIC_URL);
  if (explicit) return explicit;

  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (railwayDomain) {
    return `https://${railwayDomain.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  }

  return normalizeUrl(process.env.FRONTEND_URL) ?? "";
}

export function buildPublicDocumentUrl(path: string): string {
  const base = getPublicApiBaseUrl();
  if (!base) return path;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

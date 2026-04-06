import { createScopedPublicDocumentToken, verifyScopedPublicDocumentToken } from "./jwt.js";

export type PublicDocumentKind = "quote" | "invoice" | "appointment";

export type PublicDocumentTokenPayload = {
  kind: PublicDocumentKind;
  entityId: string;
  businessId: string;
};

export function createPublicDocumentToken(payload: PublicDocumentTokenPayload): string {
  return createScopedPublicDocumentToken(payload);
}

export function verifyAnyPublicDocumentToken(token: string): PublicDocumentTokenPayload | null {
  const payload = verifyScopedPublicDocumentToken<PublicDocumentTokenPayload>(token);
  if (!payload) return null;
  if (!payload.businessId || !payload.entityId) return null;
  if (payload.kind !== "quote" && payload.kind !== "invoice" && payload.kind !== "appointment") {
    return null;
  }
  return payload;
}

export function verifyPublicDocumentToken(
  token: string,
  expected: { kind: PublicDocumentKind; entityId: string }
): PublicDocumentTokenPayload | null {
  const payload = verifyAnyPublicDocumentToken(token);
  if (!payload) return null;
  if (payload.kind !== expected.kind) return null;
  if (payload.entityId !== expected.entityId) return null;
  return payload;
}

function normalizeUrl(value: string | undefined | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
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

export function getPublicAppBaseUrl(): string {
  const explicit =
    normalizeUrl(process.env.PUBLIC_APP_URL) ??
    normalizeUrl(process.env.APP_PUBLIC_URL) ??
    normalizeUrl(process.env.FRONTEND_URL);
  if (explicit) return explicit;
  return getPublicApiBaseUrl();
}

export function buildPublicAppUrl(path: string): string {
  const base = getPublicAppBaseUrl();
  if (!base) return path;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

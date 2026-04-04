import { createScopedPublicDocumentToken, verifyScopedPublicDocumentToken } from "./jwt.js";

type PublicDocumentKind = "quote" | "invoice" | "appointment";

type PublicDocumentTokenPayload = {
  kind: PublicDocumentKind;
  entityId: string;
  businessId: string;
};

export function createPublicDocumentToken(payload: PublicDocumentTokenPayload): string {
  return createScopedPublicDocumentToken(payload);
}

export function verifyPublicDocumentToken(
  token: string,
  expected: { kind: PublicDocumentKind; entityId: string }
): PublicDocumentTokenPayload | null {
  const payload = verifyScopedPublicDocumentToken<PublicDocumentTokenPayload>(token);
  if (!payload) return null;
  if (payload.kind !== expected.kind) return null;
  if (payload.entityId !== expected.entityId) return null;
  if (!payload.businessId) return null;
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

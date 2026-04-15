import type { SignOptions } from "jsonwebtoken";
import { createScopedPublicDocumentToken, verifyScopedPublicDocumentToken } from "./jwt.js";

export type PublicDocumentKind = "quote" | "invoice" | "appointment";

export type PublicDocumentTokenPayload = {
  kind: PublicDocumentKind;
  entityId: string;
  businessId: string;
  ver?: number;
};

const DEFAULT_PUBLIC_DOCUMENT_EXPIRY_BY_KIND: Record<PublicDocumentKind, NonNullable<SignOptions["expiresIn"]>> = {
  quote: "14d",
  invoice: "14d",
  appointment: "7d",
};

export function normalizePublicDocumentTokenVersion(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

export function getPublicDocumentTokenExpiry(kind: PublicDocumentKind): NonNullable<SignOptions["expiresIn"]> {
  return DEFAULT_PUBLIC_DOCUMENT_EXPIRY_BY_KIND[kind];
}

export function isPublicDocumentTokenCurrent(
  payload: Pick<PublicDocumentTokenPayload, "ver"> | null | undefined,
  currentVersion: unknown
): boolean {
  if (!payload) return false;
  return normalizePublicDocumentTokenVersion(payload.ver) === normalizePublicDocumentTokenVersion(currentVersion);
}

export function createPublicDocumentToken(
  payload: PublicDocumentTokenPayload & { tokenVersion?: number; expiresIn?: SignOptions["expiresIn"] }
): string {
  const tokenVersion = normalizePublicDocumentTokenVersion(
    typeof payload.tokenVersion === "number" ? payload.tokenVersion : payload.ver
  );
  return createScopedPublicDocumentToken({
    kind: payload.kind,
    entityId: payload.entityId,
    businessId: payload.businessId,
    ver: tokenVersion,
  }, {
    expiresIn: payload.expiresIn ?? getPublicDocumentTokenExpiry(payload.kind),
  });
}

export function verifyAnyPublicDocumentToken(token: string): PublicDocumentTokenPayload | null {
  const payload = verifyScopedPublicDocumentToken<PublicDocumentTokenPayload>(token);
  if (!payload) return null;
  if (!payload.businessId || !payload.entityId) return null;
  if (payload.kind !== "quote" && payload.kind !== "invoice" && payload.kind !== "appointment") {
    return null;
  }
  const tokenVersion = normalizePublicDocumentTokenVersion(payload.ver);
  return {
    ...payload,
    ver: tokenVersion,
  };
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

export function verifyCurrentPublicDocumentToken(
  token: string,
  expected: { kind: PublicDocumentKind; entityId: string },
  currentVersion: unknown
): PublicDocumentTokenPayload | null {
  const payload = verifyPublicDocumentToken(token, expected);
  if (!payload) return null;
  if (!isPublicDocumentTokenCurrent(payload, currentVersion)) return null;
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

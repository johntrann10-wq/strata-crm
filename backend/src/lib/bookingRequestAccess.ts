import type { SignOptions } from "jsonwebtoken";
import { buildPublicAppUrl } from "./publicDocumentAccess.js";
import { createScopedPublicDocumentToken, verifyScopedPublicDocumentToken } from "./jwt.js";

export type BookingRequestTokenPayload = {
  kind: "booking_request";
  requestId: string;
  businessId: string;
  ver?: number;
};

const DEFAULT_BOOKING_REQUEST_TOKEN_EXPIRY: NonNullable<SignOptions["expiresIn"]> = "14d";

export function normalizeBookingRequestTokenVersion(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

export function createBookingRequestToken(
  payload: Omit<BookingRequestTokenPayload, "kind"> & { tokenVersion?: number; expiresIn?: SignOptions["expiresIn"] }
): string {
  const tokenVersion = normalizeBookingRequestTokenVersion(
    typeof payload.tokenVersion === "number" ? payload.tokenVersion : payload.ver
  );
  return createScopedPublicDocumentToken(
    {
      kind: "booking_request",
      requestId: payload.requestId,
      businessId: payload.businessId,
      ver: tokenVersion,
    },
    {
      expiresIn: payload.expiresIn ?? DEFAULT_BOOKING_REQUEST_TOKEN_EXPIRY,
    }
  );
}

export function verifyBookingRequestToken(
  token: string,
  expected: { requestId: string; businessId: string }
): BookingRequestTokenPayload | null {
  const payload = verifyScopedPublicDocumentToken<BookingRequestTokenPayload>(token);
  if (!payload) return null;
  if (payload.kind !== "booking_request") return null;
  if (!payload.businessId || !payload.requestId) return null;
  if (payload.requestId !== expected.requestId) return null;
  if (payload.businessId !== expected.businessId) return null;
  return {
    ...payload,
    ver: normalizeBookingRequestTokenVersion(payload.ver),
  };
}

export function isBookingRequestTokenCurrent(
  payload: Pick<BookingRequestTokenPayload, "ver"> | null | undefined,
  currentVersion: unknown
): boolean {
  if (!payload) return false;
  return normalizeBookingRequestTokenVersion(payload.ver) === normalizeBookingRequestTokenVersion(currentVersion);
}

export function verifyCurrentBookingRequestToken(
  token: string,
  expected: { requestId: string; businessId: string },
  currentVersion: unknown
): BookingRequestTokenPayload | null {
  const payload = verifyBookingRequestToken(token, expected);
  if (!payload) return null;
  if (!isBookingRequestTokenCurrent(payload, currentVersion)) return null;
  return payload;
}

export function buildPublicBookingRequestUrl(params: {
  businessId: string;
  requestId: string;
  token: string;
}): string {
  return buildPublicAppUrl(
    `/booking-request/${encodeURIComponent(params.businessId)}/${encodeURIComponent(
      params.requestId
    )}?token=${encodeURIComponent(params.token)}`
  );
}

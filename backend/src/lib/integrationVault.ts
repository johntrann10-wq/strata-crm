import crypto from "crypto";
import { BadRequestError } from "./errors.js";

const VAULT_PREFIX = "v1";

function getVaultKey(): Buffer {
  const secret = process.env.INTEGRATION_VAULT_SECRET?.trim();
  if (!secret) {
    throw new BadRequestError("Integration vault is not configured.");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

export function isIntegrationVaultConfigured(): boolean {
  return !!process.env.INTEGRATION_VAULT_SECRET?.trim();
}

export function encryptIntegrationSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getVaultKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VAULT_PREFIX, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(":");
}

export function decryptIntegrationSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  const [version, ivPart, tagPart, encryptedPart] = value.split(":");
  if (version !== VAULT_PREFIX || !ivPart || !tagPart || !encryptedPart) {
    throw new BadRequestError("Stored integration secret is invalid.");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getVaultKey(),
    Buffer.from(ivPart, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedPart, "base64url")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export function encryptIntegrationJson(value: Record<string, unknown> | null | undefined): string | null {
  if (!value) return null;
  return encryptIntegrationSecret(JSON.stringify(value));
}

export function decryptIntegrationJson<T>(value: string | null | undefined): T | null {
  const decrypted = decryptIntegrationSecret(value);
  if (!decrypted) return null;
  return JSON.parse(decrypted) as T;
}


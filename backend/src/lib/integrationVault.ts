import crypto from "crypto";
import { BadRequestError } from "./errors.js";

const VAULT_PREFIX = "v1";
const DEFAULT_PRIMARY_KEY_ID = "current";
const DEFAULT_PREVIOUS_KEY_ID = "previous";

type VaultKey = {
  id: string;
  key: Buffer;
};

function deriveVaultKey(secret: string): Buffer {
  return crypto.createHash("sha256").update(secret).digest();
}

function normalizeVaultKeyId(value: string | undefined, fallback: string): string {
  const keyId = value?.trim() || fallback;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(keyId)) {
    throw new BadRequestError("Integration vault key id is invalid.");
  }
  return keyId;
}

function getPrimaryVaultKey(): VaultKey {
  const secret = process.env.INTEGRATION_VAULT_SECRET?.trim();
  if (!secret) {
    throw new BadRequestError("Integration vault is not configured.");
  }
  return {
    id: normalizeVaultKeyId(process.env.INTEGRATION_VAULT_KEY_ID, DEFAULT_PRIMARY_KEY_ID),
    key: deriveVaultKey(secret),
  };
}

function getKnownVaultKeys(): VaultKey[] {
  const keys = [getPrimaryVaultKey()];
  const previousSecret = process.env.INTEGRATION_VAULT_PREVIOUS_SECRET?.trim();
  if (previousSecret) {
    keys.push({
      id: normalizeVaultKeyId(process.env.INTEGRATION_VAULT_PREVIOUS_KEY_ID, DEFAULT_PREVIOUS_KEY_ID),
      key: deriveVaultKey(previousSecret),
    });
  }
  return keys;
}

function decryptWithKey(input: {
  key: Buffer;
  ivPart: string;
  tagPart: string;
  encryptedPart: string;
}): string {
  const decipher = crypto.createDecipheriv("aes-256-gcm", input.key, Buffer.from(input.ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(input.tagPart, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(input.encryptedPart, "base64url")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

function decryptLegacySecret(parts: string[]): string {
  const [, ivPart, tagPart, encryptedPart] = parts;
  if (!ivPart || !tagPart || !encryptedPart) {
    throw new BadRequestError("Stored integration secret is invalid.");
  }
  for (const candidate of getKnownVaultKeys()) {
    try {
      return decryptWithKey({
        key: candidate.key,
        ivPart,
        tagPart,
        encryptedPart,
      });
    } catch {
      continue;
    }
  }
  throw new BadRequestError("Stored integration secret could not be decrypted with the configured vault keys.");
}

function decryptVersionedSecret(parts: string[]): string {
  const [, keyId, ivPart, tagPart, encryptedPart] = parts;
  if (!keyId || !ivPart || !tagPart || !encryptedPart) {
    throw new BadRequestError("Stored integration secret is invalid.");
  }
  const keys = getKnownVaultKeys();
  const prioritized = keys.find((candidate) => candidate.id === keyId);
  const candidates = prioritized
    ? [prioritized, ...keys.filter((candidate) => candidate.id !== keyId)]
    : keys;
  for (const candidate of candidates) {
    try {
      return decryptWithKey({
        key: candidate.key,
        ivPart,
        tagPart,
        encryptedPart,
      });
    } catch {
      continue;
    }
  }
  throw new BadRequestError("Stored integration secret could not be decrypted with the configured vault keys.");
}

export function isIntegrationVaultConfigured(): boolean {
  return !!process.env.INTEGRATION_VAULT_SECRET?.trim();
}

export function encryptIntegrationSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  const primaryKey = getPrimaryVaultKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", primaryKey.key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VAULT_PREFIX,
    primaryKey.id,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

export function isIntegrationSecretEncrypted(value: string | null | undefined): boolean {
  if (!value) return false;
  const parts = value.split(":");
  return (parts.length === 4 || parts.length === 5) && parts[0] === VAULT_PREFIX;
}

export function decryptIntegrationSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  const parts = value.split(":");
  if (parts[0] !== VAULT_PREFIX) {
    throw new BadRequestError("Stored integration secret is invalid.");
  }
  if (parts.length === 4) {
    return decryptLegacySecret(parts);
  }
  if (parts.length === 5) {
    return decryptVersionedSecret(parts);
  }
  throw new BadRequestError("Stored integration secret is invalid.");
}

export function maybeEncryptIntegrationSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  if (isIntegrationSecretEncrypted(value)) return value;
  return encryptIntegrationSecret(value);
}

export function maybeDecryptIntegrationSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!isIntegrationSecretEncrypted(value)) return value;
  return decryptIntegrationSecret(value);
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

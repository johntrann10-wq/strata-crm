import { ForbiddenError } from "./errors.js";
import {
  encryptIntegrationSecret,
  isIntegrationSecretEncrypted,
  isIntegrationVaultConfigured,
  maybeDecryptIntegrationSecret,
} from "./integrationVault.js";

function normalizeSecret(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function isLegacyPlaintextWebhookSecret(value: string | null | undefined): boolean {
  const normalized = normalizeSecret(value);
  return !!normalized && !isIntegrationSecretEncrypted(normalized);
}

export function normalizeBusinessWebhookSecretForStorage(value: string | null | undefined): string | null {
  const normalized = normalizeSecret(value);
  if (!normalized) return null;
  if (!isIntegrationVaultConfigured()) {
    throw new ForbiddenError("Encrypted webhook secret storage is not configured on this server.");
  }
  return encryptIntegrationSecret(normalized);
}

export function readBusinessWebhookSecret(value: string | null | undefined): string | null {
  const normalized = normalizeSecret(value);
  if (!normalized) return null;
  return maybeDecryptIntegrationSecret(normalized);
}

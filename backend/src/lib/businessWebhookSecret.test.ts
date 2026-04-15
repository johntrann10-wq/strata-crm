import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isLegacyPlaintextWebhookSecret,
  normalizeBusinessWebhookSecretForStorage,
  readBusinessWebhookSecret,
} from "./businessWebhookSecret.js";

describe("businessWebhookSecret", () => {
  const previousVaultSecret = process.env.INTEGRATION_VAULT_SECRET;
  const previousVaultFallbackSecret = process.env.INTEGRATION_VAULT_PREVIOUS_SECRET;
  const previousVaultKeyId = process.env.INTEGRATION_VAULT_KEY_ID;
  const previousVaultFallbackKeyId = process.env.INTEGRATION_VAULT_PREVIOUS_KEY_ID;

  beforeEach(() => {
    process.env.INTEGRATION_VAULT_SECRET = "test-vault-secret";
    delete process.env.INTEGRATION_VAULT_PREVIOUS_SECRET;
    delete process.env.INTEGRATION_VAULT_KEY_ID;
    delete process.env.INTEGRATION_VAULT_PREVIOUS_KEY_ID;
  });

  afterEach(() => {
    if (previousVaultSecret === undefined) {
      delete process.env.INTEGRATION_VAULT_SECRET;
    } else {
      process.env.INTEGRATION_VAULT_SECRET = previousVaultSecret;
    }
    if (previousVaultFallbackSecret === undefined) {
      delete process.env.INTEGRATION_VAULT_PREVIOUS_SECRET;
    } else {
      process.env.INTEGRATION_VAULT_PREVIOUS_SECRET = previousVaultFallbackSecret;
    }
    if (previousVaultKeyId === undefined) {
      delete process.env.INTEGRATION_VAULT_KEY_ID;
    } else {
      process.env.INTEGRATION_VAULT_KEY_ID = previousVaultKeyId;
    }
    if (previousVaultFallbackKeyId === undefined) {
      delete process.env.INTEGRATION_VAULT_PREVIOUS_KEY_ID;
    } else {
      process.env.INTEGRATION_VAULT_PREVIOUS_KEY_ID = previousVaultFallbackKeyId;
    }
  });

  it("encrypts outbound webhook secrets before storage", () => {
    const encrypted = normalizeBusinessWebhookSecretForStorage("super-secret");
    expect(encrypted).toBeTruthy();
    expect(encrypted).not.toBe("super-secret");
    expect(readBusinessWebhookSecret(encrypted)).toBe("super-secret");
  });

  it("detects legacy plaintext webhook secrets for backfill", () => {
    expect(isLegacyPlaintextWebhookSecret("legacy-secret")).toBe(true);
    expect(isLegacyPlaintextWebhookSecret(normalizeBusinessWebhookSecretForStorage("rotated-secret"))).toBe(false);
    expect(isLegacyPlaintextWebhookSecret(null)).toBe(false);
  });

  it("rejects webhook secret storage when the vault is unavailable", () => {
    delete process.env.INTEGRATION_VAULT_SECRET;
    expect(() => normalizeBusinessWebhookSecretForStorage("plain-secret")).toThrow(
      "Encrypted webhook secret storage is not configured on this server."
    );
  });
});

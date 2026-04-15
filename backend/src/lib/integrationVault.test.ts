import crypto from "crypto";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  decryptIntegrationJson,
  decryptIntegrationSecret,
  encryptIntegrationJson,
  encryptIntegrationSecret,
  isIntegrationSecretEncrypted,
  isIntegrationVaultConfigured,
  maybeDecryptIntegrationSecret,
  maybeEncryptIntegrationSecret,
} from "./integrationVault.js";

describe("integrationVault", () => {
  const previousSecret = process.env.INTEGRATION_VAULT_SECRET;
  const previousSecretFallback = process.env.INTEGRATION_VAULT_PREVIOUS_SECRET;
  const previousKeyId = process.env.INTEGRATION_VAULT_KEY_ID;
  const previousFallbackKeyId = process.env.INTEGRATION_VAULT_PREVIOUS_KEY_ID;

  function encryptLegacySecret(value: string, secret: string) {
    const key = crypto.createHash("sha256").update(secret).digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ["v1", iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(":");
  }

  beforeEach(() => {
    process.env.INTEGRATION_VAULT_SECRET = "test-vault-secret";
    process.env.INTEGRATION_VAULT_KEY_ID = "primary";
    delete process.env.INTEGRATION_VAULT_PREVIOUS_SECRET;
    delete process.env.INTEGRATION_VAULT_PREVIOUS_KEY_ID;
  });

  afterEach(() => {
    if (previousSecret === undefined) {
      delete process.env.INTEGRATION_VAULT_SECRET;
    } else {
      process.env.INTEGRATION_VAULT_SECRET = previousSecret;
    }
    if (previousSecretFallback === undefined) {
      delete process.env.INTEGRATION_VAULT_PREVIOUS_SECRET;
    } else {
      process.env.INTEGRATION_VAULT_PREVIOUS_SECRET = previousSecretFallback;
    }
    if (previousKeyId === undefined) {
      delete process.env.INTEGRATION_VAULT_KEY_ID;
    } else {
      process.env.INTEGRATION_VAULT_KEY_ID = previousKeyId;
    }
    if (previousFallbackKeyId === undefined) {
      delete process.env.INTEGRATION_VAULT_PREVIOUS_KEY_ID;
    } else {
      process.env.INTEGRATION_VAULT_PREVIOUS_KEY_ID = previousFallbackKeyId;
    }
  });

  it("encrypts and decrypts string secrets", () => {
    const encrypted = encryptIntegrationSecret("super-secret-token");
    expect(encrypted).toBeTruthy();
    expect(encrypted).not.toContain("super-secret-token");
    expect(encrypted?.startsWith("v1:primary:")).toBe(true);
    expect(decryptIntegrationSecret(encrypted)).toBe("super-secret-token");
  });

  it("detects encrypted secrets and preserves plaintext safely", () => {
    const encrypted = encryptIntegrationSecret("secret-123");
    expect(isIntegrationSecretEncrypted(encrypted)).toBe(true);
    expect(isIntegrationSecretEncrypted("plain-secret")).toBe(false);
    expect(maybeEncryptIntegrationSecret(encrypted)).toBe(encrypted);
    expect(maybeDecryptIntegrationSecret("plain-secret")).toBe("plain-secret");
  });

  it("round-trips secrets with the maybe helpers", () => {
    const encrypted = maybeEncryptIntegrationSecret("extra-secret");
    expect(encrypted).toBeTruthy();
    expect(isIntegrationSecretEncrypted(encrypted)).toBe(true);
    expect(maybeDecryptIntegrationSecret(encrypted)).toBe("extra-secret");
  });

  it("decrypts legacy ciphertext without a key id", () => {
    const legacy = encryptLegacySecret("legacy-secret", "test-vault-secret");
    expect(decryptIntegrationSecret(legacy)).toBe("legacy-secret");
  });

  it("supports decrypting with a previous rotation key", () => {
    process.env.INTEGRATION_VAULT_SECRET = "new-primary-vault-secret";
    process.env.INTEGRATION_VAULT_KEY_ID = "current";
    process.env.INTEGRATION_VAULT_PREVIOUS_SECRET = "test-vault-secret";
    process.env.INTEGRATION_VAULT_PREVIOUS_KEY_ID = "primary";

    const legacyRotationCiphertext = encryptLegacySecret("rotating-secret", "test-vault-secret");
    expect(decryptIntegrationSecret(legacyRotationCiphertext)).toBe("rotating-secret");
  });

  it("encrypts and decrypts json payloads", () => {
    const encrypted = encryptIntegrationJson({
      webhookUrl: "https://example.com/strata",
      selectedCalendarId: "primary",
    });
    expect(
      decryptIntegrationJson<{ webhookUrl: string; selectedCalendarId: string }>(encrypted)
    ).toEqual({
      webhookUrl: "https://example.com/strata",
      selectedCalendarId: "primary",
    });
  });

  it("reports whether the vault is configured", () => {
    expect(isIntegrationVaultConfigured()).toBe(true);
    delete process.env.INTEGRATION_VAULT_SECRET;
    expect(isIntegrationVaultConfigured()).toBe(false);
  });
});

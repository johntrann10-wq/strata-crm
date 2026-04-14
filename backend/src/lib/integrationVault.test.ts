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

  beforeEach(() => {
    process.env.INTEGRATION_VAULT_SECRET = "test-vault-secret";
  });

  afterEach(() => {
    process.env.INTEGRATION_VAULT_SECRET = previousSecret;
  });

  it("encrypts and decrypts string secrets", () => {
    const encrypted = encryptIntegrationSecret("super-secret-token");
    expect(encrypted).toBeTruthy();
    expect(encrypted).not.toContain("super-secret-token");
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

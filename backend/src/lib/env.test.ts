import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("./logger.js", () => ({
  logger: mocks.logger,
}));

vi.mock("./integrationFeatureFlags.js", () => ({
  listIntegrationFeatureFlags: () => ({
    quickbooks_online: false,
    twilio_sms: false,
    google_calendar: false,
    outbound_webhooks: false,
  }),
}));

vi.mock("./integrationVault.js", () => ({
  isIntegrationVaultConfigured: () => false,
}));

import { validateEnv } from "./env.js";

const originalEnv = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, originalEnv);
  vi.clearAllMocks();
});

describe("validateEnv", () => {
  it("rejects placeholder JWT secrets in production", () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "postgresql://db.example.com:5432/strata";
    process.env.JWT_SECRET = "change-me";
    process.env.FRONTEND_URL = "https://app.strata.test";
    process.env.PORT = "3001";
    process.env.CRON_SECRET = "valid-cron-secret-value";

    expect(() => validateEnv()).toThrow(/JWT_SECRET must not use a placeholder/i);
  });

  it("rejects invalid frontend URLs in production", () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "postgresql://db.example.com:5432/strata";
    process.env.JWT_SECRET = "production-jwt-secret-value";
    process.env.FRONTEND_URL = "not-a-url";
    process.env.PORT = "3001";
    process.env.CRON_SECRET = "valid-cron-secret-value";

    expect(() => validateEnv()).toThrow(/FRONTEND_URL must be a valid absolute http\(s\) URL/i);
  });

  it("rejects frontend URLs with paths in production", () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "postgresql://db.example.com:5432/strata";
    process.env.JWT_SECRET = "production-jwt-secret-value";
    process.env.FRONTEND_URL = "https://app.strata.test/dashboard";
    process.env.PORT = "3001";
    process.env.CRON_SECRET = "valid-cron-secret-value";

    expect(() => validateEnv()).toThrow(/FRONTEND_URL must be an origin only/i);
  });

  it("accepts non-production defaults with only a database URL", () => {
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL = "postgresql://localhost:5432/strata_dev";
    delete process.env.JWT_SECRET;
    delete process.env.FRONTEND_URL;
    delete process.env.PORT;
    delete process.env.API_BASE;

    expect(() => validateEnv()).not.toThrow();
    expect(process.env.JWT_SECRET).toBeTruthy();
    expect(process.env.FRONTEND_URL).toBe("http://localhost:5173");
    expect(process.env.API_BASE).toBe("http://localhost:3001");
  });

  it("rejects duplicate integration vault key ids in production", () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "postgresql://db.example.com:5432/strata";
    process.env.JWT_SECRET = "production-jwt-secret-value";
    process.env.FRONTEND_URL = "https://app.strata.test";
    process.env.PORT = "3001";
    process.env.CRON_SECRET = "valid-cron-secret-value";
    process.env.INTEGRATION_VAULT_SECRET = "production-vault-secret";
    process.env.INTEGRATION_VAULT_PREVIOUS_SECRET = "previous-vault-secret";
    process.env.INTEGRATION_VAULT_KEY_ID = "shared";
    process.env.INTEGRATION_VAULT_PREVIOUS_KEY_ID = "shared";

    expect(() => validateEnv()).toThrow(/must differ/i);
  });

  it("rejects a previous integration vault secret without a primary secret", () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "postgresql://db.example.com:5432/strata";
    process.env.JWT_SECRET = "production-jwt-secret-value";
    process.env.FRONTEND_URL = "https://app.strata.test";
    process.env.PORT = "3001";
    process.env.CRON_SECRET = "valid-cron-secret-value";
    delete process.env.INTEGRATION_VAULT_SECRET;
    process.env.INTEGRATION_VAULT_PREVIOUS_SECRET = "previous-vault-secret";

    expect(() => validateEnv()).toThrow(/INTEGRATION_VAULT_SECRET must be set/i);
  });
});

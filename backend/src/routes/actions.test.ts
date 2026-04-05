import { describe, it, expect } from "vitest";
import { z } from "zod";
import { getCronExecutionGate } from "./actions.js";

describe("actions route logic", () => {
  const idParamSchema = z.object({ id: z.string().uuid() });
  const clientIdParamSchema = z.object({ clientId: z.string().uuid().optional(), id: z.string().uuid().optional() });

  it("idParamSchema requires valid uuid id", () => {
    expect(idParamSchema.safeParse({ id: "550e8400-e29b-41d4-a716-446655440000" }).success).toBe(true);
    expect(idParamSchema.safeParse({ id: "invalid" }).success).toBe(false);
    expect(idParamSchema.safeParse({}).success).toBe(false);
  });

  it("clientIdParamSchema accepts clientId or id", () => {
    const withClientId = clientIdParamSchema.safeParse({ clientId: "550e8400-e29b-41d4-a716-446655440000" });
    expect(withClientId.success).toBe(true);
    if (withClientId.success) {
      expect(withClientId.data.clientId ?? withClientId.data.id).toBe("550e8400-e29b-41d4-a716-446655440000");
    }
    const withId = clientIdParamSchema.safeParse({ id: "660e8400-e29b-41d4-a716-446655440001" });
    expect(withId.success).toBe(true);
    if (withId.success) {
      expect(withId.data.clientId ?? withId.data.id).toBe("660e8400-e29b-41d4-a716-446655440001");
    }
  });

  it("multi-tenant: id must be uuid so we never accept arbitrary string from another tenant", () => {
    const bad = idParamSchema.safeParse({ id: "'; DROP TABLE businesses;--" });
    expect(bad.success).toBe(false);
  });

  it("blocks cron execution when CRON_SECRET is missing", () => {
    const previous = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;

    expect(getCronExecutionGate(undefined)).toEqual({
      ok: false,
      statusCode: 503,
      message: "CRON_SECRET is not configured.",
    });

    if (previous === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = previous;
    }
  });

  it("rejects cron execution when the provided secret does not match", () => {
    const previous = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "expected-secret";

    expect(getCronExecutionGate("wrong-secret")).toEqual({
      ok: false,
      statusCode: 401,
      message: "Unauthorized",
    });

    if (previous === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = previous;
    }
  });

  it("allows cron execution when the provided secret matches", () => {
    const previous = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "expected-secret";

    expect(getCronExecutionGate("expected-secret")).toEqual({
      ok: true,
    });

    if (previous === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = previous;
    }
  });
});

import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { coerceRateLimitResetAtMs, createInMemoryRateLimiter, createRateLimiter } from "./security.js";

function createMockResponse() {
  const headers = new Map<string, string>();
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    setHeader: vi.fn((name: string, value: string) => {
      headers.set(name, value);
    }),
    status: vi.fn(function (this: unknown, code: number) {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn(function (this: unknown, payload: unknown) {
      res.body = payload;
      return res;
    }),
  } as unknown as Response & { statusCode: number; body: unknown };

  return { res, headers };
}

describe("createInMemoryRateLimiter", () => {
  it("blocks requests after the configured limit and returns retry information", () => {
    const limiter = createInMemoryRateLimiter({
      windowMs: 60_000,
      max: 2,
      message: "Slow down",
    });
    const req = {
      ip: "127.0.0.1",
      method: "POST",
      path: "/sign-in",
      body: { email: "owner@example.com" },
      headers: {},
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as Request;

    const next = vi.fn();

    limiter.middleware(req, createMockResponse().res, next);
    limiter.middleware(req, createMockResponse().res, next);

    const { res, headers } = createMockResponse();
    limiter.middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      code: "RATE_LIMITED",
      message: "Slow down",
      retryAfterSeconds: expect.any(Number),
    });
    expect(headers.get("Retry-After")).toBeDefined();
    expect(headers.get("X-RateLimit-Limit")).toBe("2");
    expect(headers.get("X-RateLimit-Remaining")).toBe("0");
  });

  it("supports custom keys so sign-in limits can include normalized email", () => {
    const limiter = createInMemoryRateLimiter({
      windowMs: 60_000,
      max: 1,
      key: ({ ip, body }) => {
        const email = typeof (body as { email?: unknown })?.email === "string" ? (body as { email: string }).email : "";
        return `${ip}:${email.trim().toLowerCase()}`;
      },
    });

    const next = vi.fn();
    const makeReq = (email: string) =>
      ({
        ip: "127.0.0.1",
        method: "POST",
        path: "/sign-in",
        body: { email },
        headers: {},
        socket: { remoteAddress: "127.0.0.1" },
      }) as unknown as Request;

    limiter.middleware(makeReq("One@Example.com"), createMockResponse().res, next);
    limiter.middleware(makeReq("two@example.com"), createMockResponse().res, next);

    const { res } = createMockResponse();
    limiter.middleware(makeReq(" one@example.com "), res, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(res.status).toHaveBeenCalledWith(429);
  });
});

describe("createRateLimiter", () => {
  it("respects configured limits when using the in-memory store", async () => {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: 1,
      store: "memory",
      message: "Slow down",
    });
    const req = {
      ip: "127.0.0.1",
      method: "POST",
      path: "/auth/sign-in",
      body: {},
      headers: {},
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as Request;

    const next = vi.fn();
    await limiter.middleware(req, createMockResponse().res, next);

    const { res } = createMockResponse();
    await limiter.middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(429);
  });

  it("supports environment overrides for route-specific limits", async () => {
    process.env.RATE_LIMIT_AUTH_SIGN_IN_MAX = "1";
    process.env.RATE_LIMIT_AUTH_SIGN_IN_WINDOW_MS = "30000";

    try {
      const limiter = createRateLimiter({
        id: "auth_sign_in",
        windowMs: 60_000,
        max: 5,
        store: "memory",
        message: "Slow down",
      });
      const req = {
        ip: "127.0.0.1",
        method: "POST",
        path: "/auth/sign-in",
        body: { email: "owner@example.com" },
        headers: {},
        socket: { remoteAddress: "127.0.0.1" },
      } as unknown as Request;

      const next = vi.fn();
      await limiter.middleware(req, createMockResponse().res, next);

      const { res, headers } = createMockResponse();
      await limiter.middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(429);
      expect(headers.get("X-RateLimit-Limit")).toBe("1");
    } finally {
      delete process.env.RATE_LIMIT_AUTH_SIGN_IN_MAX;
      delete process.env.RATE_LIMIT_AUTH_SIGN_IN_WINDOW_MS;
    }
  });
});

describe("coerceRateLimitResetAtMs", () => {
  it("accepts database timestamps that come back as strings", () => {
    const fallbackMs = Date.UTC(2026, 3, 14, 12, 0, 0);

    expect(
      coerceRateLimitResetAtMs("2026-04-14T12:05:00.000Z", fallbackMs)
    ).toBe(Date.parse("2026-04-14T12:05:00.000Z"));
  });

  it("falls back safely for invalid timestamp values", () => {
    const fallbackMs = Date.UTC(2026, 3, 14, 12, 0, 0);

    expect(coerceRateLimitResetAtMs("not-a-date", fallbackMs)).toBe(fallbackMs);
    expect(coerceRateLimitResetAtMs(undefined, fallbackMs)).toBe(fallbackMs);
  });
});

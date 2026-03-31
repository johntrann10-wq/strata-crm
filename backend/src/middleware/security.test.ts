import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { createInMemoryRateLimiter } from "./security.js";

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
    expect(res.json).toHaveBeenCalledWith({ message: "Slow down" });
    expect(headers.get("Retry-After")).toBeDefined();
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

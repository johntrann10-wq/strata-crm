import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { buildCorsAllowedOrigins, corsMiddleware, normalizeOrigin } from "./cors.js";

describe("normalizeOrigin", () => {
  it("trims and strips trailing slashes", () => {
    expect(normalizeOrigin(" https://app.example.com/ ")).toBe("https://app.example.com");
    expect(normalizeOrigin("http://localhost:5173/")).toBe("http://localhost:5173");
  });
});

describe("buildCorsAllowedOrigins", () => {
  const prev = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...prev };
  });

  afterEach(() => {
    process.env = prev;
  });

  it("includes FRONTEND_URL and optional FRONTEND_ALLOWED_ORIGINS", () => {
    process.env.NODE_ENV = "production";
    process.env.FRONTEND_URL = "https://app.vercel.app";
    process.env.FRONTEND_ALLOWED_ORIGINS = "https://preview.vercel.app, http://localhost:5173 ";
    const s = buildCorsAllowedOrigins();
    expect(s.has("https://app.vercel.app")).toBe(true);
    expect(s.has("https://preview.vercel.app")).toBe(true);
    expect(s.has("http://localhost:5173")).toBe(true);
  });

  it("in non-production adds default dev origin", () => {
    process.env.NODE_ENV = "development";
    process.env.FRONTEND_URL = "http://localhost:5173";
    delete process.env.FRONTEND_ALLOWED_ORIGINS;
    const s = buildCorsAllowedOrigins();
    expect(s.has("http://localhost:5173")).toBe(true);
  });
});

describe("corsMiddleware", () => {
  it("sets ACAO to request origin when allowed and ends OPTIONS with 204", () => {
    const allowed = new Set(["https://app.vercel.app"]);
    const mw = corsMiddleware(allowed);
    const headers: Record<string, string> = {};
    const req = {
      method: "OPTIONS",
      headers: { origin: "https://app.vercel.app" },
    } as unknown as import("express").Request;
    const res = {
      setHeader(k: string, v: string) {
        headers[k] = v;
      },
      status: (code: number) => ({
        end: () => {
          expect(code).toBe(204);
        },
      }),
    } as unknown as import("express").Response;
    let nextCalled = false;
    mw(req, res, () => {
      nextCalled = true;
    });
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://app.vercel.app");
    expect(headers["Access-Control-Allow-Headers"]).toContain("Authorization");
    expect(nextCalled).toBe(false);
  });

  it("does not set ACAO when origin is not allowed", () => {
    const allowed = new Set(["https://app.vercel.app"]);
    const mw = corsMiddleware(allowed);
    const headers: Record<string, string> = {};
    const req = {
      method: "GET",
      headers: { origin: "https://evil.example" },
    } as unknown as import("express").Request;
    const res = {
      setHeader(k: string, v: string) {
        headers[k] = v;
      },
    } as unknown as import("express").Response;
    let nextCalled = false;
    mw(req, res, () => {
      nextCalled = true;
    });
    expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
    expect(nextCalled).toBe(true);
  });
});

/**
 * Integration tests: HTTP layer and auth guards.
 * No DB mocking - protected routes must return 401 without session.
 */
import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../app.js";

describe("API integration", () => {
  it("GET /api/health returns 200 and { ok: true }", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
  });

  it("GET /api/appointments without auth returns 401", async () => {
    const res = await request(app).get("/api/appointments");
    expect(res.status).toBe(401);
  });

  it("GET /api/invoices without auth returns 401", async () => {
    const res = await request(app).get("/api/invoices");
    expect(res.status).toBe(401);
  });

  it("GET /api/payments without auth returns 401", async () => {
    const res = await request(app).get("/api/payments");
    expect(res.status).toBe(401);
  });

  it("GET /api/clients without auth returns 401", async () => {
    const res = await request(app).get("/api/clients");
    expect(res.status).toBe(401);
  });

  it("POST /api/auth/sign-in with invalid body returns 400", async () => {
    const res = await request(app).post("/api/auth/sign-in").send({});
    expect(res.status).toBe(400);
    expect(res.headers["cache-control"]).toContain("no-store");
  });
});

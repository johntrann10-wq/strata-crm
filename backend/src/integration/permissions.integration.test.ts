import type { Express } from "express";
import { beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createAccessToken } from "../lib/jwt.js";

const resolveTenantContext = vi.fn();
const loadAuthTokenVersion = vi.fn();

vi.mock("../lib/tenantContext.js", () => ({
  resolveTenantContext: (...args: unknown[]) => resolveTenantContext(...args),
}));

vi.mock("../lib/authTokenVersion.js", () => ({
  loadAuthTokenVersion: (...args: unknown[]) => loadAuthTokenVersion(...args),
  isAuthTokenVersionMismatch: (tokenVersion?: number, current?: number) => tokenVersion !== current,
  normalizeTokenVersion: (value?: number) => (typeof value === "number" && Number.isFinite(value) ? value : 1),
}));

let app: Express;

beforeAll(async () => {
  ({ app } = await import("../app.js"));
});

describe("permission enforcement", () => {
  it("denies core CRUD writes when permissions are missing", async () => {
    resolveTenantContext.mockResolvedValue({
      businessId: "biz-test",
      role: "technician",
      permissions: ["customers.read"],
      source: "membership",
    });
    loadAuthTokenVersion.mockResolvedValue(1);

    const token = createAccessToken("user-test", 1);
    const res = await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${token}`)
      .send({ firstName: "Taylor", lastName: "Jones" });

    expect(res.status).toBe(403);
  });

  it("hides activity logs without dashboard permissions", async () => {
    resolveTenantContext.mockResolvedValue({
      businessId: "biz-test",
      role: "technician",
      permissions: ["appointments.read"],
      source: "membership",
    });
    loadAuthTokenVersion.mockResolvedValue(1);

    const token = createAccessToken("user-test", 1);
    const res = await request(app)
      .get("/api/activity-logs")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it("hides notification logs without settings permissions", async () => {
    resolveTenantContext.mockResolvedValue({
      businessId: "biz-test",
      role: "technician",
      permissions: ["appointments.read"],
      source: "membership",
    });
    loadAuthTokenVersion.mockResolvedValue(1);

    const token = createAccessToken("user-test", 1);
    const res = await request(app)
      .get("/api/notification-logs")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});

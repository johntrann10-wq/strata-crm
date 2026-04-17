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

  it("blocks activity log writes without the matching entity write permission", async () => {
    resolveTenantContext.mockResolvedValue({
      businessId: "biz-test",
      role: "technician",
      permissions: ["appointments.read"],
      source: "membership",
    });
    loadAuthTokenVersion.mockResolvedValue(1);

    const token = createAccessToken("user-test", 1);
    const res = await request(app)
      .post("/api/activity-logs")
      .set("Authorization", `Bearer ${token}`)
      .send({
        entityType: "appointment",
        entityId: "11111111-1111-1111-1111-111111111111",
        kind: "note",
        body: "Customer asked to shift arrival by 30 minutes.",
      });

    expect(res.status).toBe(403);
  });

  it("denies restore and preset actions when write permissions are missing", async () => {
    resolveTenantContext.mockResolvedValue({
      businessId: "biz-test",
      role: "technician",
      permissions: ["customers.read"],
      source: "membership",
    });
    loadAuthTokenVersion.mockResolvedValue(1);

    const token = createAccessToken("user-test", 1);
    const restoreClient = await request(app)
      .post("/api/actions/restoreClient")
      .set("Authorization", `Bearer ${token}`)
      .send({ id: "client-test" });
    const applyPreset = await request(app)
      .post("/api/actions/applyBusinessPreset")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(restoreClient.status).toBe(403);
    expect(applyPreset.status).toBe(403);
  });

  it("denies payment reversal actions without payments.write", async () => {
    resolveTenantContext.mockResolvedValue({
      businessId: "biz-test",
      role: "technician",
      permissions: ["payments.read"],
      source: "membership",
    });
    loadAuthTokenVersion.mockResolvedValue(1);

    const token = createAccessToken("user-test", 1);
    const res = await request(app)
      .post("/api/actions/reversePayment")
      .set("Authorization", `Bearer ${token}`)
      .send({ id: "payment-test" });

    expect(res.status).toBe(403);
  });

  it("denies booking-request owner actions without appointments.write", async () => {
    resolveTenantContext.mockResolvedValue({
      businessId: "biz-test",
      role: "technician",
      permissions: ["appointments.read"],
      source: "membership",
    });
    loadAuthTokenVersion.mockResolvedValue(1);

    const token = createAccessToken("user-test", 1);
    const requestId = "11111111-1111-1111-1111-111111111111";
    const businessId = "11111111-1111-1111-1111-111111111111";

    const approve = await request(app)
      .post(`/api/businesses/${businessId}/booking-requests/${requestId}/approve`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const proposeAlternates = await request(app)
      .post(`/api/businesses/${businessId}/booking-requests/${requestId}/propose-alternates`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const askNewTime = await request(app)
      .post(`/api/businesses/${businessId}/booking-requests/${requestId}/request-new-time`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const decline = await request(app)
      .post(`/api/businesses/${businessId}/booking-requests/${requestId}/decline`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(approve.status).toBe(403);
    expect(proposeAlternates.status).toBe(403);
    expect(askNewTime.status).toBe(403);
    expect(decline.status).toBe(403);
  });

  it("denies vehicle archive actions without vehicles.write", async () => {
    resolveTenantContext.mockResolvedValue({
      businessId: "biz-test",
      role: "technician",
      permissions: ["vehicles.read"],
      source: "membership",
    });
    loadAuthTokenVersion.mockResolvedValue(1);

    const token = createAccessToken("user-test", 1);
    const res = await request(app)
      .delete("/api/vehicles/vehicle-test")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it("rejects stale access tokens after token version changes", async () => {
    resolveTenantContext.mockResolvedValue({
      businessId: "biz-test",
      role: "owner",
      permissions: ["customers.read", "customers.write", "dashboard.view"],
      source: "membership",
    });
    loadAuthTokenVersion.mockResolvedValue(2);

    const staleToken = createAccessToken("user-test", 1);
    const res = await request(app)
      .get("/api/clients")
      .set("Authorization", `Bearer ${staleToken}`);

    expect(res.status).toBe(401);
  });
});

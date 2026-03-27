import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../app.js";

describe("Reliability integration", () => {
  it("rejects protected write routes without auth instead of silently succeeding", async () => {
    const cases = [
      { method: "post" as const, path: "/api/clients", body: { firstName: "Nope" } },
      { method: "post" as const, path: "/api/vehicles", body: { make: "Toyota" } },
      { method: "post" as const, path: "/api/appointments", body: { title: "Test" } },
      { method: "post" as const, path: "/api/quotes", body: { clientId: "x" } },
      { method: "post" as const, path: "/api/invoices", body: { clientId: "x" } },
      { method: "post" as const, path: "/api/actions/applyBusinessPreset", body: {} },
    ];

    for (const entry of cases) {
      const res = await request(app)[entry.method](entry.path).send(entry.body);
      expect(res.status, `${entry.method.toUpperCase()} ${entry.path}`).toBe(401);
    }
  });

  it("rejects invalid bearer tokens on protected reads", async () => {
    const cases = ["/api/clients", "/api/vehicles", "/api/appointments", "/api/quotes", "/api/invoices"];

    for (const path of cases) {
      const res = await request(app).get(path).set("Authorization", "Bearer invalid-token");
      expect(res.status, `GET ${path}`).toBe(401);
    }
  });
});

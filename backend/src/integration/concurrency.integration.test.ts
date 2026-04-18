/**
 * Concurrency and hardening integration tests.
 * Run with real DB and auth when RUN_CONCURRENCY_TESTS=1.
 * These tests verify: idempotent payment reversal, unique invoice numbers under parallel creates.
 */
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../app.js";

const runConcurrencyTests =
  process.env.RUN_CONCURRENCY_TESTS === "1" &&
  process.env.DATABASE_URL != null &&
  !process.env.DATABASE_URL.includes("strata_test") &&
  process.env.DATABASE_URL !== "postgresql://localhost:5432/strata_test";

describe.skipIf(!runConcurrencyTests)("Concurrency and hardening (requires DB + auth)", () => {
  let authCookie: string;
  let businessId: string;
  let clientId: string;

  beforeAll(async () => {
    const email = `test-${Date.now()}@example.com`;
    const password = "TestPassword123!";
    const signUp = await request(app).post("/api/auth/sign-up").send({ email, password, firstName: "Test", lastName: "User" });
    expect(signUp.status).toBe(201);
    const cookie = signUp.headers["set-cookie"];
    if (cookie) authCookie = Array.isArray(cookie) ? cookie[0] : cookie;
    else {
      const signIn = await request(app).post("/api/auth/sign-in").send({ email, password });
      expect(signIn.status).toBe(200);
      const setCookie = signIn.headers["set-cookie"];
      authCookie = Array.isArray(setCookie) ? setCookie[0] ?? "" : setCookie ?? "";
    }
    expect(authCookie).toBeTruthy();
    const bizRes = await request(app)
      .post("/api/businesses")
      .set("Cookie", authCookie)
      .send({ name: "Concurrency Test Business", type: "detailing", timezone: "America/New_York" });
    expect(bizRes.status).toBe(201);
    businessId = bizRes.body?.id ?? "";
    expect(businessId).toBeTruthy();
    const clientRes = await request(app).post("/api/clients").set("Cookie", authCookie).send({ firstName: "C", lastName: "L" });
    expect(clientRes.status).toBe(201);
    clientId = clientRes.body?.id ?? "";
    expect(clientId).toBeTruthy();
  });

  it("payment reversal is idempotent: second reverse returns 200 with same payment", async () => {
    const invRes = await request(app)
      .post("/api/invoices")
      .set("Cookie", authCookie)
      .send({ clientId, lineItems: [{ description: "Test", quantity: 1, unitPrice: 100 }] });
    expect(invRes.status).toBe(201);
    const invoiceId = invRes.body?.id;
    const payRes = await request(app)
      .post("/api/payments")
      .set("Cookie", authCookie)
      .send({ invoiceId, amount: 50, method: "cash" });
    expect(payRes.status).toBe(201);
    const paymentId = payRes.body?.id;

    const first = await request(app).post(`/api/payments/${paymentId}/reverse`).set("Cookie", authCookie);
    expect(first.status).toBe(200);
    expect(first.body?.reversedAt).toBeTruthy();

    const second = await request(app).post(`/api/payments/${paymentId}/reverse`).set("Cookie", authCookie);
    expect(second.status).toBe(200);
    expect(second.body?.id).toBe(paymentId);
    expect(second.body?.reversedAt).toBeTruthy();
  });

  it("concurrent invoice creates yield unique invoice numbers", async () => {
    const concurrency = 10;
    const results = await Promise.all(
      Array.from({ length: concurrency }, () =>
        request(app)
          .post("/api/invoices")
          .set("Cookie", authCookie)
          .send({ clientId, lineItems: [{ description: "Item", quantity: 1, unitPrice: 10 }] })
      )
    );
    const created = results.filter((r) => r.status === 201);
    expect(created.length).toBe(concurrency);
    const numbers = created.map((r) => r.body?.invoiceNumber).filter(Boolean);
    const unique = new Set(numbers);
    expect(unique.size).toBe(numbers.length);
  }, 30000);
});

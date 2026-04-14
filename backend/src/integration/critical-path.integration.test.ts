import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import type { Application } from "express";
import { createPublicDocumentToken } from "../lib/publicDocumentAccess.js";

// Minimal smoke coverage for the critical end-to-end API chain.
// Runs against an embedded Postgres instance so tests are self-contained.
//
// embedded-postgres often hangs on native Windows; run backend tests on Linux/macOS/WSL/CI,
// or exercise the API manually. Unit + api.integration tests still run on Windows.
const skipEmbeddedCriticalPath = process.platform === "win32";

describe.skipIf(skipEmbeddedCriticalPath)("Critical path smoke (backend integration)", () => {
  let embedded: EmbeddedPostgres | null = null;
  let dbUrl = "";
  let app: Application | undefined;
  let closeDb: (() => Promise<void>) | undefined;

  const password = "TestPassword123!";

  const email = `smoke-${Date.now()}@example.com`;
  const clientEmail = `client-${Date.now()}@example.com`;

  let token = "";
  let userId = "";
  let businessId = "";
  let clientId = "";
  let vehicleId = "";
  let appointmentId = "";
  let quoteId = "";
  let invoiceId = "";

  beforeAll(async () => {
    const port = Number(process.env.EMBEDDED_PG_PORT ?? 5433);
    const databaseDir = path.join(os.tmpdir(), `strata-embedded-pg-${Date.now()}`);
    const embeddedDbName = `strata_test_${Date.now()}`;

    embedded = new EmbeddedPostgres({
      databaseDir,
      user: "postgres",
      password: "postgres",
      port,
      persistent: false,
      onLog: () => {},
      onError: (e) => console.error("[embedded-postgres]", e),
    });

    await embedded.initialise();
    await embedded.start();
    await embedded.createDatabase(embeddedDbName);

    dbUrl = `postgresql://postgres:postgres@localhost:${port}/${embeddedDbName}`;

    // Run schema creation directly (matches backend/scripts/init-schema.sql)
    const testFile = fileURLToPath(import.meta.url);
    const testDir = path.dirname(testFile);
    // backend/src/integration -> backend/scripts
    const sqlPath = path.join(testDir, "..", "..", "scripts", "init-schema.sql");

    const sql = fs.readFileSync(sqlPath, "utf8");
    const client = new pg.Client({ connectionString: dbUrl });
    await client.connect();
    await client.query(sql);
    await client.end();

    // Ensure backend imports validate env against our embedded DB.
    process.env.DATABASE_URL = dbUrl;
    process.env.JWT_SECRET ||= "test-jwt-secret";
    process.env.FRONTEND_URL ||= "http://localhost:5173";
    process.env.SMTP_HOST ||= "smtp.gmail.com";
    process.env.SMTP_PORT ||= "465";
    process.env.SMTP_USER ||= "test@example.com";
    process.env.SMTP_PASS ||= "test-app-password";
    process.env.SMTP_FROM ||= process.env.SMTP_USER;
    process.env.STRIPE_SECRET_KEY ||= "sk_test_dummy";
    process.env.STRIPE_WEBHOOK_SECRET ||= "whsec_dummy";
    process.env.STRIPE_PRICE_ID ||= "price_dummy";
    process.env.CRON_SECRET ||= "cron_test_dummy";
    process.env.PORT ||= "3001";
    process.env.LOG_LEVEL ||= "info";

    const mod = await import("../app.js");
    app = mod.app;

    // Import after env + embedded DB are ready so the pool connects to the right database.
    const dbMod = await import("../db/index.js");
    closeDb = dbMod.closeDb;
  }, 60000);

  afterAll(async () => {
    if (closeDb) {
      await closeDb();
    }
    await embedded?.stop();
  });

  it("sign-up -> sign-in -> /auth/me -> onboarding -> client/vehicle/quote/appointment/invoice", async () => {
    if (!app) throw new Error("Backend app failed to load.");

    // sign-up
    const signUpRes = await request(app).post("/api/auth/sign-up").send({
      email,
      password,
      firstName: "Smoke",
      lastName: "Test",
    });
    expect(signUpRes.status).toBe(201);
    expect(signUpRes.body?.data?.id).toBeTruthy();
    expect(signUpRes.body?.data?.token).toBeTruthy();
    userId = signUpRes.body.data.id;
    token = signUpRes.body.data.token;

    // sign-in (explicitly in case sign-up/onboarding logic changes)
    const signInRes = await request(app).post("/api/auth/sign-in").send({
      email,
      password,
    });
    expect(signInRes.status).toBe(200);
    expect(signInRes.body?.data?.id).toBe(userId);
    token = signInRes.body.data.token;

    // /auth/me with token
    const meRes = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body?.data?.id).toBe(userId);
    expect(meRes.body?.data?.token).toBeTruthy();

    // create business
    const businessRes = await request(app).post("/api/businesses").set("Authorization", `Bearer ${token}`).send({
      name: "Smoke Business",
      type: "tire_shop",
      staffCount: 1,
      operatingHours: "Mon-Fri 09:00-17:00",
    });
    expect(businessRes.status).toBe(201);
    businessId = businessRes.body?.id;
    expect(businessId).toBeTruthy();

    // complete onboarding
    const onboardingRes = await request(app)
      .post(`/api/businesses/${encodeURIComponent(businessId)}/completeOnboarding`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(onboardingRes.status).toBe(200);
    expect(onboardingRes.body?.onboardingComplete).toBe(true);

    const billingStatusRes = await request(app)
      .get("/api/billing/status")
      .set("Authorization", `Bearer ${token}`)
      .set("x-business-id", businessId);
    expect(billingStatusRes.status).toBe(200);
    expect(billingStatusRes.body?.accessState).toBe("active_trial");
    expect(billingStatusRes.body?.status).toBe("trialing");
    expect(billingStatusRes.body?.billingHasPaymentMethod).toBe(false);
    expect(billingStatusRes.body?.trialEndsAt).toBeTruthy();

    const businessBeforeRetryRes = await request(app)
      .get(`/api/businesses/${encodeURIComponent(businessId)}`)
      .set("Authorization", `Bearer ${token}`)
      .set("x-business-id", businessId);
    expect(businessBeforeRetryRes.status).toBe(200);
    expect(businessBeforeRetryRes.body?.stripeCustomerId).toBeTruthy();
    expect(businessBeforeRetryRes.body?.stripeSubscriptionId).toBeTruthy();
    const stripeCustomerId = businessBeforeRetryRes.body?.stripeCustomerId as string;
    const stripeSubscriptionId = businessBeforeRetryRes.body?.stripeSubscriptionId as string;

    // replay onboarding completion to prove trial setup stays idempotent on retry
    const onboardingReplayRes = await request(app)
      .post(`/api/businesses/${encodeURIComponent(businessId)}/completeOnboarding`)
      .set("Authorization", `Bearer ${token}`)
      .set("x-business-id", businessId)
      .send({});
    expect(onboardingReplayRes.status).toBe(200);

    const businessAfterRetryRes = await request(app)
      .get(`/api/businesses/${encodeURIComponent(businessId)}`)
      .set("Authorization", `Bearer ${token}`)
      .set("x-business-id", businessId);
    expect(businessAfterRetryRes.status).toBe(200);
    expect(businessAfterRetryRes.body?.stripeCustomerId).toBe(stripeCustomerId);
    expect(businessAfterRetryRes.body?.stripeSubscriptionId).toBe(stripeSubscriptionId);

    // create client
    const clientRes = await request(app).post("/api/clients").set("Authorization", `Bearer ${token}`).send({
      firstName: "E2E",
      lastName: "Client",
      email: clientEmail,
    });
    expect(clientRes.status).toBe(201);
    clientId = clientRes.body?.id;
    expect(clientId).toBeTruthy();

    // create vehicle
    const vehicleRes = await request(app).post("/api/vehicles").set("Authorization", `Bearer ${token}`).send({
      clientId,
      make: "Honda",
      model: "Civic",
      year: 2020,
    });
    expect(vehicleRes.status).toBe(201);
    vehicleId = vehicleRes.body?.id;
    expect(vehicleId).toBeTruthy();

    // create quote
    const quoteRes = await request(app).post("/api/quotes").set("Authorization", `Bearer ${token}`).send({
      clientId,
      vehicleId,
      lineItems: [
        {
          description: "Test Service",
          quantity: 1,
          unitPrice: 100,
        },
      ],
    });
    expect(quoteRes.status).toBe(201);
    quoteId = quoteRes.body?.id;
    expect(quoteId).toBeTruthy();
    expect(quoteRes.body?.total).toBe("100.00");

    // create appointment
    const start = new Date();
    start.setDate(start.getDate() + 2);
    start.setHours(10, 0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    const appointmentRes = await request(app)
      .post("/api/appointments")
      .set("Authorization", `Bearer ${token}`)
      .send({
        clientId,
        vehicleId,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        title: "Smoke Appointment",
      });
    expect(appointmentRes.status).toBe(201);
    appointmentId = appointmentRes.body?.id;
    expect(appointmentId).toBeTruthy();

    const appointmentToken = createPublicDocumentToken({
      kind: "appointment",
      entityId: appointmentId,
      businessId,
    });

    const appointmentPublicBeforeCancel = await request(app)
      .get(`/api/appointments/${appointmentId}/public-html`)
      .query({ token: appointmentToken });
    expect(appointmentPublicBeforeCancel.status).toBe(200);

    // create invoice
    const invoiceRes = await request(app).post("/api/invoices").set("Authorization", `Bearer ${token}`).send({
      clientId,
      appointmentId,
      quoteId,
      lineItems: [
        {
          description: "Test Service",
          quantity: 1,
          unitPrice: 100,
        },
      ],
    });
    expect(invoiceRes.status).toBe(201);
    invoiceId = invoiceRes.body?.id;
    expect(invoiceId).toBeTruthy();
    expect(invoiceRes.body?.invoiceNumber).toMatch(/^INV-/);

    const cancelRes = await request(app)
      .post(`/api/appointments/${appointmentId}/cancel`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(cancelRes.status).toBe(200);

    const appointmentPublicAfterCancel = await request(app)
      .get(`/api/appointments/${appointmentId}/public-html`)
      .query({ token: appointmentToken });
    expect(appointmentPublicAfterCancel.status).toBe(403);
  });
});


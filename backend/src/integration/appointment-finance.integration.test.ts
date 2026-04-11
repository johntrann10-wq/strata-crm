import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import type { Application } from "express";

const skipEmbeddedFinancePath = process.platform === "win32";

describe.skipIf(skipEmbeddedFinancePath)("Appointment finance critical path (backend integration)", () => {
  let embedded: EmbeddedPostgres | null = null;
  let dbUrl = "";
  let app: Application | undefined;
  let closeDb: (() => Promise<void>) | undefined;

  const password = "TestPassword123!";
  const email = `finance-${Date.now()}@example.com`;

  let token = "";
  let businessId = "";
  let clientId = "";
  let vehicleId = "";

  beforeAll(async () => {
    const port = Number(process.env.EMBEDDED_PG_PORT ?? 5434);
    const databaseDir = path.join(os.tmpdir(), `strata-finance-embedded-pg-${Date.now()}`);
    const embeddedDbName = `strata_finance_test_${Date.now()}`;

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

    const testFile = fileURLToPath(import.meta.url);
    const testDir = path.dirname(testFile);
    const sqlPath = path.join(testDir, "..", "..", "scripts", "init-schema.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");
    const client = new pg.Client({ connectionString: dbUrl });
    await client.connect();
    await client.query(sql);
    await client.end();

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

    const dbMod = await import("../db/index.js");
    closeDb = dbMod.closeDb;

    const signUpRes = await request(app).post("/api/auth/sign-up").send({
      email,
      password,
      firstName: "Finance",
      lastName: "Test",
    });
    expect(signUpRes.status).toBe(201);
    token = signUpRes.body.data.token;

    const businessRes = await request(app).post("/api/businesses").set("Authorization", `Bearer ${token}`).send({
      name: "Finance Test Business",
      type: "detail_shop",
      staffCount: 1,
      operatingHours: "Mon-Fri 09:00-17:00",
    });
    expect(businessRes.status).toBe(201);
    businessId = businessRes.body.id;

    const onboardingRes = await request(app)
      .post(`/api/businesses/${encodeURIComponent(businessId)}/completeOnboarding`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(onboardingRes.status).toBe(200);

    const clientRes = await request(app).post("/api/clients").set("Authorization", `Bearer ${token}`).send({
      firstName: "Jacob",
      lastName: "Wheelihan",
      email: `client-${Date.now()}@example.com`,
    });
    expect(clientRes.status).toBe(201);
    clientId = clientRes.body.id;

    const vehicleRes = await request(app).post("/api/vehicles").set("Authorization", `Bearer ${token}`).send({
      clientId,
      year: 2022,
      make: "Tesla",
      model: "Model Y",
    });
    expect(vehicleRes.status).toBe(201);
    vehicleId = vehicleRes.body.id;
  }, 60000);

  afterAll(async () => {
    if (closeDb) {
      await closeDb();
    }
    await embedded?.stop();
  });

  async function createAppointment(options?: { depositAmount?: number; totalPrice?: number }) {
    if (!app) throw new Error("Backend app failed to load.");
    const start = new Date();
    start.setDate(start.getDate() + 3);
    start.setHours(9, 0, 0, 0);
    const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
    const totalPrice = options?.totalPrice ?? 715.85;

    const appointmentRes = await request(app)
      .post("/api/appointments")
      .set("Authorization", `Bearer ${token}`)
      .send({
        clientId,
        vehicleId,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        title: "5-Year Ceramic Coating",
        depositAmount: options?.depositAmount ?? 0,
      });

    expect(appointmentRes.status).toBe(201);

    const appointmentId = appointmentRes.body.id as string;
    const updateRes = await request(app)
      .patch(`/api/appointments/${encodeURIComponent(appointmentId)}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        totalPrice,
      });
    expect(updateRes.status).toBe(200);

    return appointmentId;
  }

  async function getAppointment(appointmentId: string) {
    if (!app) throw new Error("Backend app failed to load.");
    const res = await request(app)
      .get(`/api/appointments/${encodeURIComponent(appointmentId)}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    return res.body as {
      id: string;
      collectedAmount: number;
      balanceDue: number;
      paidInFull: boolean;
      depositSatisfied: boolean;
      depositAmount: string | number | null;
      totalPrice: string | number | null;
    };
  }

  it("keeps brand-new no-deposit appointments unpaid with full balance due", async () => {
    const appointmentId = await createAppointment({ depositAmount: 0, totalPrice: 715.85 });
    const appointment = await getAppointment(appointmentId);

    expect(Number(appointment.depositAmount ?? 0)).toBe(0);
    expect(Number(appointment.totalPrice ?? 0)).toBe(715.85);
    expect(Number(appointment.collectedAmount ?? 0)).toBe(0);
    expect(Number(appointment.balanceDue ?? 0)).toBe(715.85);
    expect(appointment.depositSatisfied).toBe(false);
    expect(appointment.paidInFull).toBe(false);
  });

  it("records and reverses a required deposit without inventing paid-in-full state", async () => {
    if (!app) throw new Error("Backend app failed to load.");

    const appointmentId = await createAppointment({ depositAmount: 200, totalPrice: 715.85 });
    const payRes = await request(app)
      .post(`/api/appointments/${encodeURIComponent(appointmentId)}/recordDepositPayment`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        amount: 200,
        method: "card",
      });

    expect(payRes.status).toBe(200);
    expect(payRes.body.depositSatisfied).toBe(true);

    let appointment = await getAppointment(appointmentId);
    expect(Number(appointment.collectedAmount ?? 0)).toBe(200);
    expect(Number(appointment.balanceDue ?? 0)).toBe(515.85);
    expect(appointment.depositSatisfied).toBe(true);
    expect(appointment.paidInFull).toBe(false);

    const reverseRes = await request(app)
      .post(`/api/appointments/${encodeURIComponent(appointmentId)}/reverseDepositPayment`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(reverseRes.status).toBe(200);
    expect(reverseRes.body.depositSatisfied).toBe(false);

    appointment = await getAppointment(appointmentId);
    expect(Number(appointment.collectedAmount ?? 0)).toBe(0);
    expect(Number(appointment.balanceDue ?? 0)).toBe(715.85);
    expect(appointment.depositSatisfied).toBe(false);
    expect(appointment.paidInFull).toBe(false);
  });

  it("reflects invoice payments and reversals back onto the linked appointment", async () => {
    if (!app) throw new Error("Backend app failed to load.");

    const appointmentId = await createAppointment({ depositAmount: 0, totalPrice: 715.85 });

    const invoiceRes = await request(app)
      .post("/api/invoices")
      .set("Authorization", `Bearer ${token}`)
      .send({
        clientId,
        appointmentId,
        lineItems: [
          {
            description: "5-Year Ceramic Coating",
            quantity: 1,
            unitPrice: 715.85,
          },
        ],
      });

    expect(invoiceRes.status).toBe(201);
    const invoiceId = invoiceRes.body.id as string;

    const paymentRes = await request(app)
      .post("/api/payments")
      .set("Authorization", `Bearer ${token}`)
      .send({
        invoiceId,
        amount: 715.85,
        method: "card",
      });

    expect(paymentRes.status).toBe(201);
    const paymentId = paymentRes.body.id as string;

    let appointment = await getAppointment(appointmentId);
    expect(Number(appointment.collectedAmount ?? 0)).toBe(715.85);
    expect(Number(appointment.balanceDue ?? 0)).toBe(0);
    expect(appointment.depositSatisfied).toBe(false);
    expect(appointment.paidInFull).toBe(true);

    const reverseRes = await request(app)
      .post(`/api/payments/${encodeURIComponent(paymentId)}/reverse`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(reverseRes.status).toBe(200);

    appointment = await getAppointment(appointmentId);
    expect(Number(appointment.collectedAmount ?? 0)).toBe(0);
    expect(Number(appointment.balanceDue ?? 0)).toBe(715.85);
    expect(appointment.depositSatisfied).toBe(false);
    expect(appointment.paidInFull).toBe(false);
  });
});

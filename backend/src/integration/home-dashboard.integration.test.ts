import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import type { Application } from "express";
import { getDefaultPermissionsForRole } from "../lib/permissions.js";

const skipEmbeddedDashboardPath = process.platform === "win32";

describe.skipIf(skipEmbeddedDashboardPath)("Home dashboard snapshot service (integration)", () => {
  let embedded: EmbeddedPostgres | null = null;
  let dbUrl = "";
  let app: Application | undefined;
  let closeDb: (() => Promise<void>) | undefined;
  let getHomeDashboardSnapshot: typeof import("../lib/homeDashboard.js").getHomeDashboardSnapshot;

  const password = "TestPassword123!";
  const email = `dashboard-${Date.now()}@example.com`;
  const now = new Date("2026-04-10T16:00:00.000Z");

  let token = "";
  let userId = "";
  let businessId = "";
  let clientId = "";
  let vehicleId = "";

  beforeAll(async () => {
    const port = Number(process.env.EMBEDDED_PG_PORT ?? 5436);
    const databaseDir = path.join(os.tmpdir(), `strata-dashboard-embedded-pg-${Date.now()}`);
    const embeddedDbName = `strata_dashboard_test_${Date.now()}`;

    embedded = new EmbeddedPostgres({
      databaseDir,
      user: "postgres",
      password: "postgres",
      port,
      persistent: false,
      onLog: () => {},
      onError: (error) => console.error("[embedded-postgres]", error),
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
    const homeDashboardMod = await import("../lib/homeDashboard.js");
    getHomeDashboardSnapshot = homeDashboardMod.getHomeDashboardSnapshot;

    const dashboardMod = await import("../lib/homeDashboard.js");
    getHomeDashboardSnapshot = dashboardMod.getHomeDashboardSnapshot;

    const signUpRes = await request(app).post("/api/auth/sign-up").send({
      email,
      password,
      firstName: "Dashboard",
      lastName: "Owner",
    });
    expect(signUpRes.status).toBe(201);
    token = signUpRes.body.data.token;
    userId = signUpRes.body.data.id;

    const businessRes = await request(app).post("/api/businesses").set("Authorization", `Bearer ${token}`).send({
      name: "Dashboard Test Business",
      type: "auto_detailing",
      staffCount: 2,
      operatingHours: "Mon-Fri 09:00-17:00",
      monthlyRevenueGoal: 15000,
      monthlyJobsGoal: 24,
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

  async function createAppointment(options?: { start: Date; end: Date; depositAmount?: number; totalPrice?: number }) {
    if (!app) throw new Error("Backend app failed to load.");
    const appointmentRes = await request(app)
      .post("/api/appointments")
      .set("Authorization", `Bearer ${token}`)
      .send({
        clientId,
        vehicleId,
        startTime: options?.start.toISOString(),
        endTime: options?.end.toISOString(),
        title: "5-Year Ceramic Coating",
        depositAmount: options?.depositAmount ?? 0,
      });

    expect(appointmentRes.status).toBe(201);

    const appointmentId = appointmentRes.body.id as string;
    const updateRes = await request(app)
      .patch(`/api/appointments/${encodeURIComponent(appointmentId)}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        totalPrice: options?.totalPrice ?? 715.85,
      });

    expect(updateRes.status).toBe(200);
    return appointmentId;
  }

  async function createWorkspaceContext(label: string) {
    if (!app) throw new Error("Backend app failed to load.");

    const workspaceEmail = `${label}-${Date.now()}@example.com`;
    const signUpRes = await request(app).post("/api/auth/sign-up").send({
      email: workspaceEmail,
      password,
      firstName: "Revenue",
      lastName: "Owner",
    });
    expect(signUpRes.status).toBe(201);

    const workspaceToken = signUpRes.body.data.token as string;
    const workspaceUserId = signUpRes.body.data.id as string;

    const businessRes = await request(app).post("/api/businesses").set("Authorization", `Bearer ${workspaceToken}`).send({
      name: `${label} Business`,
      type: "auto_detailing",
      staffCount: 1,
      operatingHours: "Mon-Fri 09:00-17:00",
      monthlyRevenueGoal: 5000,
      monthlyJobsGoal: 8,
    });
    expect(businessRes.status).toBe(201);
    const workspaceBusinessId = businessRes.body.id as string;

    const onboardingRes = await request(app)
      .post(`/api/businesses/${encodeURIComponent(workspaceBusinessId)}/completeOnboarding`)
      .set("Authorization", `Bearer ${workspaceToken}`)
      .send({});
    expect(onboardingRes.status).toBe(200);

    const clientRes = await request(app).post("/api/clients").set("Authorization", `Bearer ${workspaceToken}`).send({
      firstName: "Trial",
      lastName: "Client",
      email: `client-${label}-${Date.now()}@example.com`,
    });
    expect(clientRes.status).toBe(201);
    const workspaceClientId = clientRes.body.id as string;

    const vehicleRes = await request(app).post("/api/vehicles").set("Authorization", `Bearer ${workspaceToken}`).send({
      clientId: workspaceClientId,
      year: 2023,
      make: "Porsche",
      model: "Macan",
    });
    expect(vehicleRes.status).toBe(201);

    return {
      token: workspaceToken,
      userId: workspaceUserId,
      businessId: workspaceBusinessId,
      clientId: workspaceClientId,
      vehicleId: vehicleRes.body.id as string,
    };
  }

  it("returns an empty but usable owner snapshot for a fresh business", async () => {
    const snapshot = await getHomeDashboardSnapshot({
      businessId,
      userId,
      membershipRole: "owner",
      permissions: Array.from(getDefaultPermissionsForRole("owner")),
      range: "today",
      now,
    });

    expect(snapshot.featureFlags.homeDashboardV2).toBe(true);
    expect(snapshot.todaySchedule.allowed).toBe(true);
    expect(snapshot.todaySchedule.items).toHaveLength(0);
    expect(snapshot.actionQueue.allowed).toBe(true);
    expect(snapshot.summaryCards.today.jobs).toBe(0);
    expect(snapshot.quickActions.map((action) => action.key)).toEqual(
      expect.arrayContaining(["new_appointment", "new_quote", "new_invoice", "collect_payment"])
    );
  });

  it("surfaces deposit due items and finance totals from real upcoming appointments", async () => {
    const start = new Date("2026-04-11T17:00:00.000Z");
    const end = new Date("2026-04-11T20:00:00.000Z");
    await createAppointment({ start, end, depositAmount: 200, totalPrice: 715.85 });

    const snapshot = await getHomeDashboardSnapshot({
      businessId,
      userId,
      membershipRole: "owner",
      permissions: Array.from(getDefaultPermissionsForRole("owner")),
      range: "week",
      now,
      skipCache: true,
    });

    expect(snapshot.actionQueue.items.some((item) => item.type === "deposit_due")).toBe(true);
    expect(snapshot.summaryCards.needsAction.breakdown.deposit_due).toBeGreaterThanOrEqual(1);
    expect(snapshot.revenueCollections.depositsDueCount).toBeGreaterThanOrEqual(1);
    expect(snapshot.revenueCollections.depositsDueAmount).toBeGreaterThan(0);
    expect(snapshot.todaySchedule.items.some((item) => item.financeBadges.some((badge) => badge.key === "deposit_due"))).toBe(true);
  });

  it("gates finance-heavy widgets and CTAs when permissions are limited", async () => {
    const limitedPermissions = Array.from(getDefaultPermissionsForRole("technician")).filter(
      (permission) => permission !== "invoices.read" && permission !== "payments.read" && permission !== "settings.read"
    );

    const snapshot = await getHomeDashboardSnapshot({
      businessId,
      userId,
      membershipRole: "technician",
      permissions: limitedPermissions,
      range: "today",
      now,
      skipCache: true,
    });

    expect(snapshot.summaryCards.cash.allowed).toBe(false);
    expect(snapshot.revenueCollections.allowed).toBe(false);
    expect(snapshot.automations.allowed).toBe(false);
    expect(snapshot.goals.allowed).toBe(false);
    expect(snapshot.modulePermissions.teamVisibility).toBe(false);
    expect(snapshot.quickActions.map((action) => action.key)).toEqual(
      expect.arrayContaining(["search_appointments", "search_leads"])
    );
    expect(
      snapshot.quickActions.some((action) =>
        ["new_appointment", "new_quote", "new_invoice", "collect_payment"].includes(action.key)
      )
    ).toBe(false);
  });

  it("shows honest monthly revenue for a partial-deposit appointment without an invoice", async () => {
    const workspace = await createWorkspaceContext("dashboard-monthly-revenue");

    const appointmentRes = await request(app!)
      .post("/api/appointments")
      .set("Authorization", `Bearer ${workspace.token}`)
      .send({
        clientId: workspace.clientId,
        vehicleId: workspace.vehicleId,
        startTime: "2026-04-12T17:00:00.000Z",
        endTime: "2026-04-12T19:00:00.000Z",
        title: "Full Detail",
        depositAmount: 20,
      });
    expect(appointmentRes.status).toBe(201);

    const appointmentId = appointmentRes.body.id as string;

    const updateRes = await request(app!)
      .patch(`/api/appointments/${encodeURIComponent(appointmentId)}`)
      .set("Authorization", `Bearer ${workspace.token}`)
      .send({ totalPrice: 175 });
    expect(updateRes.status).toBe(200);

    const depositRes = await request(app!)
      .post(`/api/appointments/${encodeURIComponent(appointmentId)}/recordDepositPayment`)
      .set("Authorization", `Bearer ${workspace.token}`)
      .send({
        amount: 20,
        method: "cash",
        paidAt: "2026-04-12T19:00:00.000Z",
      });
    expect(depositRes.status).toBe(200);

    const snapshot = await getHomeDashboardSnapshot({
      businessId: workspace.businessId,
      userId: workspace.userId,
      membershipRole: "owner",
      permissions: Array.from(getDefaultPermissionsForRole("owner")),
      range: "month",
      now,
      skipCache: true,
    });

    expect(snapshot.monthlyRevenueChart.totalBookedThisMonth).toBe(175);
    expect(snapshot.monthlyRevenueChart.totalCollectedThisMonth).toBe(20);
    expect(snapshot.monthlyRevenueChart.netThisMonth).toBe(20);
    expect(snapshot.monthlyRevenueChart.outstandingInvoiceAmount).toBe(155);
  });
});

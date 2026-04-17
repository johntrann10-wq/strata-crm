import type { Express } from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";

let app: Express;

beforeAll(async () => {
  process.env.RATE_LIMIT_STORE = "memory";
  process.env.RATE_LIMIT_AUTH_SIGN_IN_MAX = "2";
  process.env.RATE_LIMIT_PUBLIC_LEAD_SUBMIT_MAX = "2";
  process.env.RATE_LIMIT_PUBLIC_BOOKING_DRAFT_MAX = "2";
  process.env.RATE_LIMIT_PUBLIC_BOOKING_SUBMIT_MAX = "2";
  process.env.RATE_LIMIT_PUBLIC_BOOKING_REQUEST_VIEW_MAX = "2";
  process.env.RATE_LIMIT_PUBLIC_BOOKING_REQUEST_RESPOND_MAX = "2";
  process.env.RATE_LIMIT_BILLING_PORTAL_MAX = "1";
  process.env.RATE_LIMIT_BILLING_CHECKOUT_SESSION_MAX = "1";

  vi.resetModules();
  ({ app } = await import("../app.js"));
});

afterAll(() => {
  delete process.env.RATE_LIMIT_STORE;
  delete process.env.RATE_LIMIT_AUTH_SIGN_IN_MAX;
  delete process.env.RATE_LIMIT_PUBLIC_LEAD_SUBMIT_MAX;
  delete process.env.RATE_LIMIT_PUBLIC_BOOKING_DRAFT_MAX;
  delete process.env.RATE_LIMIT_PUBLIC_BOOKING_SUBMIT_MAX;
  delete process.env.RATE_LIMIT_PUBLIC_BOOKING_REQUEST_VIEW_MAX;
  delete process.env.RATE_LIMIT_PUBLIC_BOOKING_REQUEST_RESPOND_MAX;
  delete process.env.RATE_LIMIT_BILLING_PORTAL_MAX;
  delete process.env.RATE_LIMIT_BILLING_CHECKOUT_SESSION_MAX;
});

describe("rate limiting integration", () => {
  it("throttles repeated sign-in attempts with a clean user-facing error", async () => {
    const agent = request.agent(app);

    const first = await agent.post("/api/auth/sign-in").send({});
    const second = await agent.post("/api/auth/sign-in").send({});
    const third = await agent.post("/api/auth/sign-in").send({});

    expect(first.status).toBe(400);
    expect(second.status).toBe(400);
    expect(third.status).toBe(429);
    expect(third.body).toMatchObject({
      code: "RATE_LIMITED",
      message: expect.stringMatching(/sign-in attempts/i),
      retryAfterSeconds: expect.any(Number),
    });
  });

  it("throttles the public lead form route", async () => {
    const agent = request.agent(app);

    const first = await agent.post("/api/businesses/not-a-uuid/public-leads").send({});
    const second = await agent.post("/api/businesses/not-a-uuid/public-leads").send({});
    const third = await agent.post("/api/businesses/not-a-uuid/public-leads").send({});

    expect(first.status).toBe(400);
    expect(second.status).toBe(400);
    expect(third.status).toBe(429);
    expect(third.body).toMatchObject({
      code: "RATE_LIMITED",
      message: expect.stringMatching(/lead submissions/i),
      retryAfterSeconds: expect.any(Number),
    });
  });

  it("throttles repeated public booking submission attempts with a clean error", async () => {
    const agent = request.agent(app);

    const first = await agent.post("/api/businesses/not-a-uuid/public-bookings").send({});
    const second = await agent.post("/api/businesses/not-a-uuid/public-bookings").send({});
    const third = await agent.post("/api/businesses/not-a-uuid/public-bookings").send({});

    expect(first.status).toBe(400);
    expect(second.status).toBe(400);
    expect(third.status).toBe(429);
    expect(third.body).toMatchObject({
      code: "RATE_LIMITED",
      message: expect.stringMatching(/booking attempts/i),
      retryAfterSeconds: expect.any(Number),
    });
  });

  it("throttles repeated public booking draft autosave attempts with a clean error", async () => {
    const agent = request.agent(app);

    const first = await agent.post("/api/businesses/not-a-uuid/public-booking-drafts").send({});
    const second = await agent.post("/api/businesses/not-a-uuid/public-booking-drafts").send({});
    const third = await agent.post("/api/businesses/not-a-uuid/public-booking-drafts").send({});

    expect(first.status).toBe(400);
    expect(second.status).toBe(400);
    expect(third.status).toBe(429);
    expect(third.body).toMatchObject({
      code: "RATE_LIMITED",
      message: expect.stringMatching(/saving again/i),
      retryAfterSeconds: expect.any(Number),
    });
  });

  it("throttles repeated public booking-request view attempts with a clean error", async () => {
    const agent = request.agent(app);

    const first = await agent.get("/api/businesses/not-a-uuid/public-booking-requests/not-a-uuid?token=bad");
    const second = await agent.get("/api/businesses/not-a-uuid/public-booking-requests/not-a-uuid?token=bad");
    const third = await agent.get("/api/businesses/not-a-uuid/public-booking-requests/not-a-uuid?token=bad");

    expect(first.status).toBe(400);
    expect(second.status).toBe(400);
    expect(third.status).toBe(429);
    expect(third.body).toMatchObject({
      code: "RATE_LIMITED",
      message: expect.stringMatching(/refresh the request/i),
      retryAfterSeconds: expect.any(Number),
    });
  });

  it("throttles repeated public booking-request response attempts with a clean error", async () => {
    const agent = request.agent(app);

    const first = await agent.post("/api/businesses/not-a-uuid/public-booking-requests/not-a-uuid/respond?token=bad").send({});
    const second = await agent.post("/api/businesses/not-a-uuid/public-booking-requests/not-a-uuid/respond?token=bad").send({});
    const third = await agent.post("/api/businesses/not-a-uuid/public-booking-requests/not-a-uuid/respond?token=bad").send({});

    expect(first.status).toBe(400);
    expect(second.status).toBe(400);
    expect(third.status).toBe(429);
    expect(third.body).toMatchObject({
      code: "RATE_LIMITED",
      message: expect.stringMatching(/responding again/i),
      retryAfterSeconds: expect.any(Number),
    });
  });

  it("throttles repeated billing portal session creation attempts", async () => {
    const agent = request.agent(app);

    const first = await agent.post("/api/billing/portal").send({});
    const second = await agent.post("/api/billing/portal").send({});

    expect(first.status).toBe(401);
    expect(second.status).toBe(429);
    expect(second.body).toMatchObject({
      code: "RATE_LIMITED",
      message: expect.stringMatching(/billing portal/i),
      retryAfterSeconds: expect.any(Number),
    });
  });

  it("throttles repeated billing checkout session creation attempts", async () => {
    const agent = request.agent(app);

    const first = await agent.post("/api/billing/create-checkout-session").send({});
    const second = await agent.post("/api/billing/create-checkout-session").send({});

    expect(first.status).toBe(401);
    expect(second.status).toBe(429);
    expect(second.body).toMatchObject({
      code: "RATE_LIMITED",
      message: expect.stringMatching(/billing checkout/i),
      retryAfterSeconds: expect.any(Number),
    });
  });
});

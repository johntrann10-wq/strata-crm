import bcrypt from "bcryptjs";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createPasswordResetToken } from "../lib/jwt.js";

type MockAuthUser = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  passwordHash: string | null;
  googleProfileId: string | null;
  authTokenVersion: number | null;
  emailVerified: boolean | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

const selectResultQueue: MockAuthUser[][] = [];
const updateCalls: Array<Record<string, unknown>> = [];
const sendTemplatedEmail = vi.fn();

vi.mock("../db/index.js", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => selectResultQueue.shift() ?? [],
        }),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          updateCalls.push(values);
          return [];
        },
      }),
    }),
    execute: async () => ({ rows: [] }),
  },
}));

vi.mock("../lib/email.js", async () => {
  const actual = await vi.importActual<typeof import("../lib/email.js")>("../lib/email.js");
  return {
    ...actual,
    sendTemplatedEmail,
  };
});

let app: typeof import("../app.js").app;

beforeAll(async () => {
  ({ app } = await import("../app.js"));
});

beforeEach(() => {
  selectResultQueue.length = 0;
  updateCalls.length = 0;
  sendTemplatedEmail.mockReset();
});

function queueUserLookup(user: Partial<MockAuthUser> | null) {
  if (!user) {
    selectResultQueue.push([]);
    return;
  }

  selectResultQueue.push([
    {
      id: "user-test",
      email: "owner@example.com",
      firstName: "Jamie",
      lastName: "Tester",
      passwordHash: null,
      googleProfileId: null,
      authTokenVersion: 1,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...user,
    },
  ]);
}

describe("password recovery integration", () => {
  it("returns the generic forgot-password success response for unknown accounts", async () => {
    queueUserLookup(null);

    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "missing@example.com" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      message: "If an account exists for that email, a password reset link has been sent.",
    });
    expect(sendTemplatedEmail).not.toHaveBeenCalled();
  });

  it("uses the configured frontend origin instead of the request host for password reset links", async () => {
    queueUserLookup({
      id: "user-owner",
      email: "owner@example.com",
      firstName: "Owner",
    });
    const previousFrontendUrl = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = "https://app.strata.test";

    try {
      const res = await request(app)
        .post("/api/auth/forgot-password")
        .set("Host", "evil.example")
        .send({ email: "owner@example.com" });

      expect(res.status).toBe(200);
      expect(sendTemplatedEmail).toHaveBeenCalledTimes(1);
      expect(sendTemplatedEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "owner@example.com",
          templateSlug: "password_reset",
          vars: expect.objectContaining({
            resetUrl: expect.stringMatching(/^https:\/\/app\.strata\.test\/reset-password\?token=/),
          }),
        })
      );
      expect(sendTemplatedEmail.mock.calls[0]?.[0]?.vars?.resetUrl).not.toContain("evil.example");
    } finally {
      if (previousFrontendUrl === undefined) {
        delete process.env.FRONTEND_URL;
      } else {
        process.env.FRONTEND_URL = previousFrontendUrl;
      }
    }
  });

  it("resets the password, rotates auth token version, and clears the session cookie", async () => {
    const currentPasswordHash = await bcrypt.hash("CurrentPass123!", 10);
    queueUserLookup({
      id: "user-reset",
      email: "reset@example.com",
      passwordHash: currentPasswordHash,
      authTokenVersion: 1,
    });

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({
        token: createPasswordResetToken("user-reset", "reset@example.com"),
        password: "FreshPass456!",
      });

    const setCookieHeader = res.headers["set-cookie"];
    const cookieHeaderValue = Array.isArray(setCookieHeader) ? setCookieHeader.join(";") : String(setCookieHeader ?? "");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(cookieHeaderValue).toMatch(/strata_auth=;/i);
    expect(cookieHeaderValue).toMatch(/expires=thu, 01 jan 1970/i);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]?.authTokenVersion).toBe(2);
    expect(updateCalls[0]?.passwordHash).toBeTypeOf("string");
    expect(updateCalls[0]?.passwordHash).not.toBe(currentPasswordHash);
    expect(await bcrypt.compare("FreshPass456!", String(updateCalls[0]?.passwordHash))).toBe(true);
  });

  it("rejects invalid reset tokens cleanly", async () => {
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({
        token: "not-a-real-token",
        password: "FreshPass456!",
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid or has expired/i);
  });
});

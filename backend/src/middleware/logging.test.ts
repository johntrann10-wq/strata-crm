import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { NextFunction, Request, Response } from "express";

const mocks = vi.hoisted(() => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../lib/logger.js", () => ({
  logger: mocks.logger,
}));

import { requestLogging } from "./logging.js";

function createResponse(statusCode: number) {
  let finishHandler: (() => void) | null = null;
  const response = {
    statusCode,
    on: vi.fn((event: string, handler: () => void) => {
      if (event === "finish") finishHandler = handler;
      return response;
    }),
  } as unknown as Response;

  return {
    response,
    finish() {
      finishHandler?.();
    },
  };
}

const originalNow = Date.now;

beforeEach(() => {
  let tick = 0;
  Date.now = vi.fn(() => ++tick * 5);
});

afterEach(() => {
  Date.now = originalNow;
  vi.clearAllMocks();
});

describe("requestLogging", () => {
  it("emits a launch warning for public document client errors", () => {
    const { response, finish } = createResponse(404);
    const req = {
      method: "GET",
      path: "/api/invoices/invoice-1/public-html",
      requestId: "req-public-1",
      userId: undefined,
      businessId: undefined,
    } as unknown as Request;
    const next = vi.fn() as unknown as NextFunction;

    requestLogging(req, response, next);
    finish();

    expect(mocks.logger.info).toHaveBeenCalledWith(
      "request",
      expect.objectContaining({ path: "/api/invoices/invoice-1/public-html", status: 404 })
    );
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      "Launch monitor: public document client error",
      expect.objectContaining({ requestId: "req-public-1", path: "/api/invoices/invoice-1/public-html", status: 404 })
    );
  });

  it("emits a launch warning for protected CRUD denials", () => {
    const { response, finish } = createResponse(403);
    const req = {
      method: "DELETE",
      path: "/api/clients/client-1",
      requestId: "req-crud-1",
      userId: "user-1",
      businessId: "biz-1",
    } as unknown as Request;
    const next = vi.fn() as unknown as NextFunction;

    requestLogging(req, response, next);
    finish();

    expect(mocks.logger.warn).toHaveBeenCalledWith(
      "Launch monitor: protected CRUD denied",
      expect.objectContaining({ requestId: "req-crud-1", path: "/api/clients/client-1", status: 403, userId: "user-1", businessId: "biz-1" })
    );
  });

  it("does not emit extra launch warnings for ordinary successful requests", () => {
    const { response, finish } = createResponse(200);
    const req = {
      method: "GET",
      path: "/api/appointments",
      requestId: "req-ok-1",
      userId: "user-1",
      businessId: "biz-1",
    } as unknown as Request;
    const next = vi.fn() as unknown as NextFunction;

    requestLogging(req, response, next);
    finish();

    expect(mocks.logger.info).toHaveBeenCalledTimes(1);
    expect(mocks.logger.warn).not.toHaveBeenCalled();
  });
});

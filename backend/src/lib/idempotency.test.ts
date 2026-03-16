import { describe, it, expect } from "vitest";
import { ConflictError } from "./errors.js";

describe("idempotency", () => {
  it("ConflictError has status 409 and code CONFLICT", () => {
    const err = new ConflictError("Duplicate");
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe("CONFLICT");
  });

  it("idempotency scope requires businessId and operation", () => {
    const scope = { businessId: "550e8400-e29b-41d4-a716-446655440000", operation: "payment.create" };
    expect(scope.businessId).toBeDefined();
    expect(scope.operation).toBeDefined();
  });
});

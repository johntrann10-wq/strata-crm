import { describe, it, expect } from "vitest";
import { AppError, UnauthorizedError, NotFoundError, toApiError } from "./errors.js";

describe("errors", () => {
  it("AppError has statusCode and code", () => {
    const err = new AppError("test", 400, "BAD_REQUEST");
    expect(err.message).toBe("test");
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("BAD_REQUEST");
  });

  it("UnauthorizedError defaults to 401", () => {
    const err = new UnauthorizedError();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe("UNAUTHORIZED");
  });

  it("NotFoundError defaults to 404", () => {
    const err = new NotFoundError("Missing");
    expect(err.message).toBe("Missing");
    expect(err.statusCode).toBe(404);
  });

  it("toApiError returns message and code for AppError", () => {
    const err = new AppError("custom", 409, "CONFLICT");
    expect(toApiError(err)).toEqual({ message: "custom", code: "CONFLICT" });
  });

  it("toApiError returns message for generic Error", () => {
    expect(toApiError(new Error("foo"))).toMatchObject({ message: "foo" });
  });
});

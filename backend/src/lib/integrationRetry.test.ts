import { describe, expect, it } from "vitest";
import { getIntegrationNextRunAt, getIntegrationRetryDelayMs } from "./integrationRetry.js";

describe("integrationRetry", () => {
  it("backs off exponentially and caps the delay", () => {
    expect(getIntegrationRetryDelayMs(0)).toBe(60_000);
    expect(getIntegrationRetryDelayMs(1)).toBe(120_000);
    expect(getIntegrationRetryDelayMs(5)).toBe(1_920_000);
    expect(getIntegrationRetryDelayMs(20)).toBe(3_600_000);
  });

  it("calculates the next run time from the retry delay", () => {
    const now = new Date("2026-04-04T12:00:00.000Z");
    expect(getIntegrationNextRunAt(2, now).toISOString()).toBe("2026-04-04T12:04:00.000Z");
  });
});

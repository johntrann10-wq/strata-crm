import { describe, it, expect, vi, beforeEach } from "vitest";
import { hasAppointmentOverlap } from "./appointmentOverlap.js";

const mockLimit = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock("../db/index.js", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: (n: number) => mockLimit(n),
        }),
      }),
    }),
  },
}));

describe("hasAppointmentOverlap", () => {
  beforeEach(() => {
    mockLimit.mockClear();
    mockLimit.mockResolvedValue([]);
  });

  it("returns false when no overlapping appointments exist", async () => {
    mockLimit.mockResolvedValue([]);
    const result = await hasAppointmentOverlap({
      businessId: "b1",
      startTime: new Date("2025-03-20T10:00:00Z"),
      endTime: new Date("2025-03-20T11:00:00Z"),
    });
    expect(result).toBe(false);
  });

  it("returns true when an overlapping appointment exists", async () => {
    mockLimit.mockResolvedValue([{ id: "apt-1" }]);
    const result = await hasAppointmentOverlap({
      businessId: "b1",
      startTime: new Date("2025-03-20T10:00:00Z"),
      endTime: new Date("2025-03-20T11:00:00Z"),
      assignedStaffId: "staff-1",
    });
    expect(result).toBe(true);
  });
});

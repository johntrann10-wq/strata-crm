import { describe, expect, it } from "vitest";

describe("portal add-on request state", () => {
  it("marks pending add-on requests as requested", async () => {
    const { buildPortalAddonRequestStatusMap } = await import("./portal.js");
    const statuses = buildPortalAddonRequestStatusMap([
      {
        appointmentId: "appointment-1",
        action: "appointment.public_addon_requested",
        metadata: JSON.stringify({ addonServiceId: "addon-1" }),
      },
    ]);

    expect(statuses.get("appointment-1")?.get("addon-1")).toBe("requested");
  });

  it("marks approved and declined add-on requests as resolved", async () => {
    const { buildPortalAddonRequestStatusMap } = await import("./portal.js");
    const statuses = buildPortalAddonRequestStatusMap([
      {
        appointmentId: "appointment-1",
        action: "appointment.public_addon_approved",
        metadata: JSON.stringify({ addonServiceId: "addon-1" }),
      },
      {
        appointmentId: "appointment-1",
        action: "appointment.public_addon_declined",
        metadata: JSON.stringify({ addonServiceId: "addon-2" }),
      },
    ]);

    expect(statuses.get("appointment-1")?.get("addon-1")).toBe("resolved");
    expect(statuses.get("appointment-1")?.get("addon-2")).toBe("resolved");
  });

  it("lets the latest activity row win for a request", async () => {
    const { buildPortalAddonRequestStatusMap } = await import("./portal.js");
    const statuses = buildPortalAddonRequestStatusMap([
      {
        appointmentId: "appointment-1",
        action: "appointment.public_addon_requested",
        metadata: JSON.stringify({ addonServiceId: "addon-1" }),
      },
      {
        appointmentId: "appointment-1",
        action: "appointment.public_addon_declined",
        metadata: JSON.stringify({ addonServiceId: "addon-1" }),
      },
    ]);

    expect(statuses.get("appointment-1")?.get("addon-1")).toBe("resolved");
  });

  it("ignores malformed add-on request activity metadata", async () => {
    const { buildPortalAddonRequestStatusMap } = await import("./portal.js");
    const statuses = buildPortalAddonRequestStatusMap([
      {
        appointmentId: "appointment-1",
        action: "appointment.public_addon_requested",
        metadata: "{bad-json",
      },
      {
        appointmentId: null,
        action: "appointment.public_addon_requested",
        metadata: JSON.stringify({ addonServiceId: "addon-1" }),
      },
    ]);

    expect(statuses.size).toBe(0);
  });
});

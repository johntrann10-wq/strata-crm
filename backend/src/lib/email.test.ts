import { describe, expect, it, vi } from "vitest";

vi.mock("../db/index.js", () => ({
  db: {},
}));

vi.mock("./logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { resolveFromAddressForTemplate } from "./email.js";

describe("resolveFromAddressForTemplate", () => {
  it("brands customer-facing emails with the business display name", () => {
    expect(
      resolveFromAddressForTemplate("Strata CRM <notifications@stratacrm.app>", "booking_request_received", {
        businessName: "North Star Detailing",
      })
    ).toBe("\"North Star Detailing\" <notifications@stratacrm.app>");
  });

  it("keeps internal templates on the configured platform sender", () => {
    expect(
      resolveFromAddressForTemplate("Strata CRM <notifications@stratacrm.app>", "team_invite", {
        businessName: "North Star Detailing",
      })
    ).toBe("Strata CRM <notifications@stratacrm.app>");
  });

  it("falls back to the configured sender identity when the business name is missing", () => {
    expect(
      resolveFromAddressForTemplate("Strata CRM <notifications@stratacrm.app>", "invoice_sent", {})
    ).toBe("\"Strata CRM\" <notifications@stratacrm.app>");
  });
});

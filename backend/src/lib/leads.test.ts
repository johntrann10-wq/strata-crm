import { describe, expect, it } from "vitest";
import { buildLeadNotes, parseLeadRecord } from "./leads.js";

describe("lead note helpers", () => {
  it("round-trips structured lead notes safely", () => {
    const notes = buildLeadNotes({
      status: "new",
      source: "website",
      serviceInterest: "Ceramic coating",
      nextStep: "Contact within 2 hours",
      summary: "Customer wants protection package pricing.",
      vehicle: "2024 Tesla Model Y",
    });

    expect(parseLeadRecord(notes)).toEqual({
      status: "new",
      source: "website",
      serviceInterest: "Ceramic coating",
      nextStep: "Contact within 2 hours",
      summary: "Customer wants protection package pricing.",
      vehicle: "2024 Tesla Model Y",
      firstContactedAt: null,
      isLead: true,
    });
  });

  it("treats converted leads as no longer active leads", () => {
    const notes = buildLeadNotes({
      status: "converted",
      source: "referral",
    });

    expect(parseLeadRecord(notes).isLead).toBe(false);
  });

  it("preserves first contact timestamps when a lead has been answered", () => {
    const notes = buildLeadNotes({
      status: "contacted",
      source: "instagram",
      firstContactedAt: "2026-04-04T23:00:00.000Z",
    });

    expect(parseLeadRecord(notes).firstContactedAt).toBe("2026-04-04T23:00:00.000Z");
  });
});

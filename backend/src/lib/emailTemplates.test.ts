import { describe, expect, it } from "vitest";
import { EMAIL_TEMPLATE_SLUGS, getBuiltinTemplate } from "./emailTemplates.js";

describe("builtin email templates", () => {
  it("provide a subject and html body for each transactional template", () => {
    for (const slug of EMAIL_TEMPLATE_SLUGS) {
      const template = getBuiltinTemplate(slug);
      expect(template, `missing template for ${slug}`).toBeTruthy();
      expect(template?.subject?.trim().length).toBeGreaterThan(0);
      expect(template?.bodyHtml?.trim().length).toBeGreaterThan(0);
      expect(template?.bodyText?.trim().length).toBeGreaterThan(0);
    }
  });

  it("do not include mojibake punctuation in subjects or bodies", () => {
    for (const slug of EMAIL_TEMPLATE_SLUGS) {
      const template = getBuiltinTemplate(slug);
      expect(template?.subject).not.toContain("Ã¢");
      expect(template?.bodyHtml).not.toContain("Ã¢");
    }
  });

  it("includes dedicated request-booking confirmation templates", () => {
    expect(getBuiltinTemplate("booking_request_received")?.bodyText).toContain("What happens next");
    expect(getBuiltinTemplate("booking_request_owner_update")?.bodyText).toContain("Confirmed timing");
  });

  it("keeps client-facing quote email HTML free of raw customer hub links", () => {
    expect(getBuiltinTemplate("quote_sent")?.bodyHtml).not.toContain("{{portalUrl}}");
    expect(getBuiltinTemplate("quote_follow_up")?.bodyHtml).not.toContain("{{portalUrl}}");
  });
});

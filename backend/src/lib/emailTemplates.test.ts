import { describe, expect, it } from "vitest";
import { EMAIL_TEMPLATE_SLUGS, getBuiltinTemplate } from "./emailTemplates.js";

describe("builtin email templates", () => {
  it("provide a subject and html body for each transactional template", () => {
    for (const slug of EMAIL_TEMPLATE_SLUGS) {
      const template = getBuiltinTemplate(slug);
      expect(template, `missing template for ${slug}`).toBeTruthy();
      expect(template?.subject?.trim().length).toBeGreaterThan(0);
      expect(template?.bodyHtml?.trim().length).toBeGreaterThan(0);
    }
  });

  it("do not include mojibake punctuation in subjects or bodies", () => {
    for (const slug of EMAIL_TEMPLATE_SLUGS) {
      const template = getBuiltinTemplate(slug);
      expect(template?.subject).not.toContain("â");
      expect(template?.bodyHtml).not.toContain("â");
    }
  });
});

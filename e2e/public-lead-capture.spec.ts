import { expect, test } from "@playwright/test";

test("public lead capture form loads and submits successfully", async ({ page }) => {
  await page.route("**/api/businesses/biz-public/public-lead-config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        businessId: "biz-public",
        businessName: "North Star Detail",
        businessType: "auto_detailing",
        timezone: "America/Los_Angeles",
        leadCaptureEnabled: true,
      }),
    });
  });

  let postedPayload: Record<string, unknown> | null = null;
  await page.route("**/api/businesses/biz-public/public-leads", async (route) => {
    postedPayload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        accepted: true,
        leadId: "lead-123",
        autoResponseConfigured: true,
      }),
    });
  });

  await page.goto("/lead/biz-public?utm_source=instagram&utm_campaign=spring-detail");

  await expect(page.getByRole("heading", { name: /reach north star detail fast/i })).toBeVisible();
  await page.getByLabel("First name").fill("Jamie");
  await page.getByLabel("Last name").fill("Rivera");
  await page.getByLabel("Email").fill("jamie@example.com");
  await page.getByLabel("Phone").fill("(555) 111-2222");
  await page.getByLabel("Vehicle if known").fill("2022 BMW X5");
  await page.getByLabel("Service interest").fill("Paint correction");
  await page
    .getByLabel("What are you trying to get done?")
    .fill("Looking for correction and ceramic coating next week.");

  await page.getByRole("button", { name: "Send request" }).click();

  await expect(page.getByText("Request received")).toBeVisible();
  expect(postedPayload).toMatchObject({
    firstName: "Jamie",
    lastName: "Rivera",
    email: "jamie@example.com",
    phone: "(555) 111-2222",
    vehicle: "2022 BMW X5",
    serviceInterest: "Paint correction",
    source: "instagram",
    campaign: "spring-detail",
  });
});

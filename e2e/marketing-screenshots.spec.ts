import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { mockMarketingApp, signIn } from "./helpers/marketingSeed";

const outputDir = path.join(process.cwd(), "public", "marketing", "strata-ui");

async function freezeDate(page: import("@playwright/test").Page, isoTimestamp: string) {
  await page.addInitScript((timestamp) => {
    const fixed = new Date(timestamp);
    const OriginalDate = Date;
    class MockDate extends OriginalDate {
      constructor(...args: ConstructorParameters<typeof Date>) {
        if (args.length === 0) {
          return new OriginalDate(fixed);
        }
        return new OriginalDate(...args);
      }
      static now() {
        return fixed.getTime();
      }
    }
    // @ts-expect-error - override Date in browser context for deterministic screenshots
    window.Date = MockDate;
  }, isoTimestamp);
}

async function ensureOutputDir() {
  await mkdir(outputDir, { recursive: true });
}

async function captureScreenshot(
  page: import("@playwright/test").Page,
  name: string,
  clipHeight: number
) {
  await ensureOutputDir();
  const rawPath = path.join(outputDir, `${name}-raw.png`);
  const cropPath = path.join(outputDir, `${name}.png`);
  const viewport = page.viewportSize();

  if (!viewport) {
    throw new Error("Viewport size is not set.");
  }

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: rawPath });

  const height = Math.min(clipHeight, viewport.height);
  await page.screenshot({
    path: cropPath,
    clip: { x: 0, y: 0, width: viewport.width, height },
  });
}

test.describe("Marketing screenshots", () => {
  test("weekly-calendar-desktop", async ({ page }) => {
    await mockMarketingApp(page);
    await signIn(page);
    await page.setViewportSize({ width: 1440, height: 1024 });
    await freezeDate(page, "2026-04-08T10:00:00-07:00");
    await page.goto("/appointments");
    await expect(page.getByRole("heading", { name: "Schedule" }).first()).toBeVisible();
    await captureScreenshot(page, "weekly-calendar-desktop", 960);
  });

  test("appointment-details-mobile", async ({ page }) => {
    await mockMarketingApp(page);
    await signIn(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/appointments/appt-ceramic-1");
    await expect(page.getByText("Ceramic Coating").first()).toBeVisible();
    await captureScreenshot(page, "appointment-details-mobile", 780);
  });

  test("invoice-quote-desktop", async ({ page }) => {
    await mockMarketingApp(page);
    await signIn(page);
    await page.setViewportSize({ width: 1440, height: 1024 });
    await page.goto("/invoices/inv-2041");
    await expect(page.getByText("INV-2041")).toBeVisible();
    await captureScreenshot(page, "invoice-quote-desktop", 960);
  });

  test("payment-invoice-mobile", async ({ page }) => {
    await mockMarketingApp(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/portal/coastline-demo");
    await expect(page.getByText("Customer hub").first()).toBeVisible();
    await captureScreenshot(page, "payment-invoice-mobile", 780);
  });

  test("customer-crm-desktop", async ({ page }) => {
    await mockMarketingApp(page);
    await signIn(page);
    await page.setViewportSize({ width: 1440, height: 1024 });
    await page.goto("/clients");
    await expect(page.getByRole("link", { name: "Elena Torres" }).first()).toBeVisible();
    await captureScreenshot(page, "customer-crm-desktop", 960);
  });

  test("customer-detail-mobile", async ({ page }) => {
    await mockMarketingApp(page);
    await signIn(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/clients/client-elena");
    await expect(page.getByText("Elena Torres").first()).toBeVisible();
    await captureScreenshot(page, "customer-detail-mobile", 780);
  });

  test("team-access-desktop", async ({ page }) => {
    await mockMarketingApp(page);
    await signIn(page);
    await page.setViewportSize({ width: 1440, height: 1024 });
    await page.goto("/settings");
    const teamTab = page.getByRole("tab", { name: "Team" });
    await expect(teamTab).toBeVisible();
    await teamTab.click();
    await expect(page.getByText("Team & Roles", { exact: true })).toBeVisible();
    await captureScreenshot(page, "team-access-desktop", 960);
  });

  test("team-access-mobile", async ({ page }) => {
    await mockMarketingApp(page);
    await signIn(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/settings");
    const teamTab = page.getByRole("tab", { name: "Team" });
    await expect(teamTab).toBeVisible();
    await teamTab.click();
    await expect(page.getByText("Team & Roles", { exact: true })).toBeVisible();
    await captureScreenshot(page, "team-access-mobile", 780);
  });
});

import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { mockMarketingApp, signIn } from "./helpers/marketingSeed";

const outputDir = path.join(process.cwd(), "public", "marketing", "strata-ui");

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
  test("hero-desktop-calendar", async ({ page }) => {
    await mockMarketingApp(page);
    await signIn(page);
    await page.setViewportSize({ width: 1440, height: 1024 });
    await page.goto("/calendar?view=day&date=2026-04-08");
    await expect(page.getByText("Ceramic Coating").first()).toBeVisible();
    await captureScreenshot(page, "hero-desktop-calendar", 960);
  });

  test("hero-mobile-appointment", async ({ page }) => {
    await mockMarketingApp(page);
    await signIn(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/appointments/appt-ceramic-1");
    await expect(page.getByText("Ceramic Coating").first()).toBeVisible();
    await captureScreenshot(page, "hero-mobile-appointment", 780);
  });

  test("desktop-invoice-or-quote", async ({ page }) => {
    await mockMarketingApp(page);
    await signIn(page);
    await page.setViewportSize({ width: 1440, height: 1024 });
    await page.goto("/invoices/inv-2041");
    await expect(page.getByText("INV-2041")).toBeVisible();
    await captureScreenshot(page, "desktop-invoice-or-quote", 960);
  });

  test("mobile-payment-or-estimate", async ({ page }) => {
    await mockMarketingApp(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/portal/coastline-demo");
    await expect(page.getByText("Customer hub").first()).toBeVisible();
    await captureScreenshot(page, "mobile-payment-or-estimate", 780);
  });

  test("desktop-customers-or-bookings", async ({ page }) => {
    await mockMarketingApp(page);
    await signIn(page);
    await page.setViewportSize({ width: 1440, height: 1024 });
    await page.goto("/clients");
    await expect(page.getByRole("link", { name: "Elena Torres" }).first()).toBeVisible();
    await captureScreenshot(page, "desktop-customers-or-bookings", 960);
  });

  test("mobile-client-or-workflow", async ({ page }) => {
    await mockMarketingApp(page);
    await signIn(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/clients/client-elena");
    await expect(page.getByText("Elena Torres").first()).toBeVisible();
    await captureScreenshot(page, "mobile-client-or-workflow", 780);
  });
});

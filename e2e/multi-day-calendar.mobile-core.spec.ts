import { expect, test } from "@playwright/test";
import { mockMultiDayApp, signIn } from "./helpers/multiDayCalendar";

function monthIndex(label: string) {
  const parsed = new Date(`${label} 1`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Unable to parse calendar heading: ${label}`);
  }
  return parsed.getFullYear() * 12 + parsed.getMonth();
}

async function openCalendarAtMarch2026(page: import("@playwright/test").Page) {
  await page.goto("/calendar");
  await expect(page).toHaveURL(/\/calendar/);
  await expect(page.getByRole("button", { name: /^Week$|^Month$|^Day$/i }).first()).toBeVisible({ timeout: 60000 });
  const heading = page
    .locator("h1")
    .filter({ hasText: /\b20\d{2}\b/ })
    .first();
  const target = monthIndex("March 2026");
  for (let i = 0; i < 24; i += 1) {
    const currentLabel = (await heading.textContent())?.trim() ?? "";
    if (currentLabel.includes("March 2026")) break;
    const current = monthIndex(currentLabel);
    await page.getByRole("button", { name: current < target ? /next/i : /previous/i }).first().click();
  }
  await expect(heading).toContainText("March 2026");
}

test.describe("Multi-day job calendar QA - mobile", () => {
  test("mobile month stays stable and selected-day panels stay usable under dense multi-day data", async ({ page }) => {
    test.setTimeout(120000);
    await mockMultiDayApp(page);
    await signIn(page);
    await openCalendarAtMarch2026(page);
    await page.getByRole("button", { name: /^Month$/i }).click();

    const monthGrid = page.locator("div.surface-panel").first();
    const selectedPanel = page
      .locator("div.surface-panel")
      .filter({ has: page.getByText("Selected date", { exact: true }) })
      .first();

    await expect(monthGrid).toBeVisible();
    await expect(selectedPanel).toBeVisible();
    await expect(page.getByRole("button", { name: /Open Tuesday, March 31/i })).toBeVisible();
    await expect(page.getByText("Scheduling conflicts need review")).toBeVisible();

    const before = {
      grid: await monthGrid.boundingBox(),
      panel: await selectedPanel.boundingBox(),
    };

    await page.getByRole("button", { name: /Open Tuesday, March 31/i }).click();
    await expect(page.getByText("Selected date")).toBeVisible();
    await expect(page.getByRole("complementary").getByText("Interior Detail")).toBeVisible();

    const afterDense = {
      grid: await monthGrid.boundingBox(),
      panel: await selectedPanel.boundingBox(),
    };

    await page.getByRole("button", { name: /2/ }).first().click();
    const afterSparse = {
      grid: await monthGrid.boundingBox(),
      panel: await selectedPanel.boundingBox(),
    };

    expect(Math.abs((before.grid?.height ?? 0) - (afterDense.grid?.height ?? 0))).toBeLessThanOrEqual(2);
    expect(Math.abs((afterDense.grid?.height ?? 0) - (afterSparse.grid?.height ?? 0))).toBeLessThanOrEqual(2);
    expect(Math.abs((before.panel?.height ?? 0) - (afterDense.panel?.height ?? 0))).toBeLessThanOrEqual(2);
    expect(Math.abs((afterDense.panel?.height ?? 0) - (afterSparse.panel?.height ?? 0))).toBeLessThanOrEqual(2);

    const rowHeights = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("div.grid.min-h-0.grid-cols-7.border-b"))
        .map((node) => Math.round((node as HTMLElement).getBoundingClientRect().height))
        .filter((value) => value > 0);
    });
    expect(Math.max(...rowHeights) - Math.min(...rowHeights)).toBeLessThanOrEqual(2);
  });
});

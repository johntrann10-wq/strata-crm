import { expect, test } from "@playwright/test";
import { mockMultiDayApp, signIn } from "./helpers/multiDayCalendar";

function monthIndex(label: string) {
  const parsed = new Date(`${label} 1`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Unable to parse calendar heading: ${label}`);
  }
  return parsed.getFullYear() * 12 + parsed.getMonth();
}

function calendarHeading(page: import("@playwright/test").Page) {
  return page
    .locator("h1")
    .filter({ hasText: /\b20\d{2}\b/ })
    .first();
}

function calendarHeaderPanel(page: import("@playwright/test").Page) {
  return page.locator("div.surface-panel").first();
}

async function openCalendarAtMarch2026(page: import("@playwright/test").Page) {
  await page.goto("/calendar");
  await expect(page).toHaveURL(/\/calendar/);
  await expect(page.getByRole("button", { name: /^Week$|^Month$|^Day$/i }).first()).toBeVisible({ timeout: 60000 });
  const heading = calendarHeading(page);
  const target = monthIndex("March 2026");
  for (let i = 0; i < 24; i += 1) {
    const currentLabel = (await heading.textContent())?.trim() ?? "";
    if (currentLabel.includes("March 2026")) break;
    const current = monthIndex(currentLabel);
    await calendarHeaderPanel(page)
      .getByRole("button", { name: current < target ? /next/i : /previous/i })
      .click();
  }
  await expect(heading).toContainText("March 2026");
}

async function clickMonthView(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: /^Month$/i }).click();
}

async function clickWeekView(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: /^Week$/i }).click();
}

async function clickDayView(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: /^Day$/i }).click();
}

async function selectServiceFromSearch(page: import("@playwright/test").Page, serviceName: string) {
  const searchInput = page.getByPlaceholder("Search services, notes, or category...");
  await searchInput.fill(serviceName);
  const searchResult = page.getByRole("button", {
    name: new RegExp(serviceName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
  }).first();
  await expect(searchResult).toBeVisible();
  await searchResult.click();
  await expect(page.getByText(serviceName, { exact: true }).locator("..").first()).toBeVisible();
  await searchInput.clear();
}

test.describe("Multi-day job calendar QA - desktop", () => {
  test("month, week, day, and create/edit regressions stay usable under dense multi-day data", async ({ page }) => {
    test.setTimeout(240000);
    const state = await mockMultiDayApp(page);
    await signIn(page);
    await openCalendarAtMarch2026(page);

    await clickMonthView(page);
    await expect(page.getByText("Wrap Titan 5d").first()).toBeVisible();
    await expect(page.getByText("PPF Carrera 3d").first()).toBeVisible();
    await expect(page.getByText("Ceramic Atlas 2d").first()).toBeVisible();
    const selectedDatePanel = page
      .locator("div.surface-panel")
      .filter({ has: page.getByText("Selected date", { exact: true }) })
      .first();

    const rowHeights = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("div.grid.min-h-0.grid-cols-7.border-b"))
        .map((node) => Math.round((node as HTMLElement).getBoundingClientRect().height))
        .filter((value) => value > 0);
    });
    expect(Math.max(...rowHeights) - Math.min(...rowHeights)).toBeLessThanOrEqual(2);

    await page.getByRole("button", { name: /Open Tuesday, March 31/i }).click({ position: { x: 12, y: 12 } });
    await expect(page.getByText("Selected date")).toBeVisible();
    await expect(selectedDatePanel.getByRole("heading", { name: /Tuesday, March 31/i })).toBeVisible();
    await expect(selectedDatePanel.getByText("Interior Detail")).toBeVisible();
    await expect(selectedDatePanel.getByText("Window Tint Sedan")).toBeVisible();
    await expect(selectedDatePanel.getByRole("button", { name: /^PPF Carrera 3d$/ })).toBeVisible();
    await expect(selectedDatePanel.getByRole("button", { name: /10:00 AM PPF Carrera 3d/i })).toBeVisible();

    await calendarHeaderPanel(page).getByRole("button", { name: /Next/i }).click();
    await expect(calendarHeading(page)).toContainText("April 2026");
    await expect(page.getByText("Wrap Titan 5d").first()).toBeVisible();

    await calendarHeaderPanel(page).getByRole("button", { name: /Previous/i }).click();
    await clickWeekView(page);
    const weekSidebar = page.getByRole("complementary").last();
    await expect(page.getByText("On site")).toBeVisible();
    await expect(page.getByRole("button", { name: /Wrap Titan 5d Active work/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /PPF Carrera 3d Curing/i })).toBeVisible();
    await expect(weekSidebar.getByRole("button", { name: /9:00 AM Interior Detail scheduled/i })).toBeVisible();
    await expect(weekSidebar.getByRole("button", { name: /12:00 PM Window Tint Sedan confirmed/i })).toBeVisible();
    await weekSidebar.getByRole("button", { name: /^Tuesday, March 31$/i }).click();

    await clickDayView(page);
    await expect(page.getByText("Vehicles on site")).toBeVisible();
    await expect(page.getByText("Wrap Titan 5d").first()).toBeVisible();
    await expect(page.getByText("PPF Carrera 3d").first()).toBeVisible();
    await expect(page.getByText("Interior Detail").first()).toBeVisible();

    await page.goto("/appointments/new?clientId=client-1&vehicleId=veh-1&date=2026-03-31&time=09:00");
    await expect(page.getByRole("heading", { name: /New Appointment/i })).toBeVisible();
    await selectServiceFromSearch(page, "Color Change Wrap");
    await page.getByRole("button", { name: /Save Appointment|Save$/i }).first().click();
    await expect.poll(() => state.createPayloads.length).toBe(1);
    expect(state.createPayloads[0].vehicleOnSite).toBeUndefined();

    await page.goto("/appointments/new?clientId=client-2&vehicleId=veh-2&date=2026-03-31&time=10:00");
    await expect(page.getByRole("heading", { name: /New Appointment/i })).toBeVisible();
    await selectServiceFromSearch(page, "Full Front PPF");
    await page.getByText(/Multi-day \/ on-site job/i).click();
    await page.locator("#expected-completion-date").fill("2026-04-02");
    await page.locator("#expected-completion-time").fill("16:00");
    await page.getByRole("button", { name: /Save Appointment|Save$/i }).first().click();
    await expect.poll(() => state.createPayloads.length).toBe(2);
    expect(state.createPayloads[1].vehicleOnSite).toBe(true);
    expect(state.createPayloads[1].expectedCompletionTime).toBeTruthy();

    await page.goto("/appointments/apt-wrap-5d");
    await expect(page.getByText("Job lifecycle")).toBeVisible();
    await page.getByRole("button", { name: /^Edit$/i }).first().click();
    await page.locator("#edit-end-time").fill("14:00");
    await page.getByLabel(/Multi-day \/ on-site job/i).check();
    await page.locator("#edit-expected-completion-date").fill("2026-04-03");
    await page.locator("#edit-expected-completion-time").fill("18:00");
    await page.getByRole("button", { name: /Save Changes/i }).click();
    await expect.poll(() => state.updatePayloads.length).toBeGreaterThan(0);
    const lastUpdate = state.updatePayloads.at(-1) ?? {};
    expect(lastUpdate.endTime).toBeTruthy();
    expect(lastUpdate.expectedCompletionTime).toBeTruthy();
    expect(lastUpdate.vehicleOnSite).toBe(true);
  });
});

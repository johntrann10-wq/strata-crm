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

async function chooseTime(page: import("@playwright/test").Page, id: string, label: string) {
  await page.locator(`#${id}`).click();
  await page.getByRole("option", { name: new RegExp(`^${label}$`, "i") }).click();
}

async function chooseDate(page: import("@playwright/test").Page, id: string, dayLabel: string | RegExp) {
  await page.locator(`#${id}`).click();
  const calendar = page.locator("[role='dialog']").last();
  await calendar.getByRole("button", { name: dayLabel, exact: typeof dayLabel === "string" }).click();
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
  test("month, day, and create/edit regressions stay usable under dense multi-day data", async ({ page }) => {
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
    await expect(selectedDatePanel.getByText("PPF Carrera 3d")).toBeVisible();
    await expect(selectedDatePanel.getByText(/10:00 AM/i)).toBeVisible();

    await calendarHeaderPanel(page).getByRole("button", { name: /Next/i }).click();
    await expect(calendarHeading(page)).toContainText("April 2026");
    await expect(page.getByText("Wrap Titan 5d").first()).toBeVisible();

    await calendarHeaderPanel(page).getByRole("button", { name: /Previous/i }).click();
    await page.getByRole("button", { name: /Open Tuesday, March 31/i }).click({ position: { x: 12, y: 12 } });
    await clickDayView(page);
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
    await chooseTime(page, "expected-completion-time", "4:00 PM");
    await page.getByRole("button", { name: /Save Appointment|Save$/i }).first().click();
    await expect.poll(() => state.createPayloads.length).toBe(2);
    expect(state.createPayloads[1].vehicleOnSite).toBe(true);
    expect(state.createPayloads[1].expectedCompletionTime).toBeTruthy();

    await page.goto("/appointments/apt-wrap-5d");
    await expect(page.getByText("Job lifecycle")).toBeVisible();
    await page.getByRole("button", { name: /Reschedule/i }).first().click();
    await expect(page.getByRole("heading", { name: /Edit Appointment/i })).toBeVisible();
    await chooseTime(page, "edit-end-time", "2:00 PM");
    await page.getByLabel(/Multi-day \/ on-site job/i).check();
    await chooseTime(page, "edit-expected-completion-time", "6:00 PM");
    await page.getByRole("button", { name: /Save Changes/i }).click();
    await expect.poll(() => state.updatePayloads.length).toBeGreaterThan(0);
    const lastUpdate = state.updatePayloads.at(-1) ?? {};
    expect(lastUpdate.endTime).toBeTruthy();
    expect(lastUpdate.expectedCompletionTime).toBeTruthy();
    expect(lastUpdate.vehicleOnSite).toBe(true);
  });
});

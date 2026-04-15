import { expect, test } from "@playwright/test";
import { mockBillingFlowApp, signIn as signInBilling } from "./helpers/billingFlow";
import { mockClientVehicleApp, signIn as signInClientVehicle } from "./helpers/clientVehicleFlow";

test.describe.configure({ mode: "serial" });

test.describe("Delete and archive regression", () => {
  test("client archive removes the record from active lists", async ({ page }) => {
    test.setTimeout(120000);

    const state = await mockClientVehicleApp(page);
    await signInClientVehicle(page);

    await page.goto("/clients/client-1?from=%2Fclients");
    await expect(page.getByRole("main")).toContainText(/avery detail/i);

    await page.getByRole("button", { name: /more actions/i }).click();
    await page.getByRole("menuitem", { name: /archive client/i }).click();
    await expect(page.getByRole("heading", { name: /archive client\?/i })).toBeVisible();
    await page.getByRole("button", { name: /^archive$/i }).last().click();

    await expect(page.getByText(/client archived/i)).toBeVisible();
    await expect(page).toHaveURL(/\/clients$/);
    await expect(page.getByText(/avery detail/i)).toHaveCount(0);
    expect(state.clientArchived).toBe(true);
    expect(state.vehicleArchived).toBe(true);
  });

  test("client archive actions stay hidden without customer write permission", async ({ page }) => {
    await mockClientVehicleApp(page, {
      permissions: ["dashboard.view", "customers.read", "vehicles.read", "appointments.read", "quotes.read", "invoices.read"],
    });
    await signInClientVehicle(page);

    await page.goto("/clients/client-1?from=%2Fclients");
    await expect(page.getByRole("main")).toContainText(/avery detail/i);
    await expect(page.getByRole("button", { name: /more actions/i })).toHaveCount(0);
    await expect(page.getByText(/archive client/i)).toHaveCount(0);
  });

  test("vehicle archive removes the record from the client detail workflow", async ({ page }) => {
    test.setTimeout(120000);

    const state = await mockClientVehicleApp(page);
    await signInClientVehicle(page);

    await page.goto("/clients/client-1/vehicles/vehicle-1?from=%2Fclients%2Fclient-1%3Ffrom%3D%252Fclients");
    await expect(page.getByRole("main")).toContainText(/2024 bmw m3 competition/i);

    await page.getByRole("button", { name: /archive vehicle/i }).click();
    await expect(page.getByRole("heading", { name: /archive vehicle\?/i })).toBeVisible();
    await page.getByRole("button", { name: /^archive$/i }).last().click();

    await expect(page.getByText(/vehicle archived/i)).toBeVisible();
    await expect(page).toHaveURL(/\/clients\/client-1/);
    await expect(page.getByRole("link", { name: /2024 bmw m3 black sapphire/i })).toHaveCount(0);
    expect(state.vehicleArchived).toBe(true);
  });

  test("vehicle archive actions stay hidden without vehicle write permission", async ({ page }) => {
    await mockClientVehicleApp(page, {
      permissions: ["dashboard.view", "customers.read", "customers.write", "vehicles.read", "appointments.read", "quotes.read", "invoices.read"],
    });
    await signInClientVehicle(page);

    await page.goto("/clients/client-1/vehicles/vehicle-1?from=%2Fclients%2Fclient-1%3Ffrom%3D%252Fclients");
    await expect(page.getByRole("main")).toContainText(/2024 bmw m3 competition/i);
    await expect(page.getByRole("button", { name: /archive vehicle/i })).toHaveCount(0);
  });

  test("appointment delete removes the record and returns to the calendar list safely", async ({ page }) => {
    test.setTimeout(120000);

    const state = await mockBillingFlowApp(page);
    await signInBilling(page);

    await page.goto("/appointments/appointment-seeded-1?from=%2Fappointments");
    await expect(page.getByText(/paint correction follow-up/i)).toBeVisible();

    await page.getByRole("button", { name: /^delete appointment$/i }).first().click();
    await expect(page.getByRole("button", { name: /^delete appointment$/i }).last()).toBeVisible();
    await page.getByRole("button", { name: /^delete appointment$/i }).last().click();

    await expect(page.getByText(/appointment deleted/i)).toBeVisible();
    await expect(page).toHaveURL(/\/appointments$/);
    await expect(page.getByText(/paint correction follow-up/i)).toHaveCount(0);
    expect(state.appointments.some((appointment) => appointment.id === "appointment-seeded-1")).toBe(false);
  });

  test("appointment delete is blocked when linked invoices still exist", async ({ page }) => {
    test.setTimeout(120000);

    const state = await mockBillingFlowApp(page, { seedAppointmentInvoiceStatus: "sent" });
    await signInBilling(page);

    await page.goto("/appointments/appointment-seeded-1?from=%2Fappointments");
    await expect(page.getByText(/paint correction follow-up/i)).toBeVisible();

    await page.getByRole("button", { name: /^delete appointment$/i }).first().click();
    await page.getByRole("button", { name: /^delete appointment$/i }).last().click();

    await expect(page.getByText(/can't be deleted because it has linked invoices/i)).toBeVisible();
    await expect(page).toHaveURL(/\/appointments\/appointment-seeded-1/);
    await expect(page.getByText(/paint correction follow-up/i)).toBeVisible();
    expect(state.appointments.some((appointment) => appointment.id === "appointment-seeded-1")).toBe(true);
  });

  test("appointment delete controls stay hidden without appointment write permission", async ({ page }) => {
    await mockBillingFlowApp(page, {
      permissions: ["dashboard.view", "customers.read", "vehicles.read", "appointments.read", "quotes.read", "invoices.read", "payments.read"],
    });
    await signInBilling(page);

    await page.goto("/appointments/appointment-seeded-1?from=%2Fappointments");
    await expect(page.getByText(/paint correction follow-up/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /^delete appointment$/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^delete block$/i })).toHaveCount(0);
  });
});

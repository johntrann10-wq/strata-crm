import { expect, test } from "@playwright/test";
import { mockClientVehicleApp, signIn } from "./helpers/clientVehicleFlow";

test.describe.configure({ mode: "serial" });

test.describe("Client and vehicle regression", () => {
  test("client and vehicle detail flows stay safe across reloads", async ({ page }) => {
    test.setTimeout(120000);

    const state = await mockClientVehicleApp(page);
    await signIn(page);
    await page.goto("/signed-in");
    await expect(page).toHaveURL(/\/signed-in/);

    await test.step("Client detail survives reloads", async () => {
      await page.goto("/clients");
      await expect(page.getByRole("main").getByRole("heading", { name: /^clients$/i })).toBeVisible();
      await page.goto("/clients/client-1?from=%2Fclients");

      await expect(page.getByRole("main").getByRole("heading", { level: 1, name: /avery detail/i })).toBeVisible();
      await expect(page.getByText(/^client record$/i)).toBeVisible();
      await expect(page.getByRole("link", { name: /2024 bmw m3 black sapphire/i })).toBeVisible();

      await page.reload();
      await expect(page).toHaveURL(/\/clients\/client-1/);
      await expect(page.getByRole("main").getByRole("heading", { level: 1, name: /avery detail/i })).toBeVisible();
      await expect(page.getByRole("link", { name: /2024 bmw m3 black sapphire/i })).toBeVisible();
    });

    await test.step("Vehicle detail survives reloads and saves correctly", async () => {
      await page.goto("/clients/client-1/vehicles/vehicle-1?from=%2Fclients%2Fclient-1%3Ffrom%3D%252Fclients");

      await expect(page.getByRole("heading", { name: /2024 bmw m3 competition/i })).toBeVisible();
      await expect(page.getByText(/^vehicle details$/i)).toBeVisible();
      await expect(page.locator("#color")).toHaveValue("Black Sapphire");

      await page.reload();
      await expect(page).toHaveURL(/\/clients\/client-1\/vehicles\/vehicle-1/);
      await expect(page.getByRole("heading", { name: /2024 bmw m3 competition/i })).toBeVisible();
      await expect(page.locator("#color")).toHaveValue("Black Sapphire");

      await page.locator("#color").fill("Frozen Deep Green");
      await page.locator("#licensePlate").fill("WRAPM3");
      await page.locator("#mileage").fill("12025");
      await page.getByRole("button", { name: /^save changes$/i }).click();

      await expect(page.getByText(/vehicle updated/i)).toBeVisible();
      await expect(page.locator("#color")).toHaveValue("Frozen Deep Green");
      await expect(page.locator("#licensePlate")).toHaveValue("WRAPM3");
      await expect(page.locator("#mileage")).toHaveValue("12025");

      await page.reload();
      await expect(page.locator("#color")).toHaveValue("Frozen Deep Green");
      await expect(page.locator("#licensePlate")).toHaveValue("WRAPM3");
      await expect(page.locator("#mileage")).toHaveValue("12025");
      expect(state.vehicle.color).toBe("Frozen Deep Green");
      expect(state.vehicle.licensePlate).toBe("WRAPM3");
      expect(state.vehicle.mileage).toBe(12025);
    });
  });
});

import { expect, test } from "@playwright/test";

test("signup stays card-free and focuses on account creation", async ({ page }) => {
  await page.goto("/sign-up");

  await expect(page.locator("#email")).toBeVisible();
  await expect(page.locator("#password")).toBeVisible();
  await expect(page.getByRole("button", { name: /sign up with email/i })).toBeVisible();

  await expect(page.getByLabel(/card number/i)).toHaveCount(0);
  await expect(page.getByPlaceholder(/card number/i)).toHaveCount(0);
  await expect(page.getByText(/payment method/i)).toHaveCount(0);
  await expect(page.getByText(/credit card/i)).toHaveCount(0);
});

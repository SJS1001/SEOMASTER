import { test, expect } from "@playwright/test";

test("connections page is auth-gated", async ({ page }) => {
  await page.goto("/settings/connections");
  await expect(page).toHaveURL(/\/login(\?.*)?$/);
});

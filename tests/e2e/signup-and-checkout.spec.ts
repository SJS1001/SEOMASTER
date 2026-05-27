import { test, expect } from "@playwright/test";

test("user can sign up, onboard, view dashboard, and reach Stripe checkout", async ({ page }) => {
  const email = `e2e+${Date.now()}@test.local`;
  const password = "test-password-123";

  // Sign up
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /create account/i }).click();

  // Onboarding
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("Workspace name").fill("E2E Co");
  await page.getByRole("button", { name: /continue/i }).click();

  // Dashboard
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText("E2E Co")).toBeVisible();

  // Billing → Stripe checkout
  await page.goto("/settings/billing");
  await expect(page.getByText("Solo")).toBeVisible();

  await Promise.all([
    page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 }),
    page.getByRole("button", { name: /start 14-day trial/i }).first().click(),
  ]);
  expect(page.url()).toContain("checkout.stripe.com");
});

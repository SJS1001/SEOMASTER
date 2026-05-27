import { test, expect } from "@playwright/test";

test("unauthenticated user is redirected from /dashboard to /login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login(\?.*)?$/);
});

test("unauthenticated user can reach /login and /signup", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /log in/i })).toBeVisible();

  await page.goto("/signup");
  await expect(page.getByRole("heading", { name: /sign up/i })).toBeVisible();
});

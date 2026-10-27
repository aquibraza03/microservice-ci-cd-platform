import { test, expect } from "@playwright/test";

test.describe("landing page", () => {
  test("renders the hero and links to sign in", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: /control plane/ })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();

    await page.getByRole("link", { name: "Sign in" }).click();
    await page.waitForURL(/\/login/, { timeout: 45_000 });
  });
});

test.describe("authentication (dev provider)", () => {
  test("validates the login form", async ({ page }) => {
    await page.goto("/login");

    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText("Email is required.")).toBeVisible();
    await expect(page.getByText("Password must be at least 8 characters.")).toBeVisible();

    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Password").fill("short");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  });

  test("signs in and lands on the dashboard", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("Email").fill("dev@example.com");
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Sidebar" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Projects" })).toBeVisible();
    await expect(page.getByText("Sample data")).toBeVisible();
  });

  test("navigates to the projects page from the sidebar", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("Email").fill("dev@example.com");
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/dashboard/);
    await page.getByRole("link", { name: "Projects" }).click();
    await expect(page).toHaveURL(/\/projects/);
    await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
  });
});

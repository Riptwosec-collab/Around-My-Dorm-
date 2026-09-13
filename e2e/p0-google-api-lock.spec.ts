import { expect, test } from "@playwright/test";

test("Google maintenance remains fail-closed behind admin gate across reload and makes zero Places calls", async ({ page }) => {
  let googlePlacesRequests = 0;
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("places.googleapis.com") || url.includes("/maps/api/place") || url.includes("maps.googleapis.com/maps/api/place")) googlePlacesRequests += 1;
  });

  await page.goto("/settings");
  await page.getByRole("button", { name: "จัดการ", exact: true }).click();
  const locked = page.getByTestId("data-management-admin-locked");
  await expect(locked).toBeVisible();
  await expect(locked.getByText(/Admin login required|ต้องเข้าสู่ระบบ Admin/)).toBeVisible();
  await expect(page.getByTestId("google-api-request-lock")).toHaveCount(0);
  await page.waitForTimeout(1200);

  await page.reload();
  await page.getByRole("button", { name: "จัดการ", exact: true }).click();
  const reloadedLocked = page.getByTestId("data-management-admin-locked");
  await expect(reloadedLocked).toBeVisible();
  await expect(reloadedLocked.getByText(/Admin login required|ต้องเข้าสู่ระบบ Admin/)).toBeVisible();
  await expect(page.getByTestId("google-api-request-lock")).toHaveCount(0);
  await page.waitForTimeout(300);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(googlePlacesRequests).toBe(0);
});

import { expect, test } from "@playwright/test";

test("Smart Refresh Queue stays fail-closed before admin login and makes zero Google Places requests", async ({ page }) => {
  let googlePlacesRequests = 0;
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("places.googleapis.com") || url.includes("/maps/api/place") || url.includes("maps.googleapis.com/maps/api/place")) googlePlacesRequests += 1;
  });

  await page.goto("/settings");
  await page.getByRole("button", { name: "จัดการ", exact: true }).click();

  await expect(page.getByTestId("data-management-admin-locked")).toBeVisible();
  await expect(page.getByTestId("data-refresh-queue")).toHaveCount(0);
  await page.waitForTimeout(250);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(googlePlacesRequests).toBe(0);
});

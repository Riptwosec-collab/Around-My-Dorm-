import { expect, test } from "@playwright/test";

test("API Control Center settings are mobile safe and local-only", async ({ page }) => {
  let googlePlacesRequests = 0;
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("places.googleapis.com") || url.includes("/maps/api/place") || url.includes("maps.googleapis.com/maps/api/place")) googlePlacesRequests += 1;
  });
  await page.goto("/settings");
  await page.getByRole("button", { name: "จัดการ", exact: true }).click();
  const control = page.getByTestId("google-api-control-center");
  await expect(control).toBeVisible();
  await control.getByTestId("api-control-batch-setting").selectOption("25");
  await control.getByTestId("api-control-daily-warning").fill("180");
  await control.getByTestId("api-control-monthly-warning").fill("1800");
  await page.waitForTimeout(250);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(googlePlacesRequests).toBe(0);
});

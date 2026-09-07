import { expect, test } from "@playwright/test";

test("Smart Refresh Queue preview is mobile safe and makes zero Google Places requests", async ({ page }) => {
  let googlePlacesRequests = 0;
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("places.googleapis.com") || url.includes("/maps/api/place") || url.includes("maps.googleapis.com/maps/api/place")) googlePlacesRequests += 1;
  });
  await page.goto("/settings");
  await page.getByRole("button", { name: "จัดการ", exact: true }).click();
  const queue = page.getByTestId("data-refresh-queue");
  await expect(queue).toBeVisible();
  const preview = queue.getByTestId("refresh-queue-preview");
  if (await preview.isEnabled()) {
    await preview.click();
    await expect(page.getByText("REQUEST PREVIEW")).toBeVisible();
    await page.getByRole("button", { name: "Close" }).last().click().catch(() => {});
  }
  await page.waitForTimeout(250);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(googlePlacesRequests).toBe(0);
});

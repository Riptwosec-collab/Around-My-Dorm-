import { expect, test } from "@playwright/test";

test("Place ID Manager is mobile safe and filters do not trigger Google Places", async ({ page }) => {
  let googlePlacesRequests = 0;
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("places.googleapis.com") || url.includes("/maps/api/place") || url.includes("maps.googleapis.com/maps/api/place")) googlePlacesRequests += 1;
  });

  await page.goto("/settings");
  await expect(page.getByText("จัดการข้อมูลร้าน")).toBeVisible();
  await page.getByRole("button", { name: "จัดการ", exact: true }).click();
  await expect(page.getByTestId("google-place-id-manager")).toBeVisible();
  await page.getByTestId("place-id-filter-missing").click();
  await page.getByTestId("place-id-filter-linked").click();
  await page.getByTestId("place-id-filter-chain").click();
  await page.getByTestId("audit-place-ids").click();
  await page.waitForTimeout(300);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(googlePlacesRequests).toBe(0);
});

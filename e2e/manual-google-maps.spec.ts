import { expect, test } from "@playwright/test";

test("normal browsing and opening Map initialize zero Google Maps or Places requests", async ({ page }) => {
  let mapsJs = 0;
  let places = 0;
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("maps.googleapis.com/maps/api/js")) mapsJs += 1;
    if (url.includes("places.googleapis.com") || url.includes("/maps/api/place") || url.includes("maps.googleapis.com/maps/api/place")) places += 1;
  });

  await page.goto("/");
  await page.waitForTimeout(1200);
  expect(mapsJs).toBe(0);
  expect(places).toBe(0);

  await page.goto("/map/");
  await expect(page.getByTestId("saved-cloud-map")).toBeVisible();
  await expect(page.getByTestId("map-provider-toggle")).toBeVisible();
  await page.getByLabel("รัศมีแผนที่").selectOption("2000");
  await page.waitForTimeout(400);
  expect(mapsJs).toBe(0);
  expect(places).toBe(0);

  await page.getByTestId("map-provider-toggle").getByRole("button", { name: "Google", exact: true }).click();
  await expect(page.getByTestId("google-map-placeholder")).toBeVisible();
  await expect(page.getByTestId("load-google-map")).toBeDisabled();
  expect(mapsJs).toBe(0);
  expect(places).toBe(0);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("opening Data Management sends zero Google requests before explicit confirmation", async ({ page }) => {
  let googleRequests = 0;
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("maps.googleapis.com") || url.includes("places.googleapis.com")) googleRequests += 1;
  });
  await page.goto("/settings/");
  await page.getByRole("button", { name: "จัดการ", exact: true }).click();
  await expect(page.getByTestId("data-management-admin-locked")).toBeVisible();
  await expect(page.getByText(/Admin login required|ต้องเข้าสู่ระบบ Admin/)).toBeVisible();
  expect(googleRequests).toBe(0);
});

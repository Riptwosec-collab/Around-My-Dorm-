import { expect, test } from "@playwright/test";

test("Google request emergency lock is cloud-persisted and toggling it makes zero Places calls", async ({ page }) => {
  let googlePlacesRequests = 0;
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("places.googleapis.com") || url.includes("/maps/api/place") || url.includes("maps.googleapis.com/maps/api/place")) googlePlacesRequests += 1;
  });

  await page.goto("/settings");
  await page.getByRole("button", { name: "จัดการ", exact: true }).click();

  const lock = page.getByTestId("google-api-request-lock");
  await expect(lock).toBeVisible();
  // Cloud-only policy is intentionally fail-closed for a fresh anonymous user.
  await expect(lock.getByText("LOCKED", { exact: true })).toBeVisible();

  await page.getByTestId("google-api-lock-toggle").click();
  await expect(lock.getByText("UNLOCKED", { exact: true })).toBeVisible();
  // Allow the cloud upsert to settle before testing reload persistence.
  await page.waitForTimeout(1200);

  await page.reload();
  await page.getByRole("button", { name: "จัดการ", exact: true }).click();
  await expect(page.getByTestId("google-api-request-lock").getByText("UNLOCKED", { exact: true })).toBeVisible();

  await page.getByTestId("google-api-lock-toggle").click();
  await expect(page.getByTestId("google-api-request-lock").getByText("LOCKED", { exact: true })).toBeVisible();
  await page.waitForTimeout(500);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(googlePlacesRequests).toBe(0);
});

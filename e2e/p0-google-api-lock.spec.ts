import { expect, test } from "@playwright/test";

test("Google request emergency lock persists and toggling it makes zero Places calls", async ({ page }) => {
  let googlePlacesRequests = 0;
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("places.googleapis.com") || url.includes("/maps/api/place") || url.includes("maps.googleapis.com/maps/api/place")) googlePlacesRequests += 1;
  });

  await page.goto("/settings");
  await page.getByRole("button", { name: "จัดการ", exact: true }).click();

  const lock = page.getByTestId("google-api-request-lock");
  await expect(lock).toBeVisible();
  const locked = lock.getByText("LOCKED", { exact: true });
  const unlocked = lock.getByText("UNLOCKED", { exact: true });
  const initiallyLocked = await locked.isVisible().catch(() => false);
  if (!initiallyLocked) await expect(unlocked).toBeVisible();

  await page.getByTestId("google-api-lock-toggle").click();
  const expectedAfterToggle = initiallyLocked ? "UNLOCKED" : "LOCKED";
  await expect(lock.getByText(expectedAfterToggle, { exact: true })).toBeVisible();
  await page.waitForTimeout(1200);

  await page.reload();
  await page.getByRole("button", { name: "จัดการ", exact: true }).click();
  await expect(page.getByTestId("google-api-request-lock").getByText(expectedAfterToggle, { exact: true })).toBeVisible();

  await page.getByTestId("google-api-lock-toggle").click();
  const restored = initiallyLocked ? "LOCKED" : "UNLOCKED";
  await expect(page.getByTestId("google-api-request-lock").getByText(restored, { exact: true })).toBeVisible();
  await page.waitForTimeout(500);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(googlePlacesRequests).toBe(0);
});

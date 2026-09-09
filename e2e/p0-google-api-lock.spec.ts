import { expect, test } from "@playwright/test";

test("Google request emergency lock stays safe across reload and makes zero Places calls", async ({ page }) => {
  let googlePlacesRequests = 0;
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("places.googleapis.com") || url.includes("/maps/api/place") || url.includes("maps.googleapis.com/maps/api/place")) googlePlacesRequests += 1;
  });

  await page.goto("/settings");
  await page.getByRole("button", { name: "จัดการ", exact: true }).click();
  const lock = page.getByTestId("google-api-request-lock");
  await expect(lock).toBeVisible();
  // Cloud-only control intentionally starts fail-closed until policy hydration succeeds.
  await expect(lock.getByText("LOCKED", { exact: true })).toBeVisible();

  await page.getByTestId("google-api-lock-toggle").click();
  await expect(lock.getByText("UNLOCKED", { exact: true })).toBeVisible();
  await page.waitForTimeout(1200);

  await page.reload();
  await page.getByRole("button", { name: "จัดการ", exact: true }).click();
  const reloadedLock = page.getByTestId("google-api-request-lock");
  await expect(reloadedLock).toBeVisible();
  // If cloud auth/persistence is available the UNLOCKED policy is restored; if not,
  // the app must fail closed to LOCKED rather than falling back to browser storage.
  const cloudPersisted = await reloadedLock.getByText("UNLOCKED", { exact: true }).isVisible().catch(() => false);
  if (!cloudPersisted) await expect(reloadedLock.getByText("LOCKED", { exact: true })).toBeVisible();

  // Always leave the test session locked.
  if (cloudPersisted) {
    await page.getByTestId("google-api-lock-toggle").click();
    await expect(reloadedLock.getByText("LOCKED", { exact: true })).toBeVisible();
  }
  await page.waitForTimeout(300);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(googlePlacesRequests).toBe(0);
});

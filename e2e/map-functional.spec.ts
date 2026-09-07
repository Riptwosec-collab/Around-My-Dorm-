import { expect, test } from "@playwright/test";

test("map keeps premium layout and exposes full radius controls without API key", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/map/");
  await expect(page.getByRole("heading", { name: "แผนที่", exact: true })).toBeVisible();
  const radius = page.getByLabel("รัศมีแผนที่");
  await expect(radius).toBeVisible();
  await expect(radius.locator("option[value='5000']")).toHaveCount(1);
  await expect(page.getByText(/ยังไม่ได้ตั้งค่า Google Maps|Google Maps is not configured/)).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

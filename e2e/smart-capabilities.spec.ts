import { expect, test } from "@playwright/test";

test("smart local concierge works on mobile without accidental Google Places calls", async ({ page }) => {
  let googlePlacesRequests = 0;
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("places.googleapis.com") || url.includes("/maps/api/place") || url.includes("maps.googleapis.com/maps/api/place")) googlePlacesRequests += 1;
  });

  await page.goto("/");
  const hub = page.getByTestId("smart-capability-hub");
  await expect(hub).toBeVisible();

  await hub.getByRole("button", { name: "เทียบ", exact: true }).click();
  await expect(hub.getByText("เลือกได้สูงสุด 4 ร้าน", { exact: true })).toBeVisible();

  await hub.getByRole("button", { name: "ทริป", exact: true }).click();
  await expect(hub.getByText(/เลือกได้สูงสุด 5 จุด/)).toBeVisible();

  await hub.getByRole("button", { name: "ชีวิตรอบหอ", exact: true }).click();
  await expect(hub.getByText(/ของจำเป็นสำหรับชีวิตรอบหอ/)).toBeVisible();

  await hub.getByRole("button", { name: "ฉุกเฉิน", exact: true }).click();
  await expect(hub.getByText(/บริการฉุกเฉินทางการ/)).toBeVisible();

  await hub.getByRole("button", { name: "ตอนนี้", exact: true }).click();
  const sample = hub.getByRole("button", { name: "ข้าวไม่เกิน 100 เปิดอยู่", exact: true });
  await sample.click();
  await page.waitForTimeout(200);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(googlePlacesRequests).toBe(0);
});

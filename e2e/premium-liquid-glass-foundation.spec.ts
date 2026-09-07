import { expect, test } from "@playwright/test";

const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 393, height: 852 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1280, height: 900 },
];

test("premium liquid glass foundation stays responsive and makes no accidental Places requests", async ({ page }) => {
  const placesRequests: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("places.googleapis.com/") || url.includes("maps.googleapis.com/maps/api/place/")) placesRequests.push(url);
  });

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(150);

    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
    }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);

    const nav = page.locator(".amd-nav");
    await expect(nav).toBeVisible();
    const navBox = await nav.boundingBox();
    expect(navBox).not.toBeNull();
    if (navBox) {
      expect(navBox.x).toBeGreaterThanOrEqual(0);
      expect(navBox.x + navBox.width).toBeLessThanOrEqual(metrics.innerWidth + 1);
      expect(navBox.y + navBox.height).toBeLessThanOrEqual(metrics.innerHeight + 1);
    }

    const material = await nav.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        background: style.backgroundColor,
        backdrop: style.backdropFilter || style.getPropertyValue("-webkit-backdrop-filter"),
      };
    });
    expect(material.background).not.toBe("rgba(0, 0, 0, 0)");
    expect(material.backdrop).toContain("blur");

    const input = page.locator(".amd-input input").first();
    if (await input.count()) {
      await input.focus();
      await expect(input).toBeFocused();
    }

    const navButtons = nav.locator("button");
    const count = await navButtons.count();
    for (let index = 0; index < count; index += 1) {
      await navButtons.nth(index).click();
      await page.waitForTimeout(50);
    }
  }

  expect(placesRequests, `Unexpected Google Places calls: ${placesRequests.join("\n")}`).toEqual([]);
});

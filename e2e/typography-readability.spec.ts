import { expect, test } from "@playwright/test";

test("typography stays legible and pages fit 320–430px PWAs", async ({ page }) => {
  for (const width of [320, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 800 });
    for (const route of ["/", "/map/", "/saved/", "/recent/", "/settings/", "/parking/"]) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      const metrics = await page.evaluate(() => {
        const heading = document.querySelector("h1,h2");
        const nav = document.querySelector(".amd-nav-item");
        return {
          bodyFont: parseFloat(getComputedStyle(document.body).fontSize),
          width: document.documentElement.scrollWidth,
          viewport: window.innerWidth,
          headingFont: heading ? parseFloat(getComputedStyle(heading).fontSize) : null,
          navFont: nav ? parseFloat(getComputedStyle(nav).fontSize) : null,
        };
      });
      expect(metrics.bodyFont).toBeGreaterThanOrEqual(15);
      expect(metrics.width, `overflow: ${route} at ${width}px`).toBeLessThanOrEqual(metrics.viewport + 1);
      if (metrics.navFont) expect(metrics.navFont).toBeGreaterThanOrEqual(11.5);
      expect(metrics.headingFont).toBeGreaterThanOrEqual(19);
    }
  }
});

test("theme contrast and small labels remain readable", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const css = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--amd-text-3").trim());
  expect(css.toLowerCase()).toBe("#9fadc3");
  const smallLabel = page.locator('[class~="text-[10px]"]').first();
  if (await smallLabel.count()) {
    const size = await smallLabel.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThanOrEqual(12.5);
  }
  const light = await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
    return getComputedStyle(document.documentElement).getPropertyValue("--amd-text-3").trim();
  });
  expect(light.toLowerCase()).toBe("#596b82");
});

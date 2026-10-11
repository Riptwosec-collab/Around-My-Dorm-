import { expect, test } from "@playwright/test";

const widths = [320, 375, 390, 430];
const routes = ["/", "/map/", "/saved/", "/recent/", "/settings/", "/parking/"];

test("PWA routes fit narrow devices without horizontal document overflow", async ({ page }) => {
  for (const width of widths) {
    await page.setViewportSize({ width, height: 780 });
    for (const route of routes) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      const dimensions = await page.evaluate(() => ({
        viewport: window.innerWidth,
        document: document.documentElement.scrollWidth,
      }));
      expect(dimensions.document, `${width}px ${route}`).toBeLessThanOrEqual(dimensions.viewport + 1);
      // Capture per-route baseline metrics for a later before/after comparison.
      const metrics = await page.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
        return {
          domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd - nav.startTime) : null,
          nextStaticResources: performance.getEntriesByType("resource").filter((entry) => entry.name.includes("/_next/static/")).length,
        };
      });
      console.info("PWA_AUDIT", JSON.stringify({ route, width, ...metrics }));
    }
  }
});

test("user-facing navigation stays interactive and expensive Admin loads on demand", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const advanced = page.getByRole("button", { name: /เครื่องมือเพิ่มเติม|Advanced:/ });
  await expect(advanced).toHaveAttribute("aria-expanded", "false");
  await advanced.click();
  await expect(advanced).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("smart-capability-hub")).toBeVisible();
  await advanced.click();
  await expect(page.getByTestId("smart-capability-hub")).toHaveCount(0);
  await expect(page.locator("[data-google-map-state]")).toHaveCount(0);
  await page.getByRole("button", { name: /แผนที่|Map/ }).last().click();
  await expect(page.locator("[data-google-map-state]")).toHaveCount(1);
});

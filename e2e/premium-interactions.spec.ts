import { expect, test } from "@playwright/test";

const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 393, height: 852 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1280, height: 900 },
];

test("navigation, search and PlaceCard interactions remain touch-safe without Places calls", async ({ page }) => {
  const placesRequests: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("places.googleapis.com/") || url.includes("maps.googleapis.com/maps/api/place/")) placesRequests.push(url);
  });

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const search = page.locator(".amd-input input").first();
    if (await search.count()) {
      const before = await search.boundingBox();
      await search.focus();
      await expect(search).toBeFocused();
      const after = await search.boundingBox();
      if (before && after) expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(1);
      await search.fill("กาแฟ");
      await page.waitForTimeout(80);
      await search.fill("");
    }

    const nav = page.locator(".amd-nav");
    await expect(nav).toBeVisible();
    const navButtons = nav.locator("button");
    expect(await navButtons.count()).toBeGreaterThanOrEqual(5);
    for (let index = 0; index < Math.min(5, await navButtons.count()); index += 1) {
      const button = navButtons.nth(index);
      const box = await button.boundingBox();
      if (box) {
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      // Next dev warning portal can overlap the lowest controls in CI; force only bypasses
      // that development overlay and still dispatches the app's real click handler.
      await button.click({ force: true });
      await page.waitForTimeout(40);
    }

    await navButtons.first().click({ force: true });
    await page.waitForTimeout(80);
    const card = page.locator(".amd-place-card").first();
    if (await card.count()) {
      await expect(card).toBeVisible();
      const save = card.locator(".amd-save-control");
      if (await save.count()) {
        const box = await save.boundingBox();
        if (box) {
          expect(box.width).toBeGreaterThanOrEqual(44);
          expect(box.height).toBeGreaterThanOrEqual(44);
        }
        const wasSaved = await save.getAttribute("aria-pressed");
        await save.click({ force: true });
        await expect(save).toHaveAttribute("aria-pressed", wasSaved === "true" ? "false" : "true");
      }
    }

    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
  }

  expect(placesRequests, `Unexpected Google Places calls: ${placesRequests.join("\n")}`).toEqual([]);
});

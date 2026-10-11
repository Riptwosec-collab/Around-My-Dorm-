import { expect, test } from "@playwright/test";

const viewports = [
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 393, height: 852 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1280, height: 900 },
];

test("major responsive widths do not overflow and primary controls remain reachable", async ({ page }) => {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "สำรวจ", exact: true })).toBeVisible();
    await expect(page.getByRole("navigation")).toBeVisible();
    const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.innerWidth + 1);
  }
});

test("map, saved, recent and settings real routes remain viewport safe", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["/map/", "/saved/", "/recent/", "/settings/"]) {
    await page.goto(route);
    await expect(page.getByRole("navigation")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }
});

test("light theme and reduced motion keep the same usable layout", async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await page.goto("/");
  const lightBg = await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
    return getComputedStyle(document.documentElement).getPropertyValue("--amd-bg").trim();
  });
  expect(lightBg.toLowerCase()).toBe("#eef5ff");

  await page.emulateMedia({ reducedMotion: "reduce" });
  const durationMs = await page.locator(".amd-page").first().evaluate((element) => {
    const raw = getComputedStyle(element).animationDuration.trim();
    if (!raw) return 0;
    return raw.endsWith("ms") ? Number.parseFloat(raw) : Number.parseFloat(raw) * 1000;
  });
  expect(durationMs).toBeLessThanOrEqual(1);
});


test("bottom dock respects the mobile safe area and never floats while scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings/");
  const nav = page.getByTestId("mobile-bottom-nav");
  await expect(nav).toBeVisible();
  const position = await nav.evaluate((el) => {
    const style = getComputedStyle(el);
    return { fixed: style.position === "fixed", bottom: el.getBoundingClientRect().bottom, viewport: innerHeight };
  });
  expect(position.fixed).toBe(true);
  expect(position.bottom).toBeCloseTo(position.viewport, 0);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(nav).toBeVisible();
  const lastBottom = await nav.evaluate((el) => el.getBoundingClientRect().bottom);
  expect(lastBottom).toBeCloseTo(position.viewport, 0);
});

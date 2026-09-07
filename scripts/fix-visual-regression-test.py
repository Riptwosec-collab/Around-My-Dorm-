from pathlib import Path

path = Path("e2e/visual-regression.spec.ts")
text = path.read_text(encoding="utf-8")

old = '''test("light theme and reduced motion keep the same usable layout", async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await page.goto("/");
  await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
  const lightBg = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--amd-bg").trim());
  expect(lightBg.toLowerCase()).toBe("#eef5ff");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const duration = await page.locator(".amd-page").first().evaluate((element) => getComputedStyle(element).animationDuration);
  expect(["0s", "0.00001s", "0.001s"]).toContain(duration);
});'''

new = '''test("light theme and reduced motion keep the same usable layout", async ({ page }) => {
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
});'''

if old not in text:
    raise RuntimeError("Visual regression test target was not found")

path.write_text(text.replace(old, new, 1), encoding="utf-8")
print("Visual regression theme/reduced-motion test stabilized.")

import { expect, test } from "@playwright/test";

function isGoogleRuntimeRequest(url: string) {
  return url.includes("places.googleapis.com")
    || url.includes("maps.googleapis.com")
    || url.includes("maps.gstatic.com/maps");
}

test("Natural Search parses Thai constraints, remembers the query, and makes zero Google requests", async ({ page }) => {
  const googleRequests: string[] = [];
  page.on("request", (request) => {
    if (isGoogleRuntimeRequest(request.url())) googleRequests.push(request.url());
  });

  await page.goto("/");
  const search = page.locator(".amd-input input").first();
  await expect(search).toBeVisible();

  const query = "ข้าวไม่เกิน 80 เปิดอยู่";
  await search.fill(query);
  await search.press("Enter");

  const panel = page.getByTestId("search-assist-panel");
  await expect(panel).toBeVisible();
  const intent = page.getByTestId("search-intent-chips");
  await expect(intent).toContainText("อาหาร");
  await expect(intent).toContainText("≤ ฿80");
  await expect(intent).toContainText("เปิดอยู่");

  // Search history is intentionally transient/in-memory. Re-focusing an empty
  // search should surface the exact committed query without writing browser storage.
  await search.fill("");
  await search.focus();
  await expect(panel.getByRole("button", { name: query, exact: true })).toBeVisible();

  await page.waitForTimeout(400);
  expect(googleRequests).toEqual([]);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("Search Assist stays inside the approved 519x921 app frame", async ({ page }) => {
  await page.setViewportSize({ width: 519, height: 921 });
  await page.goto("/");

  const search = page.locator(".amd-input input").first();
  await search.fill("ข้าวไม่เกิน 80 เปิดอยู่");
  await search.press("Enter");
  await expect(page.getByTestId("search-assist-panel")).toBeVisible();

  const geometry = await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>(".amd-shell");
    const nav = document.querySelector<HTMLElement>(".amd-nav");
    if (!shell || !nav) return null;
    const shellRect = shell.getBoundingClientRect();
    const navRect = nav.getBoundingClientRect();
    return {
      shellWidth: shellRect.width,
      shellCenter: shellRect.left + shellRect.width / 2,
      navCenter: navRect.left + navRect.width / 2,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });

  expect(geometry).not.toBeNull();
  expect(geometry!.shellWidth).toBeLessThanOrEqual(519);
  expect(Math.abs(geometry!.shellCenter - geometry!.navCenter)).toBeLessThanOrEqual(1);
  expect(geometry!.overflow).toBeLessThanOrEqual(1);
});

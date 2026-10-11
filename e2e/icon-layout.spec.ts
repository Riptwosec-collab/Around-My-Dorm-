import { expect, test } from "@playwright/test";
test("five nav icon slots are balanced at phone sizes",async({page})=>{
 for(const width of [320,375,390,430]){
  await page.setViewportSize({width,height:800});
  await page.goto("/settings/",{waitUntil:"domcontentloaded"});
  const nav=page.getByTestId("mobile-bottom-nav");
  await expect(nav).toBeVisible();
  const boxes=await nav.locator(".amd-nav-item").evaluateAll(items=>items.map(item=>{
    const button=item.getBoundingClientRect();
    const icon=item.querySelector(".amd-nav-icon")!.getBoundingClientRect();
    const label=item.querySelector(".amd-nav-label")!.getBoundingClientRect();
    return {width:button.width,top:button.top,bottom:button.bottom,iconTop:icon.top,iconBottom:icon.bottom,labelTop:label.top};
  }));
  expect(boxes).toHaveLength(5);
  expect(Math.max(...boxes.map(b=>b.width))-Math.min(...boxes.map(b=>b.width))).toBeLessThanOrEqual(1);
  for(const b of boxes){expect(b.iconTop).toBeGreaterThanOrEqual(b.top-1);expect(b.iconBottom).toBeLessThanOrEqual(b.bottom+1);expect(b.labelTop).toBeGreaterThanOrEqual(b.iconBottom-1);}
  await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));
  expect(await nav.evaluate(el=>Math.abs(el.getBoundingClientRect().bottom-innerHeight))).toBeLessThanOrEqual(1);
 }
});

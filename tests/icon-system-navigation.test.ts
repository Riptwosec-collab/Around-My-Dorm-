import fs from "node:fs";
import { describe, expect, it } from "vitest";
const read=(f:string)=>fs.readFileSync(f,"utf8");
const app=read("components/AroundMyDormApp.tsx");
const css=read("app/icon-system.css");
const layout=read("app/layout.tsx");
const admin=read("components/DataManagement.tsx");
describe("premium icon system",()=>{
 it("uses five proportional navigational icons",()=>{
   for(const s of ["Radar","MapPinned","BookmarkCheck","History","Settings2"]) expect(app).toContain(s);
   expect(app).toContain('className="amd-nav-icon"');
   expect(app).toContain('className="amd-nav-label"');
   expect(css).toContain("grid-template-columns: repeat(5, minmax(0, 1fr));");
   expect(css).toContain("transform: none !important;");
   expect(layout.indexOf('import "./icon-system.css"')).toBeGreaterThan(layout.indexOf('import "./typography-clarity.css"'));
 });
 it("gives admin panel icons and shared setting icons their own visual roles",()=>{
  for(const s of ["LayoutDashboard","ClipboardCheck","Activity","Sparkles","MapPinned","ScanSearch"])expect(admin).toContain("icon: "+s);
  expect(read("components/AppShellPrimitives.tsx")).toContain("amd-setting-icon");
  expect(css).toContain(".amd-admin-tab");
 });
});

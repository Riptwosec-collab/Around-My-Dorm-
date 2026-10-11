import fs from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file: string) => fs.readFileSync(file, "utf8");
const app = read("components/AroundMyDormApp.tsx");
const css = read("app/icon-system.css");
const layout = read("app/layout.tsx");
const admin = read("components/DataManagement.tsx");

describe("premium icon system", () => {
  it("balances the five semantic navigation icons", () => {
    for (const icon of ["Radar", "MapPinned", "BookmarkCheck", "History", "Settings2"]) {
      expect(app).toContain(icon);
    }
    expect(app).toContain('className="amd-nav-icon"');
    expect(app).toContain('className="amd-nav-label"');
    expect(css).toContain("grid-template-columns: repeat(5, minmax(0, 1fr));");
    expect(css).toContain("transform: none !important;");
    expect(layout.indexOf('import "./icon-system.css"')).toBeGreaterThan(
      layout.indexOf('import "./typography-clarity.css"'),
    );
  });

  it("gives admin icons and settings tiles consistent semantics", () => {
    for (const icon of ["LayoutDashboard", "ClipboardCheck", "Activity", "Sparkles", "MapPinned", "ScanSearch"]) {
      expect(admin).toContain("icon: " + icon);
    }
    expect(read("components/AppShellPrimitives.tsx")).toContain("amd-setting-icon");
    expect(css).toContain(".amd-admin-tab");
  });

  it("replaces platform-dependent emoji in categories with semantic line glyphs", () => {
    const card = read("components/PlaceCard.tsx");
    const preferences = read("components/CategoryPreferenceSheet.tsx");
    const photo = read("components/PlacePhoto.tsx");
    const glyph = read("components/CategoryGlyph.tsx");
    expect(card).toContain("<CategoryGlyph category=");
    expect(preferences).toContain("<CategoryGlyph category=");
    expect(photo).toContain("CategoryGlyph as CategoryIcon");
    expect(glyph).toContain("Partial<Record<CategoryId, LucideIcon>>");
    expect(card).not.toContain("{item.icon}");
    expect(preferences).not.toContain("{item.icon}");
  });
});

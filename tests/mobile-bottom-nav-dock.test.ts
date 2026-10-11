import fs from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file: string) => fs.readFileSync(file, "utf8");
const app = read("components/AroundMyDormApp.tsx");
const frame = read("app/app-frame-sizing.css");
const finalCss = read("app/render-stability.css");
const layout = read("app/layout.tsx");

describe("iOS mobile PWA bottom dock", () => {
  it("mounts the navigation in the document body, not the scrolling shell", () => {
    expect(app).toContain('import { createPortal } from "react-dom";');
    expect(app).toContain("setNavigationHost(document.body)");
    expect(app).toContain("navigationHost && createPortal(");
    expect(app).toContain('data-testid="mobile-bottom-nav"');
    expect(app).toContain("navigationHost,");
  });

  it("keeps nav content above the home indicator while the dock reaches the screen edge", () => {
    expect(frame).toContain("--amd-nav-bottom-gap: 0px;");
    expect(finalCss).toContain("bottom: 0 !important;");
    expect(finalCss).toContain("height: calc(var(--amd-nav-h) + env(safe-area-inset-bottom, 0px));");
    expect(finalCss).toContain("padding: 0 0 env(safe-area-inset-bottom, 0px);");
    expect(finalCss).toContain(".amd-nav-items");
    expect(finalCss).toContain("transform: none !important;");
    expect(finalCss).toContain("border-radius: 23px 23px 0 0;");
  });

  it("keeps the last CSS import behind the glass and frame styles", () => {
    expect(layout.indexOf('import "./render-stability.css"')).toBeGreaterThan(layout.indexOf('import "./app-frame-sizing.css"'));
  });
});

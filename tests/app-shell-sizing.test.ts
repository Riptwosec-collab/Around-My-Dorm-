import fs from "node:fs";
import { describe, expect, it } from "vitest";

const css = fs.readFileSync("app/app-frame-sizing.css", "utf8");
const layout = fs.readFileSync("app/layout.tsx", "utf8");

function rule(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`));
  expect(match, `Missing CSS rule for ${selector}`).toBeTruthy();
  return match?.[1] ?? "";
}

describe("PWA-first mobile app shell sizing", () => {
  it("loads the frame override after the existing visual styles", () => {
    expect(layout).toContain('import "./app-frame-sizing.css";');
    expect(layout.indexOf('import "./app-frame-sizing.css";')).toBeGreaterThan(layout.indexOf('import "./premium-map-sheets.css";'));
  });

  it("caps wide previews at the approved 430px PWA phone frame", () => {
    expect(css).toContain("--amd-app-max-w: 430px;");
    expect(rule(".amd-shell")).toContain("width: 100%;");
    expect(rule(".amd-shell")).toContain("max-width: var(--amd-app-max-w);");
  });

  it("uses full phone width with safe-area-aware gutters", () => {
    expect(css).toContain("--amd-page-gutter: clamp(14px, 4vw, 18px);");
    expect(rule(".amd-page")).toContain("max-width: 100%;");
    expect(rule(".amd-page")).toContain("padding-left: max(var(--amd-page-gutter), env(safe-area-inset-left));");
    expect(rule(".amd-page")).toContain("padding-right: max(var(--amd-page-gutter), env(safe-area-inset-right));");
    expect(rule(".amd-nav")).toContain("bottom: max(var(--amd-nav-bottom-gap), env(safe-area-inset-bottom));");
  });

  it("centers the fixed bottom navigation only above the 430px phone frame", () => {
    expect(css).toContain("@media (min-width: 431px)");
    expect(css).toContain("left: 50%;");
    expect(css).toContain("right: auto;");
    expect(css).toContain("transform: translateX(-50%);");
    expect(css).toContain("width: calc(var(--amd-app-max-w) - (var(--amd-page-gutter) * 2));");
  });

  it("supports installed standalone/fullscreen PWA display modes", () => {
    expect(css).toContain("@media (display-mode: standalone), (display-mode: fullscreen)");
    expect(css).toContain("min-height: 100dvh;");
    expect(css).not.toContain("height: 921px");
  });
});

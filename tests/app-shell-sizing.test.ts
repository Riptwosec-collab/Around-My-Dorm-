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

describe("mobile app shell sizing", () => {
  it("loads the frame override after the existing visual styles", () => {
    expect(layout).toContain('import "./app-frame-sizing.css";');
    expect(layout.indexOf('import "./app-frame-sizing.css";')).toBeGreaterThan(layout.indexOf('import "./premium-map-sheets.css";'));
  });

  it("caps the app frame at the approved 519px reference width", () => {
    expect(css).toContain("--amd-app-max-w: 519px;");
    expect(rule(".amd-shell")).toContain("width: min(100%, var(--amd-app-max-w));");
  });

  it("lets page content and bottom navigation use the wider frame safely", () => {
    expect(css).toContain("--amd-page-gutter: clamp(16px, 4.6vw, 24px);");
    expect(rule(".amd-page")).toContain("max-width: var(--amd-app-max-w);");
    expect(rule(".amd-page")).toContain("padding-left: max(var(--amd-page-gutter), env(safe-area-inset-left));");
    expect(rule(".amd-page")).toContain("padding-right: max(var(--amd-page-gutter), env(safe-area-inset-right));");
    expect(rule(".amd-nav")).toContain("max-width: calc(var(--amd-app-max-w) - (var(--amd-page-gutter) * 2));");
  });

  it("keeps height content-driven rather than locking to the 921px reference", () => {
    expect(rule(".amd-shell")).toContain("min-height: 100dvh;");
    expect(css).not.toContain("height: 921px");
  });
});
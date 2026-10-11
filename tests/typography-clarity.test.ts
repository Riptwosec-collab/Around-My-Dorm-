import fs from "node:fs";
import { describe, expect, it } from "vitest";

const read = (f: string) => fs.readFileSync(f, "utf8");
const css = read("app/typography-clarity.css");
const base = read("app/globals.css");
const layout = read("app/layout.tsx");

describe("global high-legibility typography", () => {
  it("loads accessibility typography after all existing premium CSS", () => {
    expect(layout).toContain('import "./typography-clarity.css";');
    expect(layout.indexOf('import "./typography-clarity.css";')).toBeGreaterThan(layout.indexOf('import "./render-stability.css";'));
  });
  it("increases small text across all pages and admin without changing source content", () => {
    expect(css).toContain('body [class~="text-[8px]"]');
    expect(css).toContain('body [class~="text-[9px]"] { font-size: 12px; }');
    expect(css).toContain('body [class~="text-[10px]"] { font-size: 12.5px; }');
    expect(css).toContain('body [class~="text-[11px]"] { font-size: 13px; }');
    expect(css).toContain('body [class~="text-[12px]"] { font-size: 14px; }');
    expect(css).toContain(".amd-place-card h3");
    expect(css).toContain(".amd-admin-tabs button");
    expect(css).toContain(".amd-nav .amd-nav-item");
  });
  it("uses legible contrast in both themes with a Thai-capable font stack", () => {
    expect(base).toContain("--amd-text-3: #9fadc3;");
    expect(base).toContain("--amd-text-3: #596b82;");
    expect(base).toContain('"Noto Sans Thai"');
    expect(css).toContain(':root[data-theme="light"]');
  });
  it("keeps tiny phone cards readable without horizontal clipping", () => {
    expect(css).toContain("@media (max-width: 374px)");
    expect(css).toContain("flex-direction: column;");
    expect(css).toContain("overflow-wrap: anywhere;");
  });
});

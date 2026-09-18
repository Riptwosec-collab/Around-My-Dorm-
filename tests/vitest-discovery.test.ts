import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("Vitest test discovery", () => {
  it("includes both TypeScript and TSX test files", () => {
    const source = fs.readFileSync("vitest.config.ts", "utf8");

    expect(source).toMatch(/tests\/\*\*\/\*\.test\.ts/);
    expect(source).toMatch(/tests\/\*\*\/\*\.test\.tsx/);
  });
});

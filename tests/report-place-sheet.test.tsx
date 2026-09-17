import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("components/ReportPlaceSheet.tsx", "utf8");

describe("ReportPlaceSheet cloud reporting", () => {
  it("uses the Supabase report client and stable enums", () => {
    expect(source).toContain('submitPlaceReport');
    expect(source).toContain('type PlaceReportType');
    expect(source).toContain('opening_hours');
    expect(source).toContain('parking');
  });

  it("does not use the old localStorage demo", () => {
    expect(source).not.toContain("around-dorm-place-reports-v1");
    expect(source).not.toContain("localStorage");
  });

  it("limits notes and handles accepted duplicate and rate-limited outcomes", () => {
    expect(source).toContain('maxLength={500}');
    expect(source).toContain('result.status === "duplicate"');
    expect(source).toContain('result.status === "rate_limited"');
    expect(source).toContain('result.status === "accepted"');
  });

  it("supports Thai and English copy", () => {
    expect(source).toContain('language = "th"');
    expect(source).toContain('"Report incorrect data"');
    expect(source).toContain('"รายงานข้อมูลผิด"');
  });
});

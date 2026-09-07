import { describe, expect, it } from "vitest";
import { bangkokDateKey, getTodayRecentStats } from "@/lib/storage/recent";
import type { Place } from "@/types/place";
const place = { id: "p1", category: "cafe", area: "ลาดพร้าว" } as Place;
describe("recent history Thailand day grouping", () => {
  it("uses Asia/Bangkok local day", () => { expect(bangkokDateKey(new Date("2026-09-07T17:30:00Z"))).toBe("2026-09-08"); });
  it("counts only today's unique places/categories/areas", () => {
    const now = new Date("2026-09-08T05:00:00Z");
    const stats = getTodayRecentStats([{ placeId: "p1", viewedAt: "2026-09-08T04:00:00Z" }, { placeId: "p1", viewedAt: "2026-09-08T03:00:00Z" }, { placeId: "p1", viewedAt: "2026-09-06T03:00:00Z" }], [place], now);
    expect(stats.viewCount).toBe(2); expect(stats.placeCount).toBe(1); expect(stats.categoryCount).toBe(1); expect(stats.areaCount).toBe(1);
  });
});

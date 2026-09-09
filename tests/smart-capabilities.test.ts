import { describe, expect, it } from "vitest";
import { PLACES } from "@/data/places";
import { bangkokContextMode, comparePlaces, dormLifePlaces, emergencyPlaces, naturalIntentSummary, smartNearby, tripOrder } from "@/lib/smart-capabilities";
import { withDistance, DORM_CENTER } from "@/lib/place-utils";

describe("smart capabilities", () => {
  const places = PLACES.map((place) => withDistance(place, DORM_CENTER));

  it("returns a deterministic Bangkok context mode", () => {
    expect(bangkokContextMode(new Date("2026-09-10T05:00:00+07:00"))).toBe("breakfast");
    expect(bangkokContextMode(new Date("2026-09-10T23:00:00+07:00"))).toBe("late");
  });

  it("understands Thai natural constraints", () => {
    expect(naturalIntentSummary("ข้าวไม่เกิน 100 เปิดดึก ภายใน 1 กม.", "th")).toEqual(expect.arrayContaining(["food", "ไม่เกิน 100 บาท", "ภายใน 1 กม.", "เปิดดึก"]));
  });

  it("never invents places while ranking", () => {
    const ids = new Set(places.map((place) => place.id));
    const picks = smartNearby(places, {}, { limit: 5 });
    expect(picks.length).toBeLessThanOrEqual(5);
    expect(picks.every((item) => ids.has(item.place.id))).toBe(true);
  });

  it("limits comparison to four places", () => {
    expect(comparePlaces(places.slice(0, 8))).toHaveLength(4);
  });

  it("orders trip stops without creating route estimates", () => {
    const usable = places.filter((place) => place.latitude != null && place.longitude != null).slice(0, 5);
    const ordered = tripOrder(usable, DORM_CENTER);
    expect(ordered).toHaveLength(usable.length);
    expect(new Set(ordered.map((place) => place.id)).size).toBe(ordered.length);
  });

  it("derives dorm and emergency modes from stored categories only", () => {
    const ids = new Set(places.map((place) => place.id));
    expect(dormLifePlaces(places).every((place) => ids.has(place.id))).toBe(true);
    expect(emergencyPlaces(places).every((place) => ids.has(place.id))).toBe(true);
  });
});

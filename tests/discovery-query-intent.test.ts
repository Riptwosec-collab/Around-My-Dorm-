import { describe, expect, it } from "vitest";
import { parseDiscoveryQuery } from "@/lib/discovery/query-intent";

describe("parseDiscoveryQuery", () => {
  it("parses Thai category + budget + open-now intent", () => {
    expect(parseDiscoveryQuery("ข้าวไม่เกิน 80 เปิดอยู่")).toMatchObject({
      categoryIds: expect.arrayContaining(["food", "local_food", "thai_food"]),
      filterPatch: { maxPrice: 80, onlyOpen: true },
      freeText: "",
    });
  });

  it("parses cafe + walkable and keeps no fabricated route value", () => {
    expect(parseDiscoveryQuery("กาแฟเดินถึง")).toMatchObject({
      categoryIds: ["cafe"],
      filterPatch: { maxWalkingMinutes: 10 },
    });
  });

  it("parses mookata late-night intent", () => {
    expect(parseDiscoveryQuery("หมูกระทะเปิดดึก")).toMatchObject({
      categoryIds: ["mookata"],
      filterPatch: { openLate: true },
    });
  });

  it("parses parking and local intent", () => {
    expect(parseDiscoveryQuery("ร้าน local มีที่จอด")).toMatchObject({
      filterPatch: { localOnly: true, parking: true },
    });
  });

  it("normalizes Thai numerals", () => {
    expect(parseDiscoveryQuery("ไม่เกิน ๑๐๐ บาท").filterPatch.maxPrice).toBe(100);
  });

  it("keeps unrecognized words as free text", () => {
    expect(parseDiscoveryQuery("กาแฟ ร้านป้าสมใจ")).toMatchObject({
      categoryIds: ["cafe"],
      freeText: "ร้านป้าสมใจ",
    });
  });

  it("parses approved English phrases", () => {
    expect(parseDiscoveryQuery("coffee under 120 open now wifi work-friendly")).toMatchObject({
      categoryIds: ["cafe"],
      filterPatch: {
        maxPrice: 120,
        onlyOpen: true,
        wifi: true,
        goodForWorking: true,
      },
      freeText: "",
    });
  });

  it("suggests sort without silently applying it", () => {
    expect(parseDiscoveryQuery("กาแฟ ใกล้สุด").suggestedSortMode).toBe("distanceAsc");
    expect(parseDiscoveryQuery("อาหาร ราคาถูก").suggestedSortMode).toBe("price");
  });
});

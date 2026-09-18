import { describe, expect, it } from "vitest";
import { buildOpeningIntelligence } from "@/lib/opening-intelligence";

function status(overrides: Record<string, unknown> = {}) {
  return {
    status: "OPEN",
    isOpen: true,
    label: "เปิดอยู่",
    secondaryText: "ปิด 21:00",
    text: "เปิดอยู่ • ปิด 21:00",
    closesAt: "21:00",
    opensAt: null,
    nextOpenAt: null,
    tone: "green",
    ...overrides,
  } as any;
}

describe("buildOpeningIntelligence", () => {
  it("formats closing soon with exact minutes in Thai and English", () => {
    const nearClose = status({ status: "CLOSING_SOON", label: "ใกล้ปิด", tone: "amber" });
    expect(buildOpeningIntelligence(nearClose, new Date("2026-09-17T13:42:00.000Z"), "th")).toEqual({ primary: "ใกล้ปิด", secondary: "อีก 18 นาที", minutesUntilClose: 18, minutesUntilOpen: null });
    expect(buildOpeningIntelligence(nearClose, new Date("2026-09-17T13:42:00.000Z"), "en").secondary).toBe("18 min");
  });

  it("formats opening soon with exact minutes", () => {
    const nearOpen = status({ status: "OPENING_SOON", isOpen: false, closesAt: null, opensAt: "21:00", nextOpenAt: "21:00", label: "ใกล้เปิด" });
    expect(buildOpeningIntelligence(nearOpen, new Date("2026-09-17T13:48:00.000Z"), "th").secondary).toBe("อีก 12 นาที");
  });

  it("handles an overnight close without negative minutes", () => {
    const overnight = status({ status: "OPEN", closesAt: "02:00", secondaryText: "ปิด 02:00" });
    expect(buildOpeningIntelligence(overnight, new Date("2026-09-17T18:30:00.000Z"), "th").minutesUntilClose).toBe(30);
  });

  it("keeps regular open copy with its known closing time", () => {
    const result = buildOpeningIntelligence(status(), new Date("2026-09-17T12:00:00.000Z"), "th");
    expect(result.primary).toBe("เปิดอยู่");
    expect(result.secondary).toBe("ปิด 21:00");
  });
});

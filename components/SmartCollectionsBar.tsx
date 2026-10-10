"use client";

import { BriefcaseBusiness, Car, Clock3, MapPin, Moon, WalletCards } from "lucide-react";
import { explicitPriceCeiling } from "@/lib/place-ranking";
import { getPlaceOpenStatus } from "@/lib/place-utils";
import type { Place } from "@/types/place";

export type SmartCollectionKey = "open" | "cheap" | "near" | "late" | "parking" | "work" | null;

export function matchesSmartCollection(place: Place, key: SmartCollectionKey) {
  if (!key) return true;
  if (key === "open") return getPlaceOpenStatus(place).isOpen === true;
  if (key === "cheap") {
    const ceiling = explicitPriceCeiling(place);
    return ceiling != null && ceiling <= 100;
  }
  if (key === "near") return place.distanceKm != null && place.distanceKm <= 1;
  if (key === "late") return place.openLate === true || place.is24Hours;
  if (key === "parking") return place.parking.available === true || place.categories.includes("parking") || place.categories.includes("monthly_parking");
  if (key === "work") return place.goodForWorking === true || (place.categories.includes("cafe") && place.wifi === true);
  return true;
}

export function SmartCollectionsBar({
  places,
  selected,
  language,
  onSelect,
}: {
  places: Place[];
  selected: SmartCollectionKey;
  language: "th" | "en";
  onSelect: (key: SmartCollectionKey) => void;
}) {
  const items = [
    { key: "open" as const, icon: Clock3, th: "เปิดอยู่", en: "Open", count: places.filter((place) => matchesSmartCollection(place, "open")).length },
    { key: "cheap" as const, icon: WalletCards, th: "≤100 บาท", en: "≤100 THB", count: places.filter((place) => matchesSmartCollection(place, "cheap")).length },
    { key: "near" as const, icon: MapPin, th: "≤1 กม.", en: "≤1 km", count: places.filter((place) => matchesSmartCollection(place, "near")).length },
    { key: "late" as const, icon: Moon, th: "เปิดดึก", en: "Late", count: places.filter((place) => matchesSmartCollection(place, "late")).length },
    { key: "parking" as const, icon: Car, th: "มีที่จอด", en: "Parking", count: places.filter((place) => matchesSmartCollection(place, "parking")).length },
    { key: "work" as const, icon: BriefcaseBusiness, th: "นั่งทำงาน", en: "Work", count: places.filter((place) => matchesSmartCollection(place, "work")).length },
  ];

  if (!places.length) return null;

  return (
    <section className="mt-5" data-testid="smart-collections">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-cyan-200/70">SMART COLLECTIONS</p>
          <h3 className="mt-1 text-[15px] font-bold">{language === "en" ? "Auto collections" : "คอลเลกชันอัตโนมัติ"}</h3>
        </div>
        {selected && <button type="button" onClick={() => onSelect(null)} className="text-[10px] font-bold text-[#149CFF]">{language === "en" ? "Clear" : "ล้าง"}</button>}
      </div>
      <div className="-mx-4 mt-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max gap-2">
          {items.map((item) => {
            const active = selected === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onSelect(active ? null : item.key)}
                className={`amd-chip flex min-h-11 items-center gap-2 px-3 text-[9px] font-bold ${active ? "amd-chip-active" : ""}`}
              >
                <item.icon className="h-3.5 w-3.5" />
                <span>{language === "en" ? item.en : item.th}</span>
                <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[8px] text-[var(--amd-text-2)]">{item.count}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

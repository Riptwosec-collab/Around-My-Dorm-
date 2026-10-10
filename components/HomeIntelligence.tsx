"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Car, ChevronRight, Clock3, MapPin, Moon, Sparkles, Store, Utensils, WalletCards } from "lucide-react";
import { explicitPriceCeiling, recommendationReasons, sortPlaces, type RecommendationContext } from "@/lib/place-ranking";
import { formatDistance, formatPrice, getPlaceOpenStatus } from "@/lib/place-utils";
import type { Place } from "@/types/place";

function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const previous = useRef(value);

  useEffect(() => {
    const from = previous.current;
    previous.current = value;
    if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      return;
    }
    const started = performance.now();
    const duration = 430;
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (progress < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [value]);

  return <span className="amd-stat-number">{display}</span>;
}

function recentUpdate(place: Place) {
  const candidates = [place.lastUpdated, place.lastChecked, place.lastVerified].filter(Boolean) as string[];
  const latest = candidates
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];
  return latest || 0;
}

export function HomeIntelligence({
  places,
  language,
  recommendationContext,
  onQuery,
  onOpenPlace,
  onMapPlace,
}: {
  places: Place[];
  language: "th" | "en";
  recommendationContext: RecommendationContext;
  onQuery: (query: string) => void;
  onOpenPlace: (place: Place) => void;
  onMapPlace: (place: Place) => void;
}) {
  const [budget, setBudget] = useState<number | null>(100);
  const openPlaces = useMemo(() => places.filter((place) => getPlaceOpenStatus(place).isOpen === true), [places]);
  const nearPlaces = useMemo(() => places.filter((place) => place.distanceKm != null && place.distanceKm <= 1), [places]);
  const latePlaces = useMemo(() => places.filter((place) => place.is24Hours || place.openLate === true), [places]);
  const budgetPlaces = useMemo(() => {
    if (budget == null) return places;
    return places.filter((place) => {
      const ceiling = explicitPriceCeiling(place);
      return ceiling != null && ceiling <= budget;
    });
  }, [places, budget]);

  const picks = useMemo(() => {
    const source = budgetPlaces.filter((place) => getPlaceOpenStatus(place).isOpen !== false);
    return sortPlaces(source.length ? source : budgetPlaces, "recommended", recommendationContext).slice(0, 3);
  }, [budgetPlaces, recommendationContext]);

  const pulse = useMemo(() => {
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    return [...places]
      .filter((place) => recentUpdate(place) >= cutoff)
      .sort((a, b) => recentUpdate(b) - recentUpdate(a))
      .slice(0, 4);
  }, [places]);

  const quickActions = [
    { icon: Utensils, th: "กินอะไรดี", en: "Food now", query: "อาหาร เปิดอยู่ ไม่เกิน 100 บาท" },
    { icon: Clock3, th: "เปิดอยู่", en: "Open now", query: "เปิดอยู่ตอนนี้ ใกล้สุด" },
    { icon: WalletCards, th: "≤100 บาท", en: "≤100 THB", query: "อาหาร ไม่เกิน 100 บาท" },
    { icon: Moon, th: "เปิดดึก", en: "Open late", query: "อาหาร เปิดดึก" },
    { icon: Car, th: "ที่จอดรถ", en: "Parking", query: "ที่จอดรถ ใกล้สุด" },
  ];

  return (
    <section className="mt-5" data-testid="home-intelligence">
      <div className="amd-intelligence-hero amd-glass-strong amd-card overflow-hidden p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-cyan-300" />
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-cyan-200">FOR YOU NOW</p>
            </div>
            <h2 className="mt-1 text-[20px] font-extrabold tracking-[-0.03em]">{language === "en" ? "Useful around you right now" : "ตอนนี้รอบหอมีอะไรน่าไป"}</h2>
          </div>
          <div className="rounded-xl border border-emerald-300/10 bg-emerald-300/[0.05] px-2.5 py-1.5 text-[8px] font-bold text-emerald-100">
            <span className="amd-live-dot mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-300 align-middle" />
            <AnimatedNumber value={openPlaces.length} /> {language === "en" ? "open" : "เปิดอยู่"}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="amd-metric-card amd-depth-base rounded-2xl border p-3"><p className="text-[19px] font-bold"><AnimatedNumber value={nearPlaces.length} /></p><p className="mt-1 text-[8px] text-white/40">{language === "en" ? "≤1 km" : "ภายใน 1 กม."}</p></div>
          <div className="amd-metric-card amd-depth-base rounded-2xl border p-3"><p className="text-[19px] font-bold"><AnimatedNumber value={latePlaces.length} /></p><p className="mt-1 text-[8px] text-white/40">{language === "en" ? "late / 24h" : "เปิดดึก / 24ชม."}</p></div>
          <div className="amd-metric-card amd-depth-base rounded-2xl border p-3"><p className="text-[19px] font-bold"><AnimatedNumber value={budgetPlaces.length} /></p><p className="mt-1 text-[8px] text-white/40">{budget == null ? (language === "en" ? "any budget" : "ทุกงบ") : `≤ ฿${budget}`}</p></div>
        </div>

        <div className="-mx-4 mt-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max gap-2">
            {quickActions.map((action) => (
              <button key={action.query} type="button" onClick={() => onQuery(action.query)} className="amd-chip amd-micro-action flex min-h-11 items-center gap-2 px-3 text-[9px] font-bold">
                <action.icon className="h-3.5 w-3.5" />{language === "en" ? action.en : action.th}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <span className="text-[9px] text-white/40">{language === "en" ? "Budget" : "งบ"}</span>
          {[80, 100, 150, 300].map((value) => (
            <button key={value} type="button" onClick={() => setBudget(budget === value ? null : value)} className={`amd-micro-action rounded-lg px-2.5 py-1.5 text-[8px] font-bold ${budget === value ? "bg-[#149CFF] text-white shadow-[0_0_16px_rgba(20,156,255,.18)]" : "bg-white/[0.05] text-white/55"}`}>฿{value}</button>
          ))}
        </div>

        <div className="mt-4 space-y-2">
          {picks.map((place, index) => {
            const reason = recommendationReasons(place, recommendationContext, language).join(" · ");
            return (
              <article key={place.id} className="amd-intelligence-pick amd-depth-base rounded-2xl border p-3">
                <div className="flex items-start gap-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-cyan-300/12 bg-cyan-300/[0.06] text-[11px] font-extrabold text-cyan-100">{index + 1}</div>
                  <button type="button" onClick={() => onOpenPlace(place)} className="min-w-0 flex-1 text-left">
                    <p className="truncate text-[12px] font-bold">{place.name}</p>
                    <p className="mt-1 text-[9px] text-white/42">{formatDistance(place.distanceKm)} · {formatPrice(place)}</p>
                    {reason && <p className="mt-1 line-clamp-2 text-[8px] leading-4 text-cyan-100/70">{reason}</p>}
                  </button>
                  <button type="button" aria-label={language === "en" ? "Map" : "แผนที่"} onClick={() => onMapPlace(place)} className="amd-micro-action grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[0.045] text-cyan-300"><MapPin className="h-4 w-4" /></button>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <div className="amd-glass amd-card amd-depth-raised mt-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2"><Store className="h-4 w-4 text-[#149CFF]" /><h3 className="text-[13px] font-bold">{language === "en" ? "Neighborhood pulse" : "ความเคลื่อนไหวรอบหอ"}</h3></div>
          <span className="text-[8px] text-white/35">{language === "en" ? "last 14 days" : "14 วันล่าสุด"}</span>
        </div>
        {pulse.length ? (
          <div className="mt-3 space-y-2">
            {pulse.map((place) => (
              <button key={place.id} type="button" onClick={() => onOpenPlace(place)} className="amd-micro-action flex w-full items-center gap-3 rounded-xl bg-white/[0.025] px-3 py-2.5 text-left">
                <div className="amd-live-dot h-2 w-2 shrink-0 rounded-full bg-emerald-300" />
                <span className="min-w-0 flex-1 truncate text-[10px] font-semibold">{place.name}</span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/30" />
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-[9px] leading-4 text-white/38">{language === "en" ? "No newly verified place updates in the last 14 days." : "ยังไม่มีสถานที่ที่ยืนยัน/อัปเดตใหม่ในช่วง 14 วันล่าสุด"}</p>
        )}
      </div>
    </section>
  );
}

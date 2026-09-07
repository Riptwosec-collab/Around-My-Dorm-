"use client";

import { useEffect, useRef, useState } from "react";
import { Car, ChevronUp, Coffee, Navigation, ShieldCheck, Store, Utensils } from "lucide-react";
import { CATEGORY_MAP } from "@/data/categories";
import { getCopy } from "@/locales";
import { formatDistance, formatPrice, getPlaceOpenStatus, googleMapsDirectionsUrl } from "@/lib/place-utils";
import type { Language } from "@/types/app";
import type { Place } from "@/types/place";

type SheetSize = "collapsed" | "half" | "expanded";

function FallbackIcon({ place }: { place: Place }) {
  const common = "h-7 w-7 stroke-[1.7]";
  if (place.category === "cafe" || place.category === "bar") return <Coffee className={common} />;
  if (place.category === "parking" || place.category === "monthly_parking") return <Car className={common} />;
  if (["food", "local_food", "noodle", "thai_food", "isan_food", "mookata", "japanese", "korean_food", "vietnamese_food", "hotpot", "bbq", "chinese_food", "night_food"].includes(place.category)) return <Utensils className={common} />;
  return <Store className={common} />;
}

export function MapBottomSheet({ place, language, onDetails }: { place: Place; language: Language; onDetails: () => void }) {
  const copy = getCopy(language);
  const [size, setSize] = useState<SheetSize>("half");
  const startY = useRef<number | null>(null);
  const status = getPlaceOpenStatus(place);
  const category = CATEGORY_MAP[place.category];

  useEffect(() => setSize("half"), [place.id]);

  function endDrag(y: number) {
    if (startY.current == null) return;
    const delta = y - startY.current;
    startY.current = null;
    if (delta > 55) setSize((current) => current === "expanded" ? "half" : "collapsed");
    if (delta < -55) setSize((current) => current === "collapsed" ? "half" : "expanded");
  }

  const heightClass = size === "collapsed" ? "max-h-[132px]" : size === "half" ? "max-h-[316px]" : "max-h-[68dvh] overflow-y-auto";
  const imageSize = size === "collapsed" ? "h-[72px] w-[72px]" : "h-[104px] w-[104px]";

  return (
    <section
      className={`amd-glass-strong absolute bottom-3 left-3 right-3 rounded-[24px] p-3.5 transition-[max-height,transform,opacity] duration-[var(--motion-slow)] [transition-timing-function:var(--ease-spring)] ${heightClass}`}
      style={{ zIndex: "var(--z-map-controls)" }}
      aria-label={language === "en" ? "Selected place" : "สถานที่ที่เลือก"}
    >
      <button
        type="button"
        aria-label={language === "en" ? "Resize place sheet" : "ปรับขนาดแผงรายละเอียด"}
        onPointerDown={(event) => { startY.current = event.clientY; event.currentTarget.setPointerCapture?.(event.pointerId); }}
        onPointerUp={(event) => endDrag(event.clientY)}
        className="mx-auto mb-2 block h-6 w-20 touch-none"
      >
        <span className="mx-auto block h-1.5 w-12 rounded-full bg-white/18" />
      </button>

      <div className="flex gap-3">
        {place.coverImage || place.image ? (
          <img src={place.coverImage || place.image || ""} alt="" loading="lazy" decoding="async" className={`${imageSize} shrink-0 rounded-[16px] object-cover transition-[width,height] duration-[var(--motion-normal)]`} />
        ) : (
          <div className={`${imageSize} grid shrink-0 place-items-center rounded-[16px] border border-[rgba(120,160,210,.12)] bg-white/[0.035] text-[#8bbfe9] transition-[width,height] duration-[var(--motion-normal)]`}><FallbackIcon place={place} /></div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h3 className="min-w-0 flex-1 truncate text-[17px] font-bold tracking-[-0.015em]">{place.name}</h3>
            {place.verified && size !== "collapsed" && <span className="flex items-center gap-1 rounded-md border border-[rgba(0,229,195,.22)] px-2 py-1 text-[8px] font-bold text-[#00E5C3]"><ShieldCheck className="h-3 w-3" /> VERIFIED</span>}
          </div>
          <p className="mt-1 truncate text-[10px] text-[var(--amd-text-2)]">{category?.name} • {place.area}</p>
          <p className="mt-2 text-[11px]"><span className={`amd-status ${status.isOpen ? "text-[#00E5C3]" : status.tone === "amber" ? "text-[#FFC341]" : "text-[var(--amd-text-3)]"}`}>{status.label}</span>{status.secondaryText ? ` • ${status.secondaryText}` : ""}</p>
          <p className="mt-1 text-[10px] text-[var(--amd-text-2)]">{formatDistance(place.distanceKm)}{size !== "collapsed" ? ` • ${formatPrice(place)}${place.rating != null ? ` • ★ ${place.rating.toFixed(1)}${place.reviewCount != null ? ` (${place.reviewCount})` : ""}` : ""}` : ""}</p>

          {size !== "collapsed" && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={onDetails} className="amd-btn h-11 rounded-xl border border-[rgba(120,160,210,.2)] text-[10px] font-semibold">{copy.details}</button>
              <a href={googleMapsDirectionsUrl(place)} target="_blank" rel="noreferrer" className="amd-btn amd-btn-primary flex h-11 items-center justify-center gap-1.5 rounded-xl text-[10px] font-bold"><Navigation className="h-4 w-4" />{copy.navigate}</a>
            </div>
          )}
        </div>
      </div>

      {size === "expanded" && (
        <div className="mt-3 border-t border-[rgba(120,160,210,.12)] pt-3 text-[11px] leading-5 text-[var(--amd-text-2)]">
          <p>{place.shortDescription}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">{place.tags.slice(0, 6).map((tag) => <span key={tag} className="rounded-lg bg-white/[0.05] px-2 py-1 text-[9px]">{tag}</span>)}</div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-[9px] text-[var(--amd-text-3)]">
            <div><p>{language === "en" ? "Walk" : "เดิน"}</p><p className="mt-1 font-semibold text-[var(--amd-text)]">{place.walkingMinutes != null ? `${place.walkingMinutes} ${language === "en" ? "min" : "นาที"}` : copy.unknownRoute}</p></div>
            <div><p>{language === "en" ? "Drive" : "รถยนต์"}</p><p className="mt-1 font-semibold text-[var(--amd-text)]">{place.drivingMinutes != null ? `${place.drivingMinutes} ${language === "en" ? "min" : "นาที"}` : copy.unknownRoute}</p></div>
            <div><p>{language === "en" ? "Freshness" : "ข้อมูล"}</p><p className="mt-1 font-semibold text-[var(--amd-text)]">{place.verified ? "VERIFIED" : "UNVERIFIED"}</p></div>
          </div>
        </div>
      )}
      {size === "collapsed" && <ChevronUp className="pointer-events-none absolute right-4 top-3 h-4 w-4 text-[var(--amd-text-3)]" />}
    </section>
  );
}

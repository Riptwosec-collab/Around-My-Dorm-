"use client";

import { useEffect, useRef, useState } from "react";
import { Car, ChevronUp, Coffee, Navigation, ShieldCheck, Store, Utensils } from "lucide-react";
import { CATEGORY_MAP } from "@/data/categories";
import { PlacePhoto } from "@/components/PlacePhoto";
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
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startY = useRef<number | null>(null);
  const status = getPlaceOpenStatus(place);
  const category = CATEGORY_MAP[place.category];
  const typeBadge = place.placeType === "chain" || place.placeType === "franchise" ? "CHAIN" : place.placeType === "local" || place.placeType === "independent" ? "LOCAL" : null;
  const hiddenGem = place.tags.some((tag) => /hidden[ _-]?gem/i.test(tag));

  useEffect(() => {
    setSize("half");
    setDragOffset(0);
    setDragging(false);
    startY.current = null;
  }, [place.id]);

  function beginDrag(y: number) {
    startY.current = y;
    setDragging(true);
    setDragOffset(0);
  }

  function moveDrag(y: number) {
    if (startY.current == null) return;
    const delta = y - startY.current;
    setDragOffset(Math.max(-52, Math.min(84, delta)));
  }

  function endDrag(y: number) {
    if (startY.current == null) return;
    const delta = y - startY.current;
    startY.current = null;
    setDragging(false);
    setDragOffset(0);
    if (delta > 55) setSize((current) => current === "expanded" ? "half" : "collapsed");
    if (delta < -55) setSize((current) => current === "collapsed" ? "half" : "expanded");
  }

  const heightClass = size === "collapsed" ? "max-h-[132px]" : size === "half" ? "max-h-[316px]" : "max-h-[68dvh] overflow-y-auto";
  const imageSize = size === "collapsed" ? "h-[72px] w-[72px]" : "h-[104px] w-[104px]";

  return (
    <section
      data-snap={size}
      data-dragging={dragging ? "true" : "false"}
      className={`amd-map-sheet amd-glass-strong absolute bottom-3 left-3 right-3 rounded-[26px] p-3.5 ${heightClass}`}
      style={{
        zIndex: "var(--z-map-controls)",
        transform: dragOffset ? `translate3d(0, ${dragOffset}px, 0)` : undefined,
        transition: dragging ? "none" : undefined,
      }}
      aria-label={language === "en" ? "Selected place" : "สถานที่ที่เลือก"}
    >
      <button
        type="button"
        aria-label={language === "en" ? "Resize place sheet" : "ปรับขนาดแผงรายละเอียด"}
        onPointerDown={(event) => {
          beginDrag(event.clientY);
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={(event) => moveDrag(event.clientY)}
        onPointerUp={(event) => endDrag(event.clientY)}
        onPointerCancel={() => {
          startY.current = null;
          setDragging(false);
          setDragOffset(0);
        }}
        className="amd-map-sheet-handle -mt-1 mx-auto mb-1 grid h-11 w-24 touch-none place-items-center rounded-full"
      >
        <span className="mx-auto block h-1.5 w-12 rounded-full bg-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,.08)]" />
      </button>

      <div className="flex gap-3">
        <div className={`${imageSize} relative shrink-0 overflow-hidden rounded-[17px] border border-white/[0.045] transition-[width,height] duration-[var(--motion-normal)] [transition-timing-function:var(--ease-standard)]`}><PlacePhoto place={place} className="h-full w-full object-cover" /></div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h3 className="min-w-0 flex-1 line-clamp-2 text-[17px] font-bold leading-5 tracking-[-0.015em]">{place.name}</h3>
          </div>
          {size !== "collapsed" && (typeBadge || place.verified || hiddenGem) && <div className="mt-1.5 flex flex-wrap gap-1">{typeBadge && <span className="rounded-md border border-[rgba(20,156,255,.24)] px-1.5 py-0.5 text-[7px] font-bold text-[#62baff]">{typeBadge}</span>}{place.verified && <span className="flex items-center gap-1 rounded-md border border-[rgba(0,229,195,.22)] px-1.5 py-0.5 text-[7px] font-bold text-[#00E5C3]"><ShieldCheck className="h-2.5 w-2.5" /> VERIFIED</span>}{hiddenGem && <span className="rounded-md border border-[rgba(155,108,255,.28)] px-1.5 py-0.5 text-[7px] font-bold text-[#b995ff]">HIDDEN GEM</span>}</div>}
          <p className="mt-1 truncate text-[10px] text-[var(--amd-text-2)]">{category?.name} • {place.area}</p>
          <p className="mt-2 text-[11px]"><span className={`amd-status ${status.isOpen ? "text-[#00E5C3]" : status.tone === "amber" ? "text-[#FFC341]" : "text-[var(--amd-text-3)]"}`}>{status.label}</span>{status.secondaryText ? ` • ${status.secondaryText}` : ""}</p>
          <p className="mt-1 text-[10px] text-[var(--amd-text-2)]">{formatDistance(place.distanceKm)}{size !== "collapsed" ? ` • ${formatPrice(place)}${place.rating != null ? ` • ★ ${place.rating.toFixed(1)}${place.reviewCount != null ? ` (${place.reviewCount})` : ""}` : ""}` : ""}</p>

          {size !== "collapsed" && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={onDetails} className="amd-btn amd-btn-secondary h-11 rounded-xl text-[10px] font-semibold">{copy.details}</button>
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
      {size === "collapsed" && <ChevronUp className="pointer-events-none absolute right-4 top-4 h-4 w-4 text-[var(--amd-text-3)]" />}
    </section>
  );
}

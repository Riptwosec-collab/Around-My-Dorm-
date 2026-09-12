"use client";

import {
  BriefcaseBusiness,
  Car,
  Clock3,
  Coffee,
  Diamond,
  Dumbbell,
  Heart,
  MapPin,
  Navigation,
  Pill,
  Scissors,
  ShieldCheck,
  ShoppingBag,
  Star,
  Store,
  Utensils,
  WashingMachine,
} from "lucide-react";
import { CATEGORY_MAP } from "@/data/categories";
import { PlacePhoto } from "@/components/PlacePhoto";
import { getCopy } from "@/locales";
import {
  calculateLocalScore,
  formatDistance,
  formatPrice,
  getPlaceOpenStatus,
  googleMapsDirectionsUrl,
} from "@/lib/place-utils";
import { dataAgeLabel, scorePlaceDataQuality } from "@/lib/data-quality";
import type { CategoryId, Place } from "@/types/place";

function CategoryFallback({ category }: { category: CategoryId }) {
  const common = "h-8 w-8 stroke-[1.7]";
  if (["food", "local_food", "noodle", "thai_food", "isan_food", "mookata", "japanese", "korean_food", "vietnamese_food", "hotpot", "bbq", "chinese_food", "night_food"].includes(category)) return <Utensils className={common} />;
  if (category === "cafe" || category === "bar") return <Coffee className={common} />;
  if (category === "parking" || category === "monthly_parking") return <Car className={common} />;
  if (category === "pharmacy" || category === "clinic") return <Pill className={common} />;
  if (category === "fitness") return <Dumbbell className={common} />;
  if (category === "laundry") return <WashingMachine className={common} />;
  if (category === "shopping" || category === "supermarket" || category === "convenience") return <ShoppingBag className={common} />;
  if (category === "salon" || category === "barber") return <Scissors className={common} />;
  if (category === "service") return <BriefcaseBusiness className={common} />;
  return <Store className={common} />;
}

export function PlaceCard({
  place,
  saved,
  onSave,
  onDetail,
  onMap,
  contextMeta,
  language = "th",
}: {
  place: Place;
  saved: boolean;
  onSave: () => void;
  onDetail: () => void;
  onMap: () => void;
  contextMeta?: string;
  language?: "th" | "en";
}) {
  const category = CATEGORY_MAP[place.category];
  const status = getPlaceOpenStatus(place);
  const localScore = place.localScore ?? calculateLocalScore(place);
  const isLocal = place.placeType === "local" || place.placeType === "independent" || place.localFavorite;
  const isChain = place.placeType === "chain" || place.placeType === "franchise";
  const hiddenGem = isLocal && place.localFavorite && localScore != null && localScore >= 78;
  const price = formatPrice(place);
  const copy = getCopy(language);
  const dataQuality = scorePlaceDataQuality(place);
  const ageLabel = dataAgeLabel(place, language);

  const statusClass =
    status.tone === "green" || status.tone === "cyan"
      ? "text-[#00E5C3]"
      : status.tone === "red"
        ? "text-rose-300"
        : status.tone === "amber"
          ? "text-[#FFC341]"
          : "text-[var(--amd-text-3)]";

  return (
    <article className="amd-glass amd-card amd-place-card group overflow-hidden">
      <div className="flex min-h-[154px]">
        <div className="amd-place-card-media relative w-[35%] min-w-[112px] max-w-[190px] shrink-0 overflow-hidden bg-[#07111f]">
          <PlacePhoto place={place} fallbackLabel={language === "en" ? "No photo yet" : "ยังไม่มีรูป"} className="amd-place-card-photo h-full min-h-[154px] w-full object-cover contrast-[.98] saturate-[.94]" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-white/[0.025]" />
          <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/[0.04]" />
          <button
            type="button"
            aria-label={saved ? (language === "en" ? "Remove from saved" : "นำออกจากรายการโปรด") : (language === "en" ? "Save place" : "บันทึกร้าน")}
            aria-pressed={saved}
            onClick={onSave}
            className={`amd-btn amd-icon-btn amd-save-control absolute left-2.5 top-2.5 h-11 w-11 rounded-full ${saved ? "amd-save-control-active" : ""}`}
          >
            <Heart className={`amd-heart h-[18px] w-[18px] ${saved ? "amd-heart-saved fill-[#008CFF] text-[#58b8ff]" : "text-white/78"}`} />
          </button>
        </div>

        <div className="min-w-0 flex-1 p-3.5 sm:p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-[17px] font-bold tracking-[-0.018em] text-[var(--amd-text)] sm:text-[18px]">{place.name}</h3>
              <p className="mt-1 truncate text-[11px] leading-4 text-[var(--amd-text-2)]">
                {category?.name || (language === "en" ? "Place" : "สถานที่")}{place.area ? ` • ${place.area}` : ""}
              </p>
            </div>
            {contextMeta && <span className="shrink-0 text-[9px] text-[var(--amd-text-3)]">{contextMeta}</span>}
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {isLocal && <span className="rounded-md border border-[rgba(0,140,255,.3)] bg-[rgba(0,122,255,.07)] px-2 py-1 text-[9px] font-bold text-[#149CFF]">LOCAL</span>}
            {isChain && <span className="rounded-md border border-[rgba(155,108,255,.28)] bg-[rgba(155,108,255,.06)] px-2 py-1 text-[9px] font-bold text-[#b795ff]">CHAIN</span>}
            {place.verified && <span className="flex items-center gap-1 rounded-md border border-[rgba(0,229,195,.24)] bg-[rgba(0,229,195,.05)] px-2 py-1 text-[9px] font-bold text-[#00E5C3]"><ShieldCheck className="h-3 w-3" /> VERIFIED</span>}
            {hiddenGem && <span className="flex items-center gap-1 rounded-md border border-[rgba(0,229,195,.2)] bg-[rgba(0,229,195,.04)] px-2 py-1 text-[9px] font-bold text-[#49ead2]"><Diamond className="h-3 w-3" /> HIDDEN GEM</span>}
          </div>

          <div className="mt-2.5 space-y-1 text-[11px]">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className={`amd-status font-semibold ${statusClass}`}>{status.label}</span>
              {status.secondaryText && <><span className="text-[var(--amd-text-3)]">•</span><span className="text-[var(--amd-text-2)]">{status.secondaryText}</span></>}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[var(--amd-text-2)]">
              <span className="font-medium">{price}</span><span className="text-[var(--amd-text-3)]">•</span><span>{formatDistance(place.distanceKm)}</span>
            </div>
            {(place.walkingMinutes != null || place.distance?.motorcycleMinutes != null || place.drivingMinutes != null) && (
              <div className="flex flex-wrap items-center gap-2 text-[9px] leading-4 text-[var(--amd-text-3)]">
                {place.walkingMinutes != null && <span>{language === "en" ? "Walk" : "เดิน"} {place.walkingMinutes} {language === "en" ? "min" : "นาที"}</span>}
                {place.distance?.motorcycleMinutes != null && <span>{language === "en" ? "Motorcycle" : "มอเตอร์ไซค์"} {place.distance.motorcycleMinutes} {language === "en" ? "min" : "นาที"}</span>}
                {place.drivingMinutes != null && <span>{language === "en" ? "Drive" : "รถยนต์"} {place.drivingMinutes} {language === "en" ? "min" : "นาที"}</span>}
              </div>
            )}
          </div>

          <div className="mt-3 flex items-end justify-between gap-2">
            <div className="min-w-0 flex-1">
              {place.rating != null ? (
                <div className="flex items-center gap-1.5 text-[11px]">
                  <Star className="h-3.5 w-3.5 fill-[#FFC341] text-[#FFC341]" />
                  <span className="font-semibold text-[var(--amd-text)]">{place.rating.toFixed(1)}</span>
                  {place.reviewCount != null && <span className="text-[var(--amd-text-3)]">({place.reviewCount.toLocaleString()})</span>}
                </div>
              ) : (
                <button type="button" onClick={onDetail} className="flex min-h-11 items-center gap-1 text-[10px] font-semibold text-[#79bfff]"><Clock3 className="h-3 w-3" /> {copy.details}</button>
              )}
            </div>

            <div data-quality-mini className="hidden min-w-0 flex-1 flex-col gap-0.5 sm:flex"><span className="text-[9px] font-semibold text-[var(--amd-text-2)]">Data {dataQuality.score}/100</span><span className="truncate text-[8px] text-[var(--amd-text-3)]">{ageLabel}</span></div>

            <div className="flex shrink-0 gap-2">
              <button type="button" onClick={onDetail} className="amd-btn amd-btn-secondary hidden h-11 rounded-xl px-3 text-[10px] font-semibold sm:block">{copy.details}</button>
              <button type="button" onClick={onMap} aria-label={language === "en" ? "View on map" : "ดูบนแผนที่"} className="amd-btn amd-icon-btn h-11 w-11 rounded-xl text-[#00D9FF] sm:hidden"><MapPin className="h-4 w-4" /></button>
              <a href={googleMapsDirectionsUrl(place)} target="_blank" rel="noreferrer" className="amd-btn amd-btn-primary flex h-11 items-center justify-center gap-1.5 rounded-xl px-3.5 text-[10px] font-bold"><Navigation className="h-4 w-4" /> {copy.navigate}</a>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

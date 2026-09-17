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
import { buildOpeningIntelligence } from "@/lib/opening-intelligence";
import { getFieldFreshness } from "@/lib/place-freshness";
import {
  calculateLocalScore,
  formatDistance,
  formatPrice,
  getPlaceOpenStatus,
  googleMapsDirectionsUrl,
} from "@/lib/place-utils";
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
  recommendationReason,
  language = "th",
}: {
  place: Place;
  saved: boolean;
  onSave: () => void;
  onDetail: () => void;
  onMap: () => void;
  contextMeta?: string;
  recommendationReason?: string;
  language?: "th" | "en";
}) {
  const category = CATEGORY_MAP[place.category];
  const categoryBadges = Array.from(new Set<CategoryId>([place.category, ...(place.categories ?? [])]))
    .map((id) => CATEGORY_MAP[id])
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 3);
  const status = getPlaceOpenStatus(place);
  const openingIntelligence = buildOpeningIntelligence(status, new Date(), language);
  const openingFreshness = getFieldFreshness(place, "openingHours");
  const localScore = place.localScore ?? calculateLocalScore(place);
  const isLocal = place.placeType === "local" || place.placeType === "independent" || place.localFavorite;
  const isChain = place.placeType === "chain" || place.placeType === "franchise";
  const hiddenGem = isLocal && place.localFavorite && localScore != null && localScore >= 78;
  const price = formatPrice(place);
  const copy = getCopy(language);
  const contextualRecommendationReason = !recommendationReason && contextMeta?.includes(" • ") ? contextMeta : undefined;
  const reasonLine = recommendationReason ?? contextualRecommendationReason;
  const displayContextMeta = contextualRecommendationReason ? undefined : contextMeta;

  const statusClass =
    status.tone === "green" || status.tone === "cyan"
      ? "text-[#22f0cf]"
      : status.tone === "red"
        ? "text-rose-300"
        : status.tone === "amber"
          ? "text-[#FFD166]"
          : "text-[var(--amd-text-2)]";

  const freshnessWarning = openingFreshness.status === "stale"
    ? language === "en" ? "Opening hours may be outdated" : "เวลาเปิดอาจล้าสมัย"
    : openingFreshness.status === "aging"
      ? language === "en" ? "Opening hours should be rechecked soon" : "ควรตรวจเวลาเปิดอีกครั้งเร็ว ๆ นี้"
      : openingFreshness.status === "unknown"
        ? language === "en" ? "Opening hours not verified" : "เวลาเปิดยังไม่ยืนยัน"
        : null;

  return (
    <article className="amd-glass amd-card amd-place-card group min-w-0 overflow-hidden">
      <div className="flex min-h-[172px]">
        <div className="amd-place-card-media relative w-[34%] min-w-[116px] max-w-[190px] shrink-0 overflow-hidden bg-[#07111f]">
          <PlacePhoto place={place} fallbackLabel={language === "en" ? "No photo yet" : "ยังไม่มีรูป"} className="amd-place-card-photo h-full min-h-[172px] w-full object-cover contrast-[.99] saturate-[.96]" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-white/[0.03]" />
          <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/[0.05]" />
          <button
            type="button"
            aria-label={saved ? (language === "en" ? "Remove from saved" : "นำออกจากรายการโปรด") : (language === "en" ? "Save place" : "บันทึกร้าน")}
            aria-pressed={saved}
            onClick={onSave}
            className={`amd-btn amd-icon-btn amd-save-control absolute left-2.5 top-2.5 h-11 w-11 rounded-full ${saved ? "amd-save-control-active" : ""}`}
          >
            <Heart className={`amd-heart h-[18px] w-[18px] ${saved ? "amd-heart-saved fill-[#008CFF] text-[#58b8ff]" : "text-white/85"}`} />
          </button>
        </div>

        <div className="min-w-0 flex-1 p-4 sm:p-[18px]">
          <div className="flex items-start justify-between gap-2.5">
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-[18px] font-extrabold leading-6 tracking-[-0.015em] text-[var(--amd-text)] sm:text-[19px]">{place.name}</h3>
              <p className="mt-1 truncate text-[12px] font-medium leading-5 text-[var(--amd-text-2)]">
                {category?.name || (language === "en" ? "Place" : "สถานที่")}{place.area ? ` • ${place.area}` : ""}
              </p>
            </div>
            {displayContextMeta && <span className="shrink-0 rounded-md bg-white/[0.045] px-1.5 py-1 text-[10px] font-medium leading-none text-[var(--amd-text-2)]">{displayContextMeta}</span>}
          </div>

          <div data-testid="place-category-badges" className="mt-2 flex flex-wrap gap-1.5">
            {categoryBadges.map((item) => (
              <span key={item.id} className="inline-flex max-w-full items-center gap-1 rounded-md border border-[rgba(57,221,255,.18)] bg-[rgba(57,221,255,.055)] px-2 py-1 text-[10px] font-bold leading-none text-[#aeeeff]">
                <span aria-hidden="true" className="text-[11px]">{item.icon}</span>
                <span className="truncate">{item.name}</span>
              </span>
            ))}
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {isLocal && <span className="rounded-md border border-[rgba(0,140,255,.34)] bg-[rgba(0,122,255,.09)] px-2 py-1 text-[10px] font-extrabold tracking-[.02em] text-[#47b4ff]">LOCAL</span>}
            {isChain && <span className="rounded-md border border-[rgba(155,108,255,.3)] bg-[rgba(155,108,255,.08)] px-2 py-1 text-[10px] font-extrabold tracking-[.02em] text-[#c3a8ff]">CHAIN</span>}
            {place.verified && <span className="flex items-center gap-1 rounded-md border border-[rgba(0,229,195,.28)] bg-[rgba(0,229,195,.07)] px-2 py-1 text-[10px] font-extrabold text-[#3af1d6]"><ShieldCheck className="h-3 w-3" /> VERIFIED</span>}
            {hiddenGem && <span className="flex items-center gap-1 rounded-md border border-[rgba(0,229,195,.24)] bg-[rgba(0,229,195,.06)] px-2 py-1 text-[10px] font-extrabold text-[#6bf2de]"><Diamond className="h-3 w-3" /> HIDDEN GEM</span>}
          </div>

          <div className="mt-3 space-y-1.5 text-[12px] leading-5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className={`amd-status font-bold ${statusClass}`}>{openingIntelligence.primary}</span>
              {openingIntelligence.secondary && <><span className="text-[var(--amd-text-3)]">•</span><span className="font-medium text-[var(--amd-text-2)]">{openingIntelligence.secondary}</span></>}
            </div>
            {freshnessWarning && <p className="text-[10px] font-semibold leading-4 text-amber-200">{freshnessWarning}</p>}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[var(--amd-text-2)]">
              <span className="font-semibold text-[var(--amd-text)]">{price}</span><span className="text-[var(--amd-text-3)]">•</span><span className="font-semibold">{formatDistance(place.distanceKm)}</span>
            </div>
            {reasonLine && (
              <p data-testid="place-recommendation-reason" className="text-[11px] font-semibold leading-4 text-[#9bd2ff]">
                {reasonLine}
              </p>
            )}
            {(place.walkingMinutes != null || place.distance?.motorcycleMinutes != null || place.drivingMinutes != null) && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-medium leading-4 text-[var(--amd-text-2)]">
                {place.walkingMinutes != null && <span>{language === "en" ? "Walk" : "เดิน"} {place.walkingMinutes} {language === "en" ? "min" : "นาที"}</span>}
                {place.distance?.motorcycleMinutes != null && <span>{language === "en" ? "Motorcycle" : "มอเตอร์ไซค์"} {place.distance.motorcycleMinutes} {language === "en" ? "min" : "นาที"}</span>}
                {place.drivingMinutes != null && <span>{language === "en" ? "Drive" : "รถยนต์"} {place.drivingMinutes} {language === "en" ? "min" : "นาที"}</span>}
              </div>
            )}
          </div>

          <div className="mt-3 min-h-5">
            {place.rating != null ? (
              <div className="flex items-center gap-1.5 text-[12px]">
                <Star className="h-4 w-4 fill-[#FFD166] text-[#FFD166]" />
                <span className="font-bold text-[var(--amd-text)]">{place.rating.toFixed(1)}</span>
                {place.reviewCount != null && <span className="font-medium text-[var(--amd-text-2)]">({place.reviewCount.toLocaleString()})</span>}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-[10px] font-medium text-[var(--amd-text-3)]">
                <Clock3 className="h-3.5 w-3.5" />
                <span>{language === "en" ? "No rating yet" : "ยังไม่มีคะแนนรีวิว"}</span>
              </div>
            )}
          </div>

          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_44px_minmax(92px,1.15fr)] gap-2">
            <button type="button" onClick={onDetail} className="amd-btn amd-btn-secondary flex h-11 min-w-0 items-center justify-center rounded-xl px-2 text-[11px] font-bold leading-none">
              <span className="truncate">{copy.details}</span>
            </button>
            <button type="button" onClick={onMap} aria-label={language === "en" ? "View on map" : "ดูบนแผนที่"} className="amd-btn amd-icon-btn flex h-11 w-11 items-center justify-center rounded-xl text-[#39ddff]">
              <MapPin className="h-[17px] w-[17px]" />
            </button>
            <a href={googleMapsDirectionsUrl(place)} target="_blank" rel="noreferrer" className="amd-btn amd-btn-primary flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 text-[11px] font-extrabold leading-none">
              <Navigation className="h-[17px] w-[17px] shrink-0" />
              <span className="truncate">{copy.navigate}</span>
            </a>
          </div>
        </div>
      </div>
    </article>
  );
}
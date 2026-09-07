"use client";

import {
  Clock3,
  Diamond,
  Heart,
  MapPin,
  Navigation,
  ShieldCheck,
  Star,
} from "lucide-react";
import { CATEGORY_MAP } from "@/data/categories";
import {
  calculateLocalScore,
  formatDistance,
  formatPrice,
  getPlaceOpenStatus,
  googleMapsDirectionsUrl,
} from "@/lib/place-utils";
import type { Place } from "@/types/place";

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
  const navigateLabel = language === "en" ? "Navigate" : "นำทาง";
  const detailLabel = language === "en" ? "Details" : "รายละเอียด";

  const statusClass =
    status.tone === "green" || status.tone === "cyan"
      ? "text-[#00E5C3]"
      : status.tone === "red"
        ? "text-rose-300"
        : status.tone === "amber"
          ? "text-[#FFC341]"
          : "text-[var(--amd-text-3)]";

  return (
    <article className="amd-glass amd-card group overflow-hidden transition duration-200 hover:border-[rgba(0,140,255,.34)]">
      <div className="flex min-h-[154px]">
        <div className="relative w-[35%] min-w-[112px] max-w-[190px] shrink-0 overflow-hidden bg-[#07111f]">
          {place.coverImage || place.image ? (
            <img
              src={place.coverImage || place.image || ""}
              alt={place.name}
              loading="lazy"
              className="h-full min-h-[154px] w-full object-cover"
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
            />
          ) : (
            <div className="grid h-full min-h-[154px] place-items-center bg-[radial-gradient(circle_at_40%_30%,rgba(0,140,255,.14),transparent_34%),#07111f]">
              <div className="text-center">
                <span className="text-4xl">{category?.icon || "📍"}</span>
                <p className="mt-2 px-2 text-[9px] font-semibold text-[var(--amd-text-3)]">ยังไม่มีรูปยืนยัน</p>
              </div>
            </div>
          )}
          <button
            type="button"
            aria-label={saved ? "นำออกจากรายการโปรด" : "บันทึกร้าน"}
            onClick={onSave}
            className="amd-btn absolute left-2.5 top-2.5 grid h-10 w-10 min-h-0 place-items-center rounded-full border border-[rgba(120,160,210,.22)] bg-[#05101d]/80 shadow-lg backdrop-blur-xl"
          >
            <Heart className={`h-[18px] w-[18px] ${saved ? "fill-[#008CFF] text-[#149CFF] drop-shadow-[0_0_8px_rgba(0,140,255,.85)]" : "text-white/75"}`} />
          </button>
        </div>

        <div className="min-w-0 flex-1 p-3.5 sm:p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-[17px] font-bold tracking-[-0.025em] text-[var(--amd-text)] sm:text-[18px]">{place.name}</h3>
              <p className="mt-1 truncate text-[11px] text-[var(--amd-text-2)]">
                {category?.name || "สถานที่"}{place.area ? ` • ${place.area}` : ""}
              </p>
            </div>
            {contextMeta && <span className="shrink-0 text-[9px] text-[var(--amd-text-3)]">{contextMeta}</span>}
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {isLocal && (
              <span className="rounded-md border border-[rgba(0,140,255,.34)] bg-[rgba(0,122,255,.07)] px-2 py-1 text-[9px] font-bold text-[#149CFF]">LOCAL</span>
            )}
            {isChain && (
              <span className="rounded-md border border-[rgba(155,108,255,.32)] bg-[rgba(155,108,255,.07)] px-2 py-1 text-[9px] font-bold text-[#b795ff]">CHAIN</span>
            )}
            {place.verified && (
              <span className="flex items-center gap-1 rounded-md border border-[rgba(0,229,195,.28)] bg-[rgba(0,229,195,.055)] px-2 py-1 text-[9px] font-bold text-[#00E5C3]">
                <ShieldCheck className="h-3 w-3" /> VERIFIED
              </span>
            )}
            {hiddenGem && (
              <span className="flex items-center gap-1 rounded-md border border-[rgba(0,229,195,.25)] bg-[rgba(0,229,195,.045)] px-2 py-1 text-[9px] font-bold text-[#49ead2]">
                <Diamond className="h-3 w-3" /> HIDDEN GEM
              </span>
            )}
          </div>

          <div className="mt-2.5 space-y-1 text-[11px]">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className={`font-semibold ${statusClass}`}>{status.label}</span>
              {status.secondaryText && <><span className="text-[var(--amd-text-3)]">•</span><span className="text-[var(--amd-text-2)]">{status.secondaryText}</span></>}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[var(--amd-text-2)]">
              <span className="font-medium">{price}</span>
              <span className="text-[var(--amd-text-3)]">•</span>
              <span>{formatDistance(place.distanceKm)}</span>
            </div>
            {(place.walkingMinutes != null || place.distance?.motorcycleMinutes != null || place.drivingMinutes != null) && (
              <div className="flex flex-wrap items-center gap-2 text-[9px] text-[var(--amd-text-3)]">
                {place.walkingMinutes != null && <span>เดิน {place.walkingMinutes} นาที</span>}
                {place.distance?.motorcycleMinutes != null && <span>มอเตอร์ไซค์ {place.distance.motorcycleMinutes} นาที</span>}
                {place.drivingMinutes != null && <span>รถยนต์ {place.drivingMinutes} นาที</span>}
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
                <button type="button" onClick={onDetail} className="flex items-center gap-1 text-[10px] font-semibold text-[#79bfff]">
                  <Clock3 className="h-3 w-3" /> {detailLabel}
                </button>
              )}
            </div>

            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={onDetail}
                className="amd-btn hidden h-11 rounded-xl border border-[rgba(120,160,210,.2)] bg-[rgba(8,18,33,.62)] px-3 text-[10px] font-semibold text-[var(--amd-text-2)] sm:block"
              >
                {detailLabel}
              </button>
              <button
                type="button"
                onClick={onMap}
                aria-label="ดูบนแผนที่"
                className="amd-btn grid h-11 w-11 min-h-0 place-items-center rounded-xl border border-[rgba(0,140,255,.28)] bg-[rgba(0,122,255,.09)] text-[#00D9FF] sm:hidden"
              >
                <MapPin className="h-4 w-4" />
              </button>
              <a
                href={googleMapsDirectionsUrl(place)}
                target="_blank"
                rel="noreferrer"
                className="amd-btn amd-btn-primary flex h-11 items-center justify-center gap-1.5 rounded-xl px-3.5 text-[10px] font-bold"
              >
                <Navigation className="h-4 w-4" /> {navigateLabel}
              </a>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

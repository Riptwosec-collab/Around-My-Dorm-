"use client";

import { ArrowUpRight, Clock3, Heart, MapPin, Navigation, ShieldCheck, Star } from "lucide-react";
import { CATEGORY_MAP } from "@/data/categories";
import {
  calculateLocalScore,
  formatDistance,
  getPlaceOpenStatus,
  googleMapsDirectionsUrl,
  formatPrice,
} from "@/lib/place-utils";
import type { Place } from "@/types/place";

export function PlaceCard({
  place,
  saved,
  onSave,
  onDetail,
  onMap,
}: {
  place: Place;
  saved: boolean;
  onSave: () => void;
  onDetail: () => void;
  onMap: () => void;
}) {
  const category = CATEGORY_MAP[place.category];
  const status = getPlaceOpenStatus(place);
  const localScore = place.localScore ?? calculateLocalScore(place);
  const isLocal = place.placeType === "local" || place.placeType === "independent" || place.localFavorite;

  return (
    <article className="overflow-hidden rounded-[26px] border border-white/[0.08] bg-white/[0.045] shadow-[0_18px_65px_rgba(0,0,0,.28)] backdrop-blur-2xl">
      <div className="relative h-[164px] overflow-hidden bg-gradient-to-br from-[#101b2c] to-[#07101b]">
        {place.coverImage || place.image ? (
          <img
            src={place.coverImage || place.image || ""}
            alt={place.name}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full place-items-center">
            <div className="text-center">
              <span className="text-5xl opacity-90">{category?.icon || "📍"}</span>
              <p className="mt-2 text-[10px] font-bold text-white/35">ยังไม่มีรูปยืนยัน</p>
            </div>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#07101b]/95 via-transparent to-black/10" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-2 pr-14">
          {isLocal && (
            <span className="rounded-full border border-pink-300/20 bg-pink-500/85 px-2.5 py-1.5 text-[9px] font-black">
              LOCAL
            </span>
          )}
          {place.placeType === "chain" && (
            <span className="rounded-full border border-white/10 bg-black/45 px-2.5 py-1.5 text-[9px] font-black text-white/70 backdrop-blur-xl">
              CHAIN
            </span>
          )}
          {localScore != null && localScore >= 78 && isLocal && (
            <span className="rounded-full border border-amber-300/20 bg-amber-300/15 px-2.5 py-1.5 text-[9px] font-black text-amber-100 backdrop-blur-xl">
              🔥 LOCAL PICK {localScore}
            </span>
          )}
          {place.verified && (
            <span className="flex items-center gap-1 rounded-full border border-emerald-300/20 bg-emerald-400/15 px-2.5 py-1.5 text-[9px] font-black text-emerald-200 backdrop-blur-xl">
              <ShieldCheck className="h-3 w-3" /> VERIFIED
            </span>
          )}
        </div>
        <button
          type="button"
          aria-label={saved ? "นำออกจากรายการโปรด" : "บันทึกร้าน"}
          onClick={onSave}
          className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-black/40 backdrop-blur-xl"
        >
          <Heart className={`h-[18px] w-[18px] ${saved ? "fill-pink-400 text-pink-300" : "text-white"}`} />
        </button>

        <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="mb-1 text-[10px] font-bold text-cyan-100/70">
              {category?.name || "สถานที่"} • {place.area}
            </p>
            <h3 className="truncate text-[17px] font-black tracking-[-0.02em]">{place.name}</h3>
          </div>
          {place.rating != null && (
            <div className="flex shrink-0 items-center gap-1 rounded-xl border border-white/10 bg-black/45 px-2.5 py-1.5 backdrop-blur-xl">
              <Star className="h-3.5 w-3.5 fill-cyan-300 text-cyan-300" />
              <span className="text-xs font-bold">{place.rating.toFixed(1)}</span>
              {place.reviewCount != null && (
                <span className="text-[9px] text-white/45">({place.reviewCount.toLocaleString()})</span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="p-4">
        <div className="grid gap-2 text-[11px] text-white/58">
          <div className="flex flex-wrap items-center gap-2">
            <Navigation className="h-3.5 w-3.5 text-cyan-300" />
            <b className="text-white/85">{formatDistance(place.distanceKm)}</b>
            {place.walkingMinutes != null && <span>🚶 {place.walkingMinutes} นาที</span>}
            {place.distance?.motorcycleMinutes != null && <span>🏍 {place.distance.motorcycleMinutes} นาที</span>}
            {place.drivingMinutes != null && <span>🚗 {place.drivingMinutes} นาที</span>}
          </div>
          <div className="flex items-center gap-2">
            <Clock3 className="h-3.5 w-3.5 text-white/40" />
            <span
              className={
                status.tone === "green"
                  ? "font-bold text-emerald-300"
                  : status.tone === "red"
                    ? "font-bold text-rose-300"
                    : status.tone === "cyan"
                      ? "font-bold text-cyan-300"
                      : status.tone === "amber"
                        ? "font-bold text-amber-200"
                        : "text-white/45"
              }
            >
              {status.label}{status.secondaryText ? ` · ${status.secondaryText}` : ""}
            </span>
          </div>
          <div className="truncate text-[10px] font-semibold text-white/52">{formatPrice(place)}</div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {place.tags.slice(0, 4).map((tag) => (
            <span key={tag} className="rounded-lg border border-white/[0.07] bg-white/[0.04] px-2 py-1 text-[9px] text-white/58">
              {tag}
            </span>
          ))}
          {!place.verified && (
            <span className="rounded-lg border border-amber-200/10 bg-amber-300/[0.06] px-2 py-1 text-[9px] text-amber-100/65">
              รายละเอียดยังไม่ยืนยัน
            </span>
          )}
        </div>

        <div className="mt-4 grid grid-cols-[1fr_1fr_auto] gap-2">
          <button type="button" onClick={onDetail} className="h-11 rounded-2xl border border-white/10 bg-white/[0.055] text-[11px] font-black">
            ดูรายละเอียด
          </button>
          <button type="button" onClick={onMap} className="flex h-11 items-center justify-center gap-1.5 rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.10] text-[11px] font-black text-cyan-200">
            <MapPin className="h-3.5 w-3.5" /> แผนที่
          </button>
          <a
            aria-label={`นำทางไป ${place.name}`}
            href={googleMapsDirectionsUrl(place)}
            target="_blank"
            rel="noreferrer"
            className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/[0.055]"
          >
            <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </article>
  );
}

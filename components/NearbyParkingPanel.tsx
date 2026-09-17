"use client";

import { useMemo, useState } from "react";
import { Car, ChevronDown, MapPin, Navigation, ShieldCheck } from "lucide-react";
import { rankNearbyParking } from "@/lib/discovery/parking-match";
import { googleMapsDirectionsFallbackUrl } from "@/lib/google-maps-links";
import type { Place } from "@/types/place";

function distanceLabel(distanceKm: number, language: "th" | "en") {
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} ${language === "en" ? "m" : "ม."}`;
  return `${distanceKm.toFixed(1)} ${language === "en" ? "km" : "กม."}`;
}

function priceLabel(place: Place, language: "th" | "en") {
  const details = place.parkingDetails;
  if (!details) return language === "en" ? "Price unknown" : "ยังไม่มีข้อมูลราคา";
  if (details.hourlyPrice != null) return language === "en" ? `${details.hourlyPrice.toLocaleString()} THB/hr` : `${details.hourlyPrice.toLocaleString()} บาท/ชม.`;
  if (details.dailyPrice != null) return language === "en" ? `${details.dailyPrice.toLocaleString()} THB/day` : `${details.dailyPrice.toLocaleString()} บาท/วัน`;
  if (details.monthlyPrice != null) return language === "en" ? `${details.monthlyPrice.toLocaleString()} THB/month` : `${details.monthlyPrice.toLocaleString()} บาท/เดือน`;
  return language === "en" ? "Price unknown" : "ยังไม่มีข้อมูลราคา";
}

function availabilityLabel(place: Place, language: "th" | "en") {
  const status = place.parkingDetails?.availabilityStatus ?? "unknown";
  if (status === "available") return language === "en" ? "Availability verified" : "ยืนยันว่ามีที่ว่าง";
  if (status === "full") return language === "en" ? "Reported full" : "รายงานว่าเต็ม";
  if (status === "call_to_confirm") return language === "en" ? "Call to confirm availability" : "โทรยืนยันที่ว่าง";
  return language === "en" ? "Availability not verified" : "สถานะที่ว่างยังไม่ยืนยัน";
}

export function NearbyParkingPanel({
  target,
  places,
  language,
  onSearchMore,
}: {
  target: Place;
  places: Place[];
  language: "th" | "en";
  onSearchMore?: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const allMatches = useMemo(() => rankNearbyParking(target, places, { limit: Math.max(places.length, 3) }), [target, places]);
  const matches = showAll ? allMatches : allMatches.slice(0, 3);
  const copy = language === "en"
    ? { title: "Parking near this place", empty: "No verified local parking nearby yet", details: "View details", directions: "Directions", all: "View all parking", collapse: "Show less", more: "Find more parking", walk: "Walk" }
    : { title: "ที่จอดใกล้ร้าน", empty: "ยังไม่มีข้อมูลที่จอดใกล้ร้านในฐานข้อมูล", details: "ดูรายละเอียด", directions: "นำทาง", all: "ดูที่จอดทั้งหมด", collapse: "ย่อรายการ", more: "ค้นหาที่จอดเพิ่ม", walk: "เดิน" };

  return (
    <section data-testid="nearby-parking-panel" className="mt-4 rounded-[24px] border border-white/[0.07] bg-white/[0.035] p-4">
      <div className="flex items-center gap-2">
        <Car className="h-4 w-4 text-cyan-200" />
        <p className="text-[11px] font-bold text-white/85">{copy.title}</p>
      </div>

      {matches.length ? (
        <div className="mt-3 space-y-2">
          {matches.map((match) => {
            const details = match.place.parkingDetails;
            const expanded = expandedId === match.place.id;
            return (
              <article key={match.place.id} data-testid="parking-match" className="rounded-2xl border border-white/[0.065] bg-black/10 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-bold text-white/85">{match.place.name}</p>
                    <p className="mt-1 text-[9px] text-white/45">{distanceLabel(match.distanceKm, language)} • {priceLabel(match.place, language)}</p>
                    <p className="mt-1 text-[9px] text-white/45">{availabilityLabel(match.place, language)}</p>
                    {match.walkingMinutes != null && <p className="mt-1 text-[9px] font-semibold text-cyan-100">{copy.walk} {match.walkingMinutes} {language === "en" ? "min" : "นาที"}</p>}
                  </div>
                  {details?.access24Hours === true && <span className="shrink-0 rounded-lg border border-cyan-300/10 bg-cyan-300/[0.05] px-2 py-1 text-[8px] font-bold text-cyan-100">24H</span>}
                </div>

                {expanded && (
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[8px] text-white/48">
                    {details?.coveredParking === true && <span>Covered</span>}
                    {details?.cctv === true && <span>CCTV</span>}
                    {details?.securityGuard === true && <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3" />Security</span>}
                    {details?.overnightAllowed === true && <span>{language === "en" ? "Overnight" : "ค้างคืนได้"}</span>}
                    {details?.evCharging === true && <span>EV</span>}
                  </div>
                )}

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setExpandedId((current) => current === match.place.id ? null : match.place.id)} className="min-h-10 rounded-xl border border-white/[0.07] bg-white/[0.035] px-2 text-[9px] font-bold text-white/65">
                    {copy.details}
                  </button>
                  <a href={googleMapsDirectionsFallbackUrl(match.place)} target="_blank" rel="noreferrer" className="flex min-h-10 items-center justify-center gap-1 rounded-xl border border-cyan-300/12 bg-cyan-300/[0.06] px-2 text-[9px] font-bold text-cyan-100">
                    <Navigation className="h-3.5 w-3.5" />{copy.directions}
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mt-3 flex items-start gap-2 rounded-2xl border border-white/[0.06] bg-black/10 p-3 text-[9px] leading-4 text-white/42">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />{copy.empty}
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setShowAll((current) => !current)} disabled={allMatches.length <= 3} className="flex min-h-11 items-center justify-center gap-1 rounded-xl border border-white/[0.07] bg-white/[0.03] px-2 text-[9px] font-bold text-white/58 disabled:opacity-35">
          <ChevronDown className={`h-3.5 w-3.5 ${showAll ? "rotate-180" : ""}`} />{showAll ? copy.collapse : copy.all}
        </button>
        <button type="button" onClick={onSearchMore} className="min-h-11 rounded-xl border border-cyan-300/12 bg-cyan-300/[0.06] px-2 text-[9px] font-bold text-cyan-100">
          {copy.more}
        </button>
      </div>
    </section>
  );
}

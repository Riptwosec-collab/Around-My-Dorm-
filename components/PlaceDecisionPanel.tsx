"use client";

import { useState } from "react";
import { AlertTriangle, Clock3, MapPin, WalletCards } from "lucide-react";
import { NearbyParkingPanel } from "@/components/NearbyParkingPanel";
import { PlaceEtaPanel } from "@/components/PlaceEtaPanel";
import { ReportPlaceSheet } from "@/components/ReportPlaceSheet";
import { buildOpeningIntelligence } from "@/lib/opening-intelligence";
import { formatDisplayDistance, formatDisplayPrice } from "@/lib/place-display-format";
import { formatFreshnessLabel, getFieldFreshness } from "@/lib/place-freshness";
import { getPlaceOpenStatus } from "@/lib/place-utils";
import type { Place } from "@/types/place";

function SignalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/[0.055] py-2.5 last:border-0">
      <span className="text-[9px] text-white/38">{label}</span>
      <span className="max-w-[64%] text-right text-[9px] font-semibold text-white/72">{value}</span>
    </div>
  );
}

export function PlaceDecisionPanel({
  place,
  allPlaces,
  language,
}: {
  place: Place;
  allPlaces: Place[];
  language: "th" | "en";
}) {
  const [reportOpen, setReportOpen] = useState(false);
  const openStatus = getPlaceOpenStatus(place);
  const opening = buildOpeningIntelligence(openStatus, new Date(), language);
  const openingFreshness = getFieldFreshness(place, "openingHours");
  const priceFreshness = getFieldFreshness(place, "price");
  const parkingFreshness = getFieldFreshness(place, "parking");
  const straightLineDistance = place.straightLineDistanceKm ?? place.distanceKm;

  const copy = language === "en"
    ? {
        eyebrow: "DECISION INTELLIGENCE",
        title: "Quick decision",
        freshness: "Data freshness",
        opening: "Opening hours",
        price: "Price",
        parking: "Parking",
        straight: "Straight-line distance",
        report: "Report incorrect data",
      }
    : {
        eyebrow: "DECISION INTELLIGENCE",
        title: "ข้อมูลช่วยตัดสินใจ",
        freshness: "ความสดของข้อมูล",
        opening: "เวลาเปิด",
        price: "ราคา",
        parking: "ที่จอดรถ",
        straight: "ระยะเส้นตรง",
        report: "รายงานข้อมูลผิด",
      };

  return (
    <section data-testid="place-decision-panel" className="mt-4">
      <div className="rounded-[24px] border border-cyan-300/10 bg-cyan-300/[0.035] p-4">
        <p className="text-[8px] font-bold uppercase tracking-[0.18em] text-cyan-200/65">{copy.eyebrow}</p>
        <div className="mt-1 flex items-center gap-2">
          <Clock3 className="h-4 w-4 text-cyan-200" />
          <h3 className="text-[12px] font-bold text-white/88">{copy.title}</h3>
        </div>

        <div className="mt-3 rounded-2xl border border-white/[0.06] bg-black/10 px-3">
          <SignalRow label={copy.opening} value={`${opening.primary}${opening.secondary ? ` · ${opening.secondary}` : ""}`} />
          <SignalRow label={copy.price} value={formatDisplayPrice(place, language)} />
          <SignalRow label={copy.straight} value={formatDisplayDistance(straightLineDistance, language)} />
        </div>

        <div className="mt-3 rounded-2xl border border-white/[0.06] bg-black/10 p-3">
          <div className="flex items-center gap-2">
            <WalletCards className="h-3.5 w-3.5 text-cyan-200" />
            <p className="text-[9px] font-bold text-white/68">{copy.freshness}</p>
          </div>
          <div className="mt-2">
            <SignalRow label={copy.opening} value={formatFreshnessLabel(openingFreshness, language)} />
            <SignalRow label={copy.price} value={formatFreshnessLabel(priceFreshness, language)} />
            <SignalRow label={copy.parking} value={formatFreshnessLabel(parkingFreshness, language)} />
          </div>
        </div>

        <div className="mt-3 flex items-start gap-2 rounded-2xl border border-white/[0.055] bg-white/[0.025] p-3 text-[8px] leading-4 text-white/38">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-200/70" />
          <span>{language === "en" ? "Straight-line distance is not a travel-time estimate. Use the route calculator for live ETA." : "ระยะเส้นตรงไม่ใช่เวลาเดินทาง ใช้ตัวคำนวณเส้นทางเมื่อต้องการ ETA จริง"}</span>
        </div>
      </div>

      <PlaceEtaPanel place={place} language={language} />
      <NearbyParkingPanel target={place} places={allPlaces} language={language} />

      <button type="button" onClick={() => setReportOpen(true)} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-amber-300/12 bg-amber-300/[0.045] text-[10px] font-bold text-amber-100">
        <AlertTriangle className="h-4 w-4" />{copy.report}
      </button>

      {reportOpen && <ReportPlaceSheet place={place} onClose={() => setReportOpen(false)} language={language} />}
    </section>
  );
}

"use client";

import { AlertTriangle, CheckCircle2, MapPin, Route, Store } from "lucide-react";
import { buildPlatformDiagnostics } from "@/lib/hybrid-map-platform";
import type { Place } from "@/types/place";

export function AdminPlatformDiagnostics({ places, language }: { places: Place[]; language: "th" | "en" }) {
  const d = buildPlatformDiagnostics(places);
  const cards = [
    [language === "en" ? "All places" : "ร้านทั้งหมด", d.total, Store],
    [language === "en" ? "Matched" : "มี Place ID", d.matched, CheckCircle2],
    [language === "en" ? "Coordinates" : "มีพิกัด", d.coordinates, MapPin],
    [language === "en" ? "Markers" : "Marker พร้อม", d.markers, MapPin],
    [language === "en" ? "Missing coords" : "ขาดพิกัด", d.missingCoordinates, AlertTriangle],
    [language === "en" ? "Route places" : "มี Routes", d.routePlaces, Route],
  ] as const;

  return (
    <section data-testid="admin-platform-diagnostics" className="amd-glass amd-card mt-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#00D9FF]">PLATFORM DIAGNOSTICS</p>
          <p className="mt-1 text-[9px] leading-5 text-white/48">
            {language === "en" ? "Cloud/read-only coverage check. This panel never sends Google requests." : "ตรวจ Coverage จากข้อมูล Cloud แบบ Read-only • หน้านี้ไม่ยิง Google API"}
          </p>
        </div>
        <span className={`rounded-full px-2 py-1 text-[8px] font-bold ${d.total === 91 ? "bg-emerald-300/10 text-emerald-200" : "bg-amber-300/10 text-amber-100"}`}>
          {d.total}/91
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {cards.map(([label, value, Icon]) => (
          <div key={label} className="rounded-2xl border border-white/[0.06] bg-black/10 p-3">
            <div className="flex items-center justify-between gap-2"><p className="text-[8px] text-white/38">{label}</p><Icon className="h-3.5 w-3.5 text-[#8ecbff]" /></div>
            <p className="mt-1 text-[18px] font-bold">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-2xl border border-white/[0.06] bg-black/10 p-3 text-[8px] leading-5 text-white/48">
        <p>{language === "en" ? "Duplicate Google Place IDs" : "Google Place ID ซ้ำ"}: <strong className={d.duplicateGooglePlaceIds.length ? "text-amber-100" : "text-emerald-200"}>{d.duplicateGooglePlaceIds.length}</strong></p>
        {d.duplicateGooglePlaceIds.length > 0 && <p className="mt-1 break-all text-amber-100">{d.duplicateGooglePlaceIds.join(", ")}</p>}
        <p>{language === "en" ? "Cached route modes" : "Route modes ที่มีข้อมูล"}: <strong className="text-white/75">{d.routeModes}</strong></p>
      </div>
    </section>
  );
}

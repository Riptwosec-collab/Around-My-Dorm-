"use client";

import { useState } from "react";
import { ExternalLink, LoaderCircle, RefreshCw, Star } from "lucide-react";
import { fetchGoogleLiveDetails, type GoogleLiveDetails } from "@/lib/google-live";
import type { Place } from "@/types/place";

export function GoogleLiveEnrichment({ place, language }: { place: Place; language: "th" | "en" }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const [live, setLive] = useState<GoogleLiveDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!place.googlePlaceId || !apiKey) return null;

  async function loadLive() {
    setLoading(true);
    setError(null);
    try {
      setLive(await fetchGoogleLiveDetails(apiKey, place.googlePlaceId as string));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : (language === "en" ? "Google live data is unavailable" : "ไม่สามารถโหลดข้อมูลสดจาก Google ได้"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mt-4 rounded-[24px] border border-[#149CFF]/15 bg-[#007AFF]/[0.045] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8ecbff]">GOOGLE LIVE</p>
          <p className="mt-1 text-[10px] leading-5 text-white/45">
            {language === "en" ? "Optional live enrichment. It is not written into the Around My Dorm database." : "ข้อมูลสดแบบเลือกโหลด ข้อมูลส่วนนี้จะไม่ถูกเขียนทับฐานข้อมูล Around My Dorm"}
          </p>
        </div>
        <button type="button" disabled={loading} onClick={loadLive} className="amd-chip flex min-h-10 shrink-0 items-center gap-1.5 px-3 text-[9px] font-bold text-[#8ecbff] disabled:opacity-50">
          {loading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {live ? (language === "en" ? "Refresh" : "รีเฟรช") : (language === "en" ? "Load current" : "โหลดข้อมูลล่าสุด")}
        </button>
      </div>

      {error && <p className="mt-3 rounded-xl border border-rose-300/10 bg-rose-300/[0.05] px-3 py-2 text-[9px] text-rose-100">{error}</p>}

      {live && (
        <div className="mt-3 space-y-3">
          {live.photoUrl && <img src={live.photoUrl} alt={`${place.name} Google live`} loading="lazy" className="h-36 w-full rounded-[18px] object-cover" />}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3">
              <p className="text-[8px] uppercase tracking-[0.12em] text-white/35">{language === "en" ? "Google rating" : "คะแนน Google"}</p>
              <p className="mt-1 flex items-center gap-1 text-[14px] font-bold">{live.rating != null ? <><Star className="h-3.5 w-3.5 fill-[#FFC341] text-[#FFC341]" />{live.rating.toFixed(1)}</> : "—"}</p>
              {live.reviewCount != null && <p className="mt-1 text-[8px] text-white/35">{live.reviewCount.toLocaleString()} {language === "en" ? "reviews" : "รีวิว"}</p>}
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3">
              <p className="text-[8px] uppercase tracking-[0.12em] text-white/35">{language === "en" ? "Current status" : "สถานะตอนนี้"}</p>
              <p className={`mt-1 text-[14px] font-bold ${live.openNow === true ? "text-emerald-200" : live.openNow === false ? "text-rose-200" : "text-white/55"}`}>{live.openNow === true ? (language === "en" ? "Open" : "เปิดอยู่") : live.openNow === false ? (language === "en" ? "Closed" : "ปิดแล้ว") : "—"}</p>
            </div>
          </div>

          {(live.phone || live.website || live.googleMapsUrl) && <div className="flex flex-wrap gap-2">
            {live.phone && <a href={`tel:${live.phone}`} className="amd-chip min-h-10 px-3 py-2 text-[9px] font-semibold">{live.phone}</a>}
            {live.website && <a href={live.website} target="_blank" rel="noreferrer" className="amd-chip flex min-h-10 items-center gap-1 px-3 py-2 text-[9px] font-semibold">Website <ExternalLink className="h-3 w-3" /></a>}
            {live.googleMapsUrl && <a href={live.googleMapsUrl} target="_blank" rel="noreferrer" className="amd-chip flex min-h-10 items-center gap-1 px-3 py-2 text-[9px] font-semibold text-[#8ecbff]">Google Maps <ExternalLink className="h-3 w-3" /></a>}
          </div>}

          {live.openingHoursText.length > 0 && <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3"><p className="text-[9px] font-bold text-white/65">{language === "en" ? "Current Google hours" : "เวลาทำการล่าสุดจาก Google"}</p><div className="mt-2 space-y-1">{live.openingHoursText.map((line) => <p key={line} className="text-[8px] leading-4 text-white/42">{line}</p>)}</div></div>}
          <p className="text-[8px] text-white/28">{language === "en" ? "Fetched" : "ดึงข้อมูลเมื่อ"}: {new Date(live.fetchedAt).toLocaleString(language === "en" ? "en-GB" : "th-TH")}</p>
        </div>
      )}
    </section>
  );
}

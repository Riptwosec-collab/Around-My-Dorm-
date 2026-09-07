"use client";

import { useMemo, useState } from "react";
import { ExternalLink, LoaderCircle, RefreshCw, ShieldCheck, Star } from "lucide-react";
import {
  DEFAULT_GOOGLE_DAILY_LIMIT,
  estimatePlaceDetailRequests,
  getGoogleRequestUsage,
  runGoogleSinglePlaceDetails,
} from "@/lib/google-request-manager";
import type { GoogleLiveDetails } from "@/lib/google-live";
import type { Place } from "@/types/place";

function ageLabel(place: Place, language: "th" | "en") {
  const raw = place.lastChecked || place.lastUpdated || place.lastVerified;
  if (!raw) return language === "en" ? "Unknown" : "ยังไม่มีข้อมูล";
  const time = new Date(raw).getTime();
  if (!Number.isFinite(time)) return raw;
  const days = Math.max(0, Math.floor((Date.now() - time) / 86_400_000));
  return language === "en" ? `${days} days ago` : `${days} วันที่แล้ว`;
}

export function GoogleLiveEnrichment({ place, language }: { place: Place; language: "th" | "en" }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const [live, setLive] = useState<GoogleLiveDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ networkAttempts: number; fromCache: boolean } | null>(null);
  const [usageVersion, setUsageVersion] = useState(0);

  const estimate = useMemo(() => estimatePlaceDetailRequests([place], 1), [place, usageVersion]);
  const usage = useMemo(() => getGoogleRequestUsage(), [usageVersion]);

  if (!place.googlePlaceId || !apiKey) return null;

  async function loadLive() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await runGoogleSinglePlaceDetails({ apiKey, place, dailyLimit: DEFAULT_GOOGLE_DAILY_LIMIT });
      setLive(result.live);
      setSummary({ networkAttempts: result.networkAttempts, fromCache: result.fromCache });
      setUsageVersion((value) => value + 1);
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
          <div className="flex flex-wrap items-center gap-2"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8ecbff]">GOOGLE LIVE</p><span className="rounded-full border border-cyan-300/15 bg-cyan-300/[0.06] px-2 py-1 text-[7px] font-bold text-cyan-200">MANUAL ONLY</span></div>
          <p className="mt-1 text-[10px] leading-5 text-white/45">{language === "en" ? "Google live data is available, but opening this place sends zero Google Places requests." : "มีข้อมูลสดจาก Google ให้เลือกโหลด แต่การเปิดหน้าร้านนี้จะไม่ส่ง Google Places Request"}</p>
          <p className="mt-1 text-[8px] text-white/28">{language === "en" ? "Last checked" : "ตรวจล่าสุด"}: {ageLabel(place, language)}</p>
        </div>
        <ShieldCheck className="h-4 w-4 shrink-0 text-[#00D9FF]" />
      </div>

      <div className="mt-3 rounded-2xl border border-white/[0.07] bg-black/10 p-3">
        <div className="flex items-center justify-between gap-3"><div><p className="text-[8px] text-white/32">{language === "en" ? "Estimated requests" : "คำขอ API โดยประมาณ"}</p><p className="mt-1 text-[18px] font-bold text-[#19E6FF]">{estimate.newRequests}</p></div><div className="text-right"><p className="text-[8px] text-white/32">Cache</p><p className="mt-1 text-[12px] font-bold">{estimate.cacheHits}</p></div></div>
        <p className="mt-2 text-[8px] leading-4 text-white/30">{language === "en" ? "Nothing is sent until you press Refresh from Google and confirm the request." : "ระบบจะยังไม่ส่งคำขอจนกว่าคุณจะกด Refresh from Google และยืนยันอีกครั้ง"}</p>
        <button type="button" disabled={loading || (estimate.newRequests > 0 && usage.today >= DEFAULT_GOOGLE_DAILY_LIMIT)} onClick={() => setConfirmOpen(true)} className="amd-chip mt-3 flex min-h-10 w-full items-center justify-center gap-1.5 px-3 text-[9px] font-bold text-[#8ecbff] disabled:opacity-50">
          {loading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {language === "en" ? "Refresh from Google" : "Refresh จาก Google"}
        </button>
        <p className="mt-2 text-center text-[7px] text-white/25">Local usage today: {usage.today} / {DEFAULT_GOOGLE_DAILY_LIMIT}</p>
      </div>

      {summary && <p className="mt-3 rounded-xl border border-emerald-300/10 bg-emerald-300/[0.04] px-3 py-2 text-[8px] text-emerald-100">REQUEST SUMMARY • Network attempts: {summary.networkAttempts} • {summary.fromCache ? "cache hit" : "external request sent"}</p>}
      {error && <p className="mt-3 rounded-xl border border-rose-300/10 bg-rose-300/[0.05] px-3 py-2 text-[9px] text-rose-100">{error}</p>}

      {live && (
        <div className="mt-3 space-y-3">
          {live.photoUrl && <img src={live.photoUrl} alt={`${place.name} Google live`} loading="lazy" className="h-36 w-full rounded-[18px] object-cover" />}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3"><p className="text-[8px] uppercase tracking-[0.12em] text-white/35">{language === "en" ? "Google rating" : "คะแนน Google"}</p><p className="mt-1 flex items-center gap-1 text-[14px] font-bold">{live.rating != null ? <><Star className="h-3.5 w-3.5 fill-[#FFC341] text-[#FFC341]" />{live.rating.toFixed(1)}</> : "—"}</p>{live.reviewCount != null && <p className="mt-1 text-[8px] text-white/35">{live.reviewCount.toLocaleString()} {language === "en" ? "reviews" : "รีวิว"}</p>}</div>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3"><p className="text-[8px] uppercase tracking-[0.12em] text-white/35">{language === "en" ? "Current status" : "สถานะตอนนี้"}</p><p className={`mt-1 text-[14px] font-bold ${live.openNow === true ? "text-emerald-200" : live.openNow === false ? "text-rose-200" : "text-white/55"}`}>{live.openNow === true ? (language === "en" ? "Open" : "เปิดอยู่") : live.openNow === false ? (language === "en" ? "Closed" : "ปิดแล้ว") : "—"}</p></div>
          </div>
          {(live.phone || live.website || live.googleMapsUrl) && <div className="flex flex-wrap gap-2">{live.phone && <a href={`tel:${live.phone}`} className="amd-chip min-h-10 px-3 py-2 text-[9px] font-semibold">{live.phone}</a>}{live.website && <a href={live.website} target="_blank" rel="noreferrer" className="amd-chip flex min-h-10 items-center gap-1 px-3 py-2 text-[9px] font-semibold">Website <ExternalLink className="h-3 w-3" /></a>}{live.googleMapsUrl && <a href={live.googleMapsUrl} target="_blank" rel="noreferrer" className="amd-chip flex min-h-10 items-center gap-1 px-3 py-2 text-[9px] font-semibold text-[#8ecbff]">Google Maps <ExternalLink className="h-3 w-3" /></a>}</div>}
          {live.openingHoursText.length > 0 && <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3"><p className="text-[9px] font-bold text-white/65">{language === "en" ? "Current Google hours" : "เวลาทำการล่าสุดจาก Google"}</p><div className="mt-2 space-y-1">{live.openingHoursText.map((line) => <p key={line} className="text-[8px] leading-4 text-white/42">{line}</p>)}</div></div>}
          <p className="text-[8px] text-white/28">{language === "en" ? "Fetched" : "ดึงข้อมูลเมื่อ"}: {new Date(live.fetchedAt).toLocaleString(language === "en" ? "en-GB" : "th-TH")}</p>
        </div>
      )}

      {confirmOpen && <div className="amd-sheet-backdrop z-[130]"><button type="button" aria-label="Close" className="absolute inset-0" onClick={() => setConfirmOpen(false)} /><section className="amd-sheet amd-glass-strong relative w-full max-w-[440px] rounded-t-[30px] p-5"><p className="text-[9px] font-bold text-[#00D9FF]">PLACE DETAILS REQUEST</p><h3 className="mt-1 text-[18px] font-bold">{place.name}</h3><p className="mt-3 text-[10px] text-white/55">{estimate.newRequests > 0 ? (language === "en" ? "Estimated requests: 1" : "คาดว่าจะใช้ 1 Request") : (language === "en" ? "Valid cache available: 0 new external requests" : "มี Cache ที่ยังใช้ได้: 0 Request ใหม่")}</p><p className="mt-1 text-[8px] leading-4 text-white/30">Requested fields: name, address, coordinates, rating, review count, opening hours, phone, website, photo metadata, business status.</p><div className="mt-4 flex gap-2"><button type="button" onClick={() => setConfirmOpen(false)} className="amd-chip flex-1 min-h-11 text-[9px]">Cancel</button><button type="button" onClick={() => { setConfirmOpen(false); void loadLive(); }} className="amd-btn amd-btn-primary flex-1 rounded-xl text-[9px] font-bold">{estimate.newRequests > 0 ? "Run 1 Request" : "Use Cache — 0 New"}</button></div></section></div>}
    </section>
  );
}

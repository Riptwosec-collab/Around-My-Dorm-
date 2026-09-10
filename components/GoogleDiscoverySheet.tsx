"use client";

import { useMemo, useState } from "react";
import { ExternalLink, LoaderCircle, MapPin, Navigation, Search, ShieldCheck, Star, X } from "lucide-react";
import {
  DEFAULT_GOOGLE_DAILY_LIMIT,
  estimateGoogleTextSearchRequests,
  getGoogleRequestUsage,
  runGoogleTextSearchRequest,
} from "@/lib/google-request-manager";
import type { GoogleDiscoveryCandidate } from "@/lib/google-live";
import { haversineKm } from "@/lib/place-utils";

export function GoogleDiscoverySheet({
  initialQuery,
  center,
  radiusMeters,
  language,
  onClose,
  onReviewCandidate,
}: {
  initialQuery: string;
  center: { lat: number; lng: number };
  radiusMeters: number;
  language: "th" | "en";
  onClose: () => void;
  onReviewCandidate: (candidate: GoogleDiscoveryCandidate) => void;
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<GoogleDiscoveryCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSummary, setLastSummary] = useState<{ networkAttempts: number; fromCache: boolean; candidates: number } | null>(null);
  const [usageVersion, setUsageVersion] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const estimateInput = useMemo(() => ({ query, center, radiusMeters, language }), [query, center, radiusMeters, language]);
  const estimate = useMemo(() => estimateGoogleTextSearchRequests(estimateInput), [estimateInput, usageVersion]);
  const usage = useMemo(() => getGoogleRequestUsage(), [usageVersion]);

  const sortedResults = useMemo(() => [...results].sort((a, b) => {
    const da = a.latitude != null && a.longitude != null ? haversineKm(center, { lat: a.latitude, lng: a.longitude }) : Number.POSITIVE_INFINITY;
    const db = b.latitude != null && b.longitude != null ? haversineKm(center, { lat: b.latitude, lng: b.longitude }) : Number.POSITIVE_INFINITY;
    return da - db;
  }), [results, center]);

  async function searchGoogle(confirmed = false) {
    if (!query.trim() || !apiKey || loading) return;
    if (estimate.newRequests > 0 && !confirmed) { setConfirmOpen(true); return; }
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const result = await runGoogleTextSearchRequest({
        apiKey,
        query: query.trim(),
        center,
        radiusMeters,
        language,
        maxResults: 12,
        dailyLimit: DEFAULT_GOOGLE_DAILY_LIMIT,
      });
      setResults(result.candidates);
      setLastSummary({ networkAttempts: result.networkAttempts, fromCache: result.fromCache, candidates: result.candidates.length });
      setUsageVersion((value) => value + 1);
    } catch (reason) {
      setResults([]);
      setError(reason instanceof Error ? reason.message : (language === "en" ? "Google discovery failed" : "ค้นหา Google ไม่สำเร็จ"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="amd-sheet-backdrop z-[105]">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0" />
      <section className="amd-sheet amd-glass-strong relative max-h-[92dvh] w-full max-w-[560px] overflow-y-auto rounded-t-[34px] border-b-0 px-4 pb-[calc(28px+env(safe-area-inset-bottom))] pt-3">
        <div className="sticky top-0 z-20 -mx-4 flex items-center justify-between border-b border-white/[0.06] bg-[var(--amd-glass-strong)] px-4 pb-3 pt-2 backdrop-blur-2xl">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#00D9FF]">MANUAL GOOGLE SEARCH</p><h2 className="mt-1 text-[22px] font-bold">{language === "en" ? "Search more places" : "ค้นหาสถานที่เพิ่มเติม"}</h2></div>
          <button type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-full bg-white/[0.06]"><X className="h-4 w-4" /></button>
        </div>

        <div className="mt-4 rounded-2xl border border-[#149CFF]/15 bg-[#007AFF]/[0.045] p-3">
          <div className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#00D9FF]" /><p className="text-[9px] leading-5 text-white/50">{language === "en" ? "Typing, changing radius, or opening this sheet sends zero Google Places requests. Search runs only after you press the explicit request button." : "การพิมพ์ เปลี่ยนรัศมี หรือเปิดหน้านี้จะไม่ส่ง Google Places Request การค้นหาจะเริ่มเมื่อคุณกดปุ่มส่ง Request เท่านั้น"}</p></div>
        </div>

        {!apiKey && <p className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-300/[0.06] p-3 text-[9px] text-amber-100">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not configured.</p>}

        <div className="amd-input relative mt-4">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
          <input value={query} onChange={(event) => { setQuery(event.target.value); setSearched(false); setLastSummary(null); }} placeholder={language === "en" ? "e.g. ramen, cafe, parking" : "เช่น ราเมง คาเฟ่ ที่จอดรถ"} className="h-12 w-full rounded-2xl bg-transparent pl-11 pr-3 text-[11px] outline-none" />
        </div>

        <div className="mt-3 rounded-2xl border border-white/[0.07] bg-black/10 p-3">
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#8ecbff]">SEARCH REQUEST ESTIMATE</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-white/[0.035] p-2"><p className="text-[8px] text-white/30">Query</p><p className="mt-1 truncate text-[10px] font-semibold">{query.trim() || "—"}</p></div>
            <div className="rounded-xl bg-white/[0.035] p-2"><p className="text-[8px] text-white/30">Radius</p><p className="mt-1 text-[10px] font-semibold">{radiusMeters >= 1000 ? `${(radiusMeters / 1000).toFixed(radiusMeters % 1000 ? 1 : 0)} km` : `${radiusMeters} m`}</p></div>
            <div className="rounded-xl bg-white/[0.035] p-2"><p className="text-[8px] text-white/30">Estimated Text Search</p><p className="mt-1 text-[15px] font-bold">{estimate.newRequests}</p></div>
            <div className="rounded-xl bg-white/[0.035] p-2"><p className="text-[8px] text-white/30">Cache hits</p><p className="mt-1 text-[15px] font-bold">{estimate.cacheHits}</p></div>
          </div>
          <p className="mt-3 text-[8px] leading-4 text-white/32">{language === "en" ? "The estimate is calculated locally. No Google call occurs while you type." : "ตัวเลขนี้คำนวณในเครื่อง การพิมพ์คำค้นหาไม่เรียก Google"}</p>
          <button type="button" disabled={loading || !query.trim() || !apiKey || (estimate.newRequests > 0 && usage.today >= DEFAULT_GOOGLE_DAILY_LIMIT)} onClick={() => void searchGoogle(false)} className="amd-btn amd-btn-primary mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-[10px] font-bold disabled:opacity-45">
            {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {estimate.newRequests === 0 && estimate.cacheHits > 0 ? (language === "en" ? "Use cached result — 0 new requests" : "ใช้ Cache — 0 Request ใหม่") : (language === "en" ? "Run 1 Google Search Request" : "ส่ง 1 Google Search Request")}
          </button>
          <p className="mt-2 text-center text-[8px] text-white/28">Local usage today: {usage.today} / {DEFAULT_GOOGLE_DAILY_LIMIT}</p>
        </div>

        {confirmOpen && <div className="amd-sheet-backdrop z-[165]"><button type="button" aria-label="Close" className="absolute inset-0" onClick={() => setConfirmOpen(false)} /><section className="amd-sheet amd-glass-strong relative w-full max-w-[460px] rounded-t-[30px] p-5"><p className="text-[9px] font-bold text-[#00D9FF]">MANUAL GOOGLE REQUEST</p><h3 className="mt-2 text-[18px] font-bold">Send 1 Google Places Search?</h3><p className="mt-2 text-[9px] leading-5 text-white/48">Google Places API request will be sent for “{query.trim()}” within approximately {radiusMeters} m. This operation may consume Google Maps Platform quota.</p><div className="mt-4 flex gap-2"><button type="button" onClick={() => setConfirmOpen(false)} className="amd-chip min-h-11 flex-1 text-[9px]">Cancel</button><button data-testid="confirm-google-nearby-search" type="button" onClick={() => { setConfirmOpen(false); void searchGoogle(true); }} className="amd-btn amd-btn-primary flex-1 rounded-xl text-[9px] font-bold">Send Request</button></div></section></div>}
        {lastSummary && <div className="mt-3 rounded-xl border border-emerald-300/10 bg-emerald-300/[0.04] px-3 py-2 text-[8px] text-emerald-100">REQUEST SUMMARY • Network attempts: {lastSummary.networkAttempts} • {lastSummary.fromCache ? "cache hit" : "external request sent"} • {lastSummary.candidates} candidates returned</div>}
        {error && <p className="mt-3 rounded-xl border border-rose-300/10 bg-rose-300/[0.05] px-3 py-2 text-[9px] text-rose-100">{error}</p>}

        <div className="mt-4 space-y-3">
          {sortedResults.map((candidate) => {
            const distance = candidate.latitude != null && candidate.longitude != null ? haversineKm(center, { lat: candidate.latitude, lng: candidate.longitude }) : null;
            const destination = candidate.latitude != null && candidate.longitude != null ? `${candidate.latitude},${candidate.longitude}` : candidate.name;
            const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&destination_place_id=${encodeURIComponent(candidate.googlePlaceId)}`;
            return <article key={candidate.googlePlaceId} className="amd-glass amd-card p-4">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-[14px] font-bold">{candidate.name}</p><p className="mt-1 text-[9px] leading-4 text-white/38">{candidate.address || (language === "en" ? "Address unavailable" : "ยังไม่มีที่อยู่")}</p></div>{candidate.rating != null && <span className="flex shrink-0 items-center gap-1 text-[10px] font-bold"><Star className="h-3.5 w-3.5 fill-[#FFC341] text-[#FFC341]" />{candidate.rating.toFixed(1)}</span>}</div>
              <div className="mt-3 flex flex-wrap gap-2 text-[8px] text-white/42">{candidate.primaryTypeLabel && <span className="amd-chip h-7 min-h-0 px-2">{candidate.primaryTypeLabel}</span>}{distance != null && <span className="amd-chip h-7 min-h-0 px-2"><MapPin className="mr-1 inline h-3 w-3" />{distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`}</span>}{candidate.openNow != null && <span className={`amd-chip h-7 min-h-0 px-2 ${candidate.openNow ? "text-emerald-200" : "text-rose-200"}`}>{candidate.openNow ? (language === "en" ? "Open" : "เปิดอยู่") : (language === "en" ? "Closed" : "ปิดแล้ว")}</span>}</div>
              <div className="mt-3 grid grid-cols-3 gap-2">{candidate.googleMapsUrl ? <a href={candidate.googleMapsUrl} target="_blank" rel="noreferrer" className="amd-chip flex min-h-10 items-center justify-center gap-1 text-[8px] font-bold">{language === "en" ? "View" : "ดู"}<ExternalLink className="h-3 w-3" /></a> : <span />}
                <a href={directionsUrl} target="_blank" rel="noreferrer" className="amd-chip flex min-h-10 items-center justify-center gap-1 text-[8px] font-bold"><Navigation className="h-3 w-3" />{language === "en" ? "Navigate" : "นำทาง"}</a>
                <button type="button" onClick={() => onReviewCandidate(candidate)} className="amd-chip min-h-10 text-[8px] font-bold text-[#8ecbff]">{language === "en" ? "Review candidate" : "ตรวจ Candidate"}</button>
              </div>
            </article>;
          })}
          {searched && !loading && !sortedResults.length && !error && <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-6 text-center text-[10px] text-white/40">{language === "en" ? "No Google candidates found" : "ไม่พบ Candidate จาก Google"}</div>}
        </div>
      </section>
    </div>
  );
}

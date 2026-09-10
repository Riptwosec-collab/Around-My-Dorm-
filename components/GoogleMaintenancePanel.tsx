"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Eye, History, LoaderCircle, RefreshCw, ShieldCheck, X } from "lucide-react";
import { freshnessState } from "@/lib/data-governance";
import {
  DEFAULT_GOOGLE_DAILY_LIMIT,
  GOOGLE_BATCH_LIMIT_OPTIONS,
  GOOGLE_REQUEST_MODE,
  estimatePlaceDetailRequests,
  getGoogleRequestLogs,
  hydrateGoogleRequestLogs,
  getGoogleRequestUsage,
  previewGoogleRequestBatch,
  retryFailedGoogleRequests,
  runGoogleRequestBatch,
  type GoogleRequestBatchResult,
  type GoogleRequestFailure,
  type GoogleRequestProgress,
} from "@/lib/google-request-manager";
import type { GoogleLiveDetails } from "@/lib/google-live";
import { normalizeText } from "@/lib/place-utils";
import type { CategoryId, Place } from "@/types/place";
import { CATEGORIES } from "@/data/categories";
import { getGoogleApiControlSettings, hydrateGoogleApiControlSettings, requestUsageWarning, saveGoogleApiControlSettings } from "@/lib/google-api-control";
import { buildRefreshQueue, recommendedRefreshPlaces } from "@/lib/refresh-priority";

type ReviewField = { label: string; existing: unknown; live: unknown; risk: "review" | "high" };
type ReviewItem = { place: Place; live: GoogleLiveDetails; fields: ReviewField[]; possiblyClosed: boolean };
type RequestScope = "recommended" | "all" | "older30" | "older60" | "older90" | "category" | "area" | "selected" | "missing_id" | "with_id";

function same(a: unknown, b: unknown) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function liveReview(place: Place, live: GoogleLiveDetails): ReviewItem {
  const fields: ReviewField[] = [];
  const push = (label: string, existing: unknown, incoming: unknown, risk: "review" | "high" = "review") => {
    if (incoming === null || incoming === undefined || incoming === "") return;
    if (!same(existing, incoming)) fields.push({ label, existing, live: incoming, risk });
  };
  push("Name", place.name, live.name, live.name && place.name !== live.name ? "high" : "review");
  push("Address", place.address, live.address);
  if (live.latitude != null && live.longitude != null && place.latitude != null && place.longitude != null) {
    const delta = Math.hypot(live.latitude - place.latitude, live.longitude - place.longitude);
    if (delta > 0.00035) fields.push({ label: "Coordinates", existing: `${place.latitude}, ${place.longitude}`, live: `${live.latitude}, ${live.longitude}`, risk: "high" });
  }
  push("Phone", place.phone, live.phone);
  push("Website", place.website, live.website);
  push("Rating", place.rating, live.rating);
  push("Review count", place.reviewCount, live.reviewCount);
  if (live.openingHoursText.length) push("Opening hours", place.openingHoursText || null, live.openingHoursText.join(" | "));
  const status = String(live.businessStatus || "").toUpperCase();
  const possiblyClosed = status.includes("CLOSED") || status.includes("CLOSE");
  if (possiblyClosed) fields.push({ label: "Business status", existing: place.permanentlyClosed ? "closed" : "active/unknown", live: live.businessStatus, risk: "high" });
  return { place, live, fields, possiblyClosed };
}

function ageDays(place: Place) {
  const raw = place.lastChecked || place.lastUpdated || place.lastVerified;
  if (!raw) return Number.POSITIVE_INFINITY;
  const time = new Date(raw).getTime();
  return Number.isFinite(time) ? Math.max(0, (Date.now() - time) / 86_400_000) : Number.POSITIVE_INFINITY;
}

function groupedHistory() {
  const groups = new Map<string, { placeDetails: number; textSearch: number; success: number; failed: number; attempts: number; candidates: number }>();
  for (const item of getGoogleRequestLogs()) {
    const day = item.timestamp.slice(0, 10);
    const current = groups.get(day) || { placeDetails: 0, textSearch: 0, success: 0, failed: 0, attempts: 0, candidates: 0 };
    if (item.requestType === "place_details") current.placeDetails += 1;
    if (item.requestType === "text_search") current.textSearch += 1;
    if (item.status === "success") current.success += 1;
    if (item.status === "failed") current.failed += 1;
    current.attempts += item.attempted || 0;
    current.candidates += item.candidateCount || 0;
    groups.set(day, current);
  }
  return [...groups.entries()].slice(0, 7);
}

export function GoogleMaintenancePanel({ places, language }: { places: Place[]; language: "th" | "en" }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const [scope, setScope] = useState<RequestScope>("older90");
  const [scopeCategory, setScopeCategory] = useState<CategoryId>("cafe");
  const [scopeArea, setScopeArea] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [apiControl, setApiControl] = useState(() => getGoogleApiControlSettings());
  const safetyLimit = apiControl.batchLimit;
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [retryConfirmOpen, setRetryConfirmOpen] = useState(false);
  const [singlePlace, setSinglePlace] = useState<Place | null>(null);
  const [progress, setProgress] = useState<GoogleRequestProgress | null>(null);
  const [result, setResult] = useState<GoogleRequestBatchResult | null>(null);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [failedPlaces, setFailedPlaces] = useState<GoogleRequestFailure[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [usageVersion, setUsageVersion] = useState(0);
  const cancelRef = useRef(false);
  const runningRef = useRef(false);

  useEffect(() => {
    void Promise.all([hydrateGoogleApiControlSettings(), hydrateGoogleRequestLogs()]).then(([control]) => { setApiControl(control); setUsageVersion((value) => value + 1); }).catch(() => undefined);
  }, []);

  const refreshQueue = useMemo(() => buildRefreshQueue(places), [places]);
  const recommendedPlaces = useMemo(() => recommendedRefreshPlaces(places, safetyLimit), [places, safetyLimit]);

  const requestPlaces = useMemo(() => {
    if (scope === "recommended") return recommendedPlaces;
    if (scope === "all") return places;
    if (scope === "older30") return places.filter((place) => ageDays(place) > 30);
    if (scope === "older60") return places.filter((place) => ageDays(place) > 60);
    if (scope === "older90") return places.filter((place) => ageDays(place) > 90);
    if (scope === "category") return places.filter((place) => place.categories.includes(scopeCategory));
    if (scope === "area") {
      const needle = normalizeText(scopeArea);
      return needle ? places.filter((place) => normalizeText(`${place.area} ${place.soi || ""} ${place.address || ""}`).includes(needle)) : [];
    }
    if (scope === "selected") {
      const ids = new Set(selectedIds);
      return places.filter((place) => ids.has(place.id));
    }
    if (scope === "missing_id") return places.filter((place) => !place.googlePlaceId);
    return places.filter((place) => Boolean(place.googlePlaceId));
  }, [places, scope, scopeCategory, scopeArea, selectedIds, recommendedPlaces]);

  const estimate = useMemo(() => estimatePlaceDetailRequests(requestPlaces, safetyLimit), [requestPlaces, safetyLimit, usageVersion]);
  const recommendedEstimate = useMemo(() => estimatePlaceDetailRequests(recommendedPlaces, safetyLimit), [recommendedPlaces, safetyLimit, usageVersion]);
  const preview = useMemo(() => previewGoogleRequestBatch(requestPlaces, safetyLimit), [requestPlaces, safetyLimit, usageVersion]);
  const usage = useMemo(() => getGoogleRequestUsage(), [usageVersion]);
  const history = useMemo(() => groupedHistory(), [usageVersion]);
  const remainingDaily = Math.max(0, DEFAULT_GOOGLE_DAILY_LIMIT - usage.today);
  const executableCount = Math.min(estimate.batchRequests, remainingDaily);
  const recommendedExecutableCount = Math.min(recommendedEstimate.batchRequests, remainingDaily);
  const largeBatch = executableCount > 25;
  const strongWarning = estimate.newRequests >= 100;
  const dailyWarning = useMemo(() => requestUsageWarning(usage.today, apiControl.dailyWarningLimit), [usage.today, apiControl.dailyWarningLimit]);
  const monthlyWarning = useMemo(() => requestUsageWarning(usage.month, apiControl.monthlyWarningLimit), [usage.month, apiControl.monthlyWarningLimit]);

  function updateApiControl(patch: Partial<typeof apiControl>) {
    setApiControl(saveGoogleApiControlSettings(patch));
  }

  function absorbResult(next: GoogleRequestBatchResult) {
    const nextReviews = next.details.map(({ place, live }) => liveReview(place, live));
    setReviews(nextReviews.filter((item) => item.fields.length > 0));
    setFailedPlaces(next.failures);
    setResult(next);
    setProgress(null);
    setUsageVersion((value) => value + 1);
    runningRef.current = false;
  }

  async function executeBatch(targetPlaces = requestPlaces) {
    if (!apiKey || runningRef.current) return;
    runningRef.current = true;
    cancelRef.current = false;
    setError(null);
    setResult(null);
    setFailedPlaces([]);
    try {
      const next = await runGoogleRequestBatch({
        apiKey,
        places: targetPlaces,
        safetyLimit,
        dailyLimit: DEFAULT_GOOGLE_DAILY_LIMIT,
        isCancelled: () => cancelRef.current,
        onProgress: setProgress,
      });
      absorbResult(next);
    } catch (reason) {
      runningRef.current = false;
      setProgress(null);
      setError(reason instanceof Error ? reason.message : "Google request batch failed");
    }
  }

  async function runFailedRetry() {
    if (!apiKey || !failedPlaces.length || runningRef.current) return;
    runningRef.current = true;
    cancelRef.current = false;
    setError(null);
    try {
      const next = await retryFailedGoogleRequests({
        apiKey,
        failures: failedPlaces,
        safetyLimit,
        dailyLimit: DEFAULT_GOOGLE_DAILY_LIMIT,
        isCancelled: () => cancelRef.current,
        onProgress: setProgress,
      });
      absorbResult(next);
    } catch (reason) {
      runningRef.current = false;
      setProgress(null);
      setError(reason instanceof Error ? reason.message : "Retry failed");
    }
  }

  function requestRecommendedRun() {
    if (apiControl.locked || recommendedExecutableCount <= 0) return;
    setScope("recommended");
    setConfirmOpen(true);
  }

  function previewRecommended() {
    setScope("recommended");
    setPreviewOpen(true);
  }

  function requestRun() {
    if (executableCount <= 0) return;
    setConfirmOpen(true);
  }

  const fields = ["Name", "Address", "Coordinates", "Rating", "Review count", "Opening hours", "Phone", "Website", "Photo metadata", "Business status"];

  return (
    <section data-testid="google-api-control-center" className="amd-glass amd-card mt-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2"><p className="text-[11px] font-bold">GOOGLE API CONTROL CENTER</p><span className="rounded-full border border-cyan-300/20 bg-cyan-300/[0.07] px-2 py-1 text-[8px] font-extrabold text-cyan-200">MANUAL ONLY</span></div>
          <p className="mt-1 text-[9px] leading-5 text-[var(--amd-text-2)]">{language === "en" ? "Google Places requests are never triggered by browsing, filters, map interaction or opening this panel. Estimates are local only." : "Google Places จะไม่ถูกเรียกจากการเปิดหน้า เปลี่ยนตัวกรอง หรือใช้งานแผนที่ ระบบจะคำนวณจำนวนในเครื่องก่อน และส่ง Request เฉพาะเมื่อคุณกดปุ่ม Run เท่านั้น"}</p>
        </div>
        <ShieldCheck className="h-5 w-5 shrink-0 text-[#00D9FF]" />
      </div>

      <div className="mt-3 rounded-xl border border-white/[0.07] bg-black/10 p-3 text-[8px] leading-4 text-white/38">Policy: <strong className="text-white/70">GOOGLE_REQUEST_MODE = {GOOGLE_REQUEST_MODE}</strong> • Google Maps rendering is separate from Google Places discovery/detail requests.</div>

      <div data-testid="google-api-request-lock" className={`mt-3 rounded-2xl border p-4 ${apiControl.locked ? "border-rose-300/20 bg-rose-300/[0.055]" : "border-emerald-300/15 bg-emerald-300/[0.04]"}`}>
        <div className="flex items-center justify-between gap-3"><div><p className="text-[9px] font-bold">GOOGLE API REQUEST LOCK</p><p className={`mt-1 text-[13px] font-extrabold ${apiControl.locked ? "text-rose-200" : "text-emerald-200"}`}>{apiControl.locked ? "LOCKED" : "UNLOCKED"}</p></div><ShieldCheck className={`h-5 w-5 ${apiControl.locked ? "text-rose-200" : "text-emerald-200"}`} /></div>
        <p className="mt-2 text-[8px] leading-4 text-white/38">{apiControl.locked ? (language === "en" ? "All Google Places network requests are blocked. Google Map rendering remains available." : "Google Places network request ทุกชนิดถูกบล็อก แต่ Google Map ยังแสดงผลได้") : (language === "en" ? "Manual Google requests are permitted only after explicit Run actions." : "อนุญาตเฉพาะ Google Request ที่ผู้ดูแลกด Run เอง")}</p>
        <button data-testid="google-api-lock-toggle" type="button" disabled={Boolean(progress)} onClick={() => updateApiControl({ locked: !apiControl.locked })} className={`mt-3 min-h-11 w-full rounded-xl border px-4 text-[9px] font-extrabold ${apiControl.locked ? "border-white/10 bg-white/[0.05] text-white/78" : "border-rose-300/20 bg-rose-300/[0.07] text-rose-100"}`}>{apiControl.locked ? (language === "en" ? "UNLOCK REQUESTS" : "UNLOCK REQUESTS") : (language === "en" ? "LOCK GOOGLE REQUESTS" : "LOCK GOOGLE REQUESTS")}</button>
      </div>
      {!apiKey && <p className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.06] px-3 py-2 text-[9px] text-amber-100">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not configured.</p>}

      <div data-testid="data-refresh-queue" className="mt-4 rounded-2xl border border-white/[0.07] bg-black/10 p-4">
        <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold">DATA REFRESH QUEUE</p><p className="mt-1 text-[8px] leading-4 text-white/34">{language === "en" ? "Priority is calculated locally from closure risk, age, missing fields, local relevance, category volatility and verification state." : "จัดลำดับในเครื่องจากความเสี่ยงปิดร้าน อายุข้อมูล ฟิลด์ที่ขาด ความสำคัญในระบบ ความผันผวนของหมวด และสถานะการยืนยัน"}</p></div><span className="rounded-full border border-cyan-300/15 bg-cyan-300/[0.05] px-2 py-1 text-[7px] font-bold text-cyan-200">0 API CALLS</span></div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{[
          ["CRITICAL", refreshQueue.critical.length, "text-rose-200"],
          ["HIGH", refreshQueue.high.length, "text-amber-100"],
          ["MEDIUM", refreshQueue.medium.length, "text-[#8ecbff]"],
          ["LOW", refreshQueue.low.length, "text-white/58"],
        ].map(([label, value, tone]) => <div key={String(label)} className="rounded-xl border border-white/[0.05] bg-white/[0.025] p-3"><p className={`text-[8px] font-bold ${tone}`}>{label}</p><p className="mt-1 text-[18px] font-bold">{value}</p></div>)}</div>
        <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.025] p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-[9px] font-bold">RECOMMENDED UPDATE BATCH</p><p className="mt-1 text-[8px] text-white/32">Highest-priority Google-linked records first. Missing Place IDs stay in Place ID Manager.</p></div><div className="text-right"><p className="text-[18px] font-bold text-[#19E6FF]">{recommendedPlaces.length}</p><p className="text-[7px] text-white/28">places</p></div></div><div className="mt-2 flex items-center justify-between text-[8px] text-white/38"><span>Estimated new requests</span><strong className="text-white/78">{recommendedEstimate.newRequests}</strong></div><div className="mt-3 flex gap-2"><button data-testid="refresh-queue-preview" type="button" disabled={!recommendedPlaces.length || Boolean(progress)} onClick={previewRecommended} className="amd-chip min-h-11 flex-1 px-3 text-[8px] font-bold disabled:opacity-35">Preview {recommendedEstimate.newRequests}</button><button data-testid="refresh-queue-run" type="button" disabled={!apiKey || apiControl.locked || recommendedExecutableCount <= 0 || Boolean(progress)} onClick={requestRecommendedRun} className="amd-btn amd-btn-primary min-h-11 flex-1 rounded-xl px-3 text-[8px] font-bold disabled:opacity-35">Run {recommendedExecutableCount} Requests</button></div><p className="mt-2 text-[7px] leading-4 text-white/26">Recommendation never auto-runs. Required flow: recommend → preview/confirm → explicit manual execute.</p></div>
        <details className="mt-3 rounded-xl border border-white/[0.05] bg-white/[0.02] p-3"><summary className="cursor-pointer text-[8px] font-semibold text-white/58">Top priority details</summary><div className="mt-2 space-y-2">{refreshQueue.items.filter((item) => item.priority !== "current").slice(0, 12).map((item) => <div key={item.place.id} className="flex items-start justify-between gap-3 border-b border-white/[0.04] pb-2 last:border-0"><div className="min-w-0"><p className="truncate text-[8px] font-semibold">{item.place.name}</p><p className="mt-1 truncate text-[7px] text-white/30">{item.reasons.join(" • ")}</p></div><div className="shrink-0 text-right"><p className="text-[8px] font-bold">{item.priority.toUpperCase()} · {item.score}</p><p className="mt-1 text-[7px] text-white/25">{item.googleEligible ? "Google ID ✓" : "No Place ID"}</p></div></div>)}</div></details>
      </div>

      <div data-testid="manual-google-request-shortcuts" className="mt-4 rounded-2xl border border-white/[0.07] bg-black/10 p-4">
        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#8ecbff]">MANUAL REQUEST SHORTCUTS</p>
        <p className="mt-1 text-[8px] leading-4 text-white/34">These buttons only select/preview a request scope. No Google request is sent until the separate confirmation dialog and Send Request action.</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <button type="button" onClick={() => { setScope("category"); setScopeCategory("food"); setPreviewOpen(true); }} className="amd-chip min-h-11 px-3 text-[8px] font-bold">Update Restaurant Data</button>
          <button type="button" onClick={() => { setScope("category"); setScopeCategory("cafe"); setPreviewOpen(true); }} className="amd-chip min-h-11 px-3 text-[8px] font-bold">Update Cafe Data</button>
          <button type="button" onClick={() => { setScope("category"); setScopeCategory("parking"); setPreviewOpen(true); }} className="amd-chip min-h-11 px-3 text-[8px] font-bold">Update Parking Data</button>
          <button type="button" onClick={() => setScope("area")} className="amd-chip min-h-11 px-3 text-[8px] font-bold">Update Selected Area</button>
          <button type="button" onClick={() => setScope("selected")} className="amd-chip min-h-11 px-3 text-[8px] font-bold">Refresh Selected Place</button>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/38">DATA UPDATE SCOPE</p>
        <select value={scope} disabled={Boolean(progress)} onChange={(event) => setScope(event.target.value as RequestScope)} className="amd-input mt-2 h-11 w-full rounded-xl bg-[#07111f] px-3 text-[10px]">
          <option value="recommended">Recommended Update Batch</option>
          <option value="all">All Places</option>
          <option value="older30">Older than 30 Days</option>
          <option value="older60">Older than 60 Days</option>
          <option value="older90">Older than 90 Days</option>
          <option value="category">Selected Category</option>
          <option value="area">Selected Area</option>
          <option value="selected">Selected Places</option>
          <option value="missing_id">Only Missing Google Place IDs</option>
          <option value="with_id">Only Places with Google Place IDs</option>
        </select>
        {scope === "category" && <select value={scopeCategory} onChange={(event) => setScopeCategory(event.target.value as CategoryId)} className="amd-input mt-2 h-11 w-full rounded-xl bg-[#07111f] px-3 text-[10px]">{CATEGORIES.filter((item) => item.id !== "all").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
        {scope === "area" && <input value={scopeArea} onChange={(event) => setScopeArea(event.target.value)} placeholder={language === "en" ? "Area / soi / address" : "พื้นที่ / ซอย / ที่อยู่"} className="amd-input mt-2 h-11 w-full rounded-xl px-3 text-[10px]" />}
        {scope === "selected" && <div className="mt-2 max-h-44 overflow-y-auto rounded-xl border border-white/[0.07] bg-black/10 p-2">{places.map((place) => { const checked = selectedIds.includes(place.id); return <label key={place.id} className="flex min-h-10 cursor-pointer items-center gap-2 border-b border-white/[0.04] px-2 text-[9px] last:border-0"><input type="checkbox" checked={checked} onChange={() => setSelectedIds((current) => checked ? current.filter((id) => id !== place.id) : [...current, place.id])} /><span className="min-w-0 flex-1 truncate">{place.name}</span><span className="text-[var(--amd-text-3)]">{place.googlePlaceId ? "ID ✓" : "No ID"}</span></label>; })}</div>}
      </div>

      <div className="mt-4 rounded-2xl border border-[#149CFF]/20 bg-[#007AFF]/[0.055] p-4">
        <div className="flex items-center justify-between gap-3"><div><p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#8ecbff]">GOOGLE UPDATE ESTIMATE</p><p className="mt-1 text-[8px] text-white/34">{language === "en" ? "No API call occurs while this estimate changes." : "การเปลี่ยน Scope/Filter ด้านบนจะคำนวณใหม่ในเครื่องเท่านั้น ไม่เรียก Google"}</p></div><span className="text-[22px] font-bold text-[#19E6FF]">{estimate.newRequests}</span></div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{[
          [language === "en" ? "Database places" : "ร้านในฐาน", places.length],
          [language === "en" ? "Selected" : "เลือกแล้ว", estimate.selectedRecords],
          [language === "en" ? "Eligible IDs" : "Google Place ID", estimate.eligibleRecords],
          [language === "en" ? "Unique IDs" : "ID ไม่ซ้ำ", estimate.uniquePlaceIds],
          [language === "en" ? "Cached" : "Cache", estimate.cacheHits],
          [language === "en" ? "New requests" : "Request ใหม่", estimate.newRequests],
          [language === "en" ? "This batch" : "รอบนี้", executableCount],
          [language === "en" ? "Duplicate IDs" : "ID ซ้ำ", estimate.duplicatePlaceIds],
        ].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-white/[0.035] p-2"><p className="text-[8px] text-white/35">{label}</p><p className="mt-1 text-[15px] font-bold">{value}</p></div>)}</div>
        {scope === "missing_id" && <p className="mt-3 rounded-xl border border-amber-300/10 bg-amber-300/[0.05] p-2 text-[8px] leading-4 text-amber-100">{language === "en" ? "Records without a Google Place ID are not eligible for Place Details. Resolve identity through a separate explicit Google Search request first." : "ร้านที่ไม่มี Google Place ID จะไม่ถูกนับเป็น Place Details Request ต้องใช้ Google Search แบบกดสั่งเองเพื่อหา ID ก่อน"}</p>}
        {estimate.skippedByLimit > 0 && <p className="mt-3 text-[8px] text-amber-100">{estimate.newRequests} requests selected • safety limit {safetyLimit} • this run will send the first {executableCount} only.</p>}
        <div className="mt-3 flex items-center justify-between gap-3"><span className="text-[8px] text-white/35">Maximum requests per manual run</span><select value={safetyLimit} disabled={Boolean(progress)} data-testid="google-api-batch-limit" onChange={(event) => updateApiControl({ batchLimit: Number(event.target.value) as typeof apiControl.batchLimit })} className="rounded-xl border border-white/10 bg-[#07111f] px-3 py-2 text-[9px]">{GOOGLE_BATCH_LIMIT_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={!requestPlaces.length || Boolean(progress)} onClick={() => setPreviewOpen(true)} className="amd-chip flex min-h-11 items-center gap-2 px-4 text-[9px] font-bold disabled:opacity-40"><Eye className="h-4 w-4" />{language === "en" ? `Preview ${estimate.newRequests} Requests` : `ดูรายการ ${estimate.newRequests} Requests`}</button>
          <button type="button" disabled={!apiKey || apiControl.locked || executableCount <= 0 || Boolean(progress)} onClick={requestRun} className="amd-btn amd-btn-primary flex min-h-11 items-center gap-2 rounded-xl px-4 text-[10px] font-bold disabled:opacity-40">{progress ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{language === "en" ? `Run ${executableCount} Google Requests` : `ส่ง ${executableCount} Requests`}</button>
          {progress && <button type="button" onClick={() => { cancelRef.current = true; }} className="amd-btn min-h-11 rounded-xl border border-rose-300/15 px-4 text-[9px] font-bold text-rose-200">{language === "en" ? "Cancel Remaining Requests" : "ยกเลิก Request ที่เหลือ"}</button>}
        </div>
        <p className="mt-3 text-[8px] leading-4 text-white/30">Google Maps Platform may charge for usage beyond the applicable free allowance. This app estimates request counts only; actual billing depends on SKU, field mask, usage tier and billing account.</p>
      </div>

      <div className="mt-4 rounded-2xl border border-white/[0.07] bg-black/10 p-3">
        <p className="text-[9px] font-bold">{language === "en" ? "Requested live fields" : "ฟิลด์สดที่ขอ"}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">{fields.map((field) => <span key={field} className="rounded-lg bg-white/[0.04] px-2 py-1 text-[8px] text-white/40">{field}</span>)}</div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/[0.07] bg-black/10 p-3">
        <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold">GOOGLE API USAGE</p><p className="mt-1 text-[8px] text-white/30">Local request tracking • not official Google Billing usage</p></div><span className="rounded-full border border-cyan-300/15 bg-cyan-300/[0.05] px-2 py-1 text-[7px] font-bold text-cyan-200">LOCAL COUNTERS</span></div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{[
          ["Today", usage.today], ["This Month", usage.month], ["Place Details", usage.placeDetails], ["Text Search", usage.textSearch], ["Failed Requests", usage.failedRequests], ["Retries", usage.retries], ["Network Attempts", usage.networkAttempts], ["This Session", usage.session],
        ].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-white/[0.035] p-2"><p className="text-[7px] text-white/28">{label}</p><p className="mt-1 text-[15px] font-bold">{value}</p></div>)}</div>

        <div className="mt-4 border-t border-white/[0.06] pt-3">
          <p className="text-[9px] font-bold">REQUEST SAFETY LIMITS</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <label className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-2"><span className="text-[7px] text-white/30">Maximum per batch</span><select data-testid="api-control-batch-setting" value={apiControl.batchLimit} disabled={Boolean(progress)} onChange={(event) => updateApiControl({ batchLimit: Number(event.target.value) as typeof apiControl.batchLimit })} className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-[#07111f] px-2 text-[9px]">{GOOGLE_BATCH_LIMIT_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-2"><span className="text-[7px] text-white/30">Daily warning limit</span><input data-testid="api-control-daily-warning" type="number" min={1} value={apiControl.dailyWarningLimit} onChange={(event) => updateApiControl({ dailyWarningLimit: Number(event.target.value) })} className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-[#07111f] px-2 text-[9px]" /></label>
            <label className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-2"><span className="text-[7px] text-white/30">Monthly warning limit</span><input data-testid="api-control-monthly-warning" type="number" min={1} value={apiControl.monthlyWarningLimit} onChange={(event) => updateApiControl({ monthlyWarningLimit: Number(event.target.value) })} className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-[#07111f] px-2 text-[9px]" /></label>
          </div>
          <p className="mt-2 text-[8px] leading-4 text-white/28">Default batch size is 50. Limits are never increased automatically. Existing execution ceiling remains {DEFAULT_GOOGLE_DAILY_LIMIT} requests/day.</p>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">{[["Daily request warning", dailyWarning], ["Monthly request warning", monthlyWarning]].map(([label, warning]) => { const item = warning as typeof dailyWarning; const warnClass = item.level >= 100 ? "border-rose-300/15 bg-rose-300/[0.05] text-rose-100" : item.level >= 90 ? "border-amber-300/20 bg-amber-300/[0.06] text-amber-100" : item.level >= 75 ? "border-amber-300/10 bg-amber-300/[0.035] text-amber-100" : "border-white/[0.06] bg-white/[0.025] text-white/55"; return <div key={String(label)} className={`rounded-xl border p-3 ${warnClass}`}><div className="flex items-center justify-between gap-2"><p className="text-[8px] font-semibold">{String(label)}</p><strong className="text-[11px]">{item.percent}%</strong></div><p className="mt-1 text-[8px]">{item.used.toLocaleString()} / {item.limit.toLocaleString()}</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-current opacity-70" style={{ width: `${Math.min(100, item.percent)}%` }} /></div>{item.level >= 90 && <p className="mt-2 text-[8px] leading-4">{language === "en" ? "Google API usage is approaching your configured safety threshold." : "การใช้งาน Google API กำลังเข้าใกล้ Safety Threshold ที่กำหนด"}</p>}</div>; })}</div>
      </div>

      {progress && <div className="mt-4 rounded-2xl border border-cyan-300/10 bg-cyan-300/[0.04] p-3"><div className="flex items-center gap-2"><LoaderCircle className="h-4 w-4 animate-spin text-[#00D9FF]" /><p className="text-[10px] font-bold">{language === "en" ? "Checking Google data" : "กำลังตรวจข้อมูล Google"}</p></div><div className="mt-3 grid grid-cols-4 gap-2 text-center">{[["Completed", progress.completed], ["Remaining", progress.remaining], ["Failed", progress.failed], ["Network", progress.networkAttempts]].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-white/[0.035] p-2"><p className="text-[7px] text-white/30">{label}</p><p className="mt-1 text-[14px] font-bold">{value}</p></div>)}</div>{progress.currentName && <p className="mt-2 truncate text-[8px] text-white/35">{progress.currentName}</p>}</div>}
      {error && <p className="mt-3 rounded-xl border border-rose-300/10 bg-rose-300/[0.05] px-3 py-2 text-[9px] text-rose-100">{error}</p>}

      {result && <div className="mt-4 rounded-2xl border border-white/[0.07] bg-black/10 p-3"><p className="text-[10px] font-bold">REQUEST SUMMARY</p><div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">{[
        ["Logical lookups", result.logicalRequests], ["Actually attempted", result.networkAttempts], ["Succeeded", result.succeeded], ["Failed", result.failed], ["Retries", result.retries], ["Network attempts", result.networkAttempts],
      ].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-white/[0.035] p-2 text-center"><p className="text-[7px] text-white/30">{label}</p><p className="mt-1 text-[14px] font-bold">{value}</p></div>)}</div>{result.cancelled && <p className="mt-2 text-[8px] text-amber-100">Batch cancelled. Completed requests remain completed.</p>}{failedPlaces.length > 0 && <button type="button" disabled={apiControl.locked || Boolean(progress)} onClick={() => setRetryConfirmOpen(true)} className="amd-chip mt-3 min-h-10 px-3 text-[9px] font-bold text-amber-100">{language === "en" ? `Retry ${failedPlaces.length} Failed Requests` : `Retry ${failedPlaces.length} Requests ที่ล้มเหลว`}</button>}</div>}

      {reviews.length > 0 && <div className="mt-4 space-y-3"><div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-200" /><p className="text-[10px] font-bold">{language === "en" ? "Review live differences" : "ตรวจความต่างจากข้อมูลสด"}</p></div>{reviews.map((item) => <article key={item.place.id} className="rounded-2xl border border-white/[0.07] bg-black/10 p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-bold">{item.place.name}</p><p className="mt-1 text-[8px] text-white/35">Place ID: {item.place.googlePlaceId}</p></div>{item.live.googleMapsUrl && <a href={item.live.googleMapsUrl} target="_blank" rel="noreferrer" className="amd-chip flex h-9 min-h-0 items-center gap-1 px-2 text-[8px]">Google <ExternalLink className="h-3 w-3" /></a>}</div><div className="mt-3 space-y-2">{item.fields.map((field) => <div key={field.label} className="rounded-xl border border-white/[0.05] bg-white/[0.025] p-2"><div className="flex items-center justify-between gap-2"><p className="text-[9px] font-semibold">{field.label}</p><span className={`text-[8px] font-bold uppercase ${field.risk === "high" ? "text-amber-200" : "text-[#8ecbff]"}`}>{field.risk}</span></div><p className="mt-1 break-all text-[8px] leading-4 text-white/38">{String(field.existing ?? "—")} → <span className="text-white/72">{String(field.live ?? "—")}</span></p></div>)}</div></article>)}</div>}
      {result && reviews.length === 0 && result.succeeded > 0 && <p className="mt-3 flex items-center gap-2 text-[9px] text-emerald-200"><CheckCircle2 className="h-4 w-4" />{language === "en" ? "No live differences detected for the successfully checked places." : "ไม่พบความต่างในร้านที่ตรวจสำเร็จ"}</p>}

      <div className="mt-4 rounded-2xl border border-white/[0.07] bg-black/10 p-3"><div className="flex items-center gap-2"><History className="h-4 w-4 text-[#8ecbff]" /><p className="text-[9px] font-bold">REQUEST HISTORY</p></div>{history.length ? <div className="mt-2 space-y-2">{history.map(([day, item]) => <div key={day} className="rounded-xl bg-white/[0.03] p-2"><p className="text-[8px] font-bold">{day}</p><p className="mt-1 text-[8px] leading-4 text-white/38">{item.placeDetails} Place Details • {item.textSearch} Text Search • {item.success} success • {item.failed} failed • {item.attempts} network attempts{item.candidates ? ` • ${item.candidates} candidates` : ""}</p></div>)}</div> : <p className="mt-2 text-[8px] text-white/30">No local request history yet.</p>}</div>

      {previewOpen && <div className="amd-sheet-backdrop z-[120]"><button type="button" aria-label="Close" className="absolute inset-0" onClick={() => setPreviewOpen(false)} /><section className="amd-sheet amd-glass-strong relative max-h-[86dvh] w-full max-w-[560px] overflow-y-auto rounded-t-[30px] p-4"><div className="flex items-center justify-between"><div><p className="text-[9px] font-bold text-[#00D9FF]">REQUEST PREVIEW</p><h3 className="mt-1 text-[18px] font-bold">{preview.queued.length} requests queued</h3></div><button type="button" onClick={() => setPreviewOpen(false)} className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.06]"><X className="h-4 w-4" /></button></div><p className="mt-2 text-[8px] text-white/35">Previewing generates zero Google API calls.</p><div className="mt-3 space-y-2">{preview.queued.map((place, index) => <div key={place.id} className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-[9px] font-bold">{index + 1}. {place.name}</p><p className="mt-1 break-all text-[7px] text-white/30">{place.googlePlaceId}</p><p className="mt-1 text-[7px] text-white/30">Last checked: {place.lastChecked || place.lastUpdated || place.lastVerified || "—"} • {freshnessState(place)}</p></div><button type="button" onClick={() => setSinglePlace(place)} className="amd-chip h-9 min-h-0 shrink-0 px-2 text-[8px]">Refresh 1</button></div></div>)}</div>{preview.cached.length > 0 && <p className="mt-3 text-[8px] text-emerald-200">{preview.cached.length} valid cache hits will be skipped.</p>}{preview.queuedBeyondLimit.length > 0 && <p className="mt-2 text-[8px] text-amber-100">{preview.queuedBeyondLimit.length} additional requests are beyond the current safety limit.</p>}</section></div>}

      {singlePlace && <div className="amd-sheet-backdrop z-[130]"><button type="button" aria-label="Close" className="absolute inset-0" onClick={() => setSinglePlace(null)} /><section className="amd-sheet amd-glass-strong relative w-full max-w-[460px] rounded-t-[30px] p-5"><p className="text-[9px] font-bold text-[#00D9FF]">MANUAL PLACE REQUEST</p><h3 className="mt-1 text-[18px] font-bold">{singlePlace.name}</h3><p className="mt-3 text-[10px] text-white/55">{language === "en" ? "Estimated requests: 1" : "คาดว่าจะใช้ 1 Request"}</p><p className="mt-1 text-[8px] text-white/30">Nothing is sent until you press the button below.</p><div className="mt-4 flex gap-2"><button type="button" onClick={() => setSinglePlace(null)} className="amd-chip flex-1 min-h-11 text-[9px]">Cancel</button><button type="button" disabled={apiControl.locked} onClick={() => { const place = singlePlace; setSinglePlace(null); void executeBatch([place]); }} className="amd-btn amd-btn-primary flex-1 rounded-xl text-[9px] font-bold disabled:opacity-35">{apiControl.locked ? "Requests Locked" : "Run 1 Request"}</button></div></section></div>}

      {retryConfirmOpen && <div className="amd-sheet-backdrop z-[132]"><button type="button" aria-label="Close" className="absolute inset-0" onClick={() => setRetryConfirmOpen(false)} /><section className="amd-sheet amd-glass-strong relative w-full max-w-[460px] rounded-t-[30px] p-5"><AlertTriangle className="h-6 w-6 text-amber-200" /><h3 className="mt-3 text-[18px] font-bold">Retry Failed Google Requests?</h3><p className="mt-2 text-[9px] leading-5 text-white/45">This will send up to {failedPlaces.length} manual Google Places requests again and may consume quota.</p><div className="mt-4 flex gap-2"><button type="button" onClick={() => setRetryConfirmOpen(false)} className="amd-chip min-h-11 flex-1 text-[9px]">Cancel</button><button type="button" onClick={() => { setRetryConfirmOpen(false); void runFailedRetry(); }} className="amd-btn amd-btn-primary flex-1 rounded-xl text-[9px] font-bold">Send Request</button></div></section></div>}

      {confirmOpen && <div className="amd-sheet-backdrop z-[130]"><button type="button" aria-label="Close" className="absolute inset-0" onClick={() => setConfirmOpen(false)} /><section className="amd-sheet amd-glass-strong relative w-full max-w-[480px] rounded-t-[30px] p-5"><AlertTriangle className="h-6 w-6 text-amber-200" /><h3 className="mt-3 text-[18px] font-bold">Confirm {executableCount} Google Requests</h3><p className="mt-2 text-[9px] leading-5 text-white/45">You are about to send approximately {executableCount} Google Places requests. This may consume Google Maps Platform quota and may create billable usage if the applicable free allowance is exceeded.</p>{strongWarning && <p className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.06] p-3 text-[9px] font-semibold text-amber-100">Large selection: {estimate.newRequests} new requests are eligible. Safety limit restricts this batch to {executableCount}.</p>}<div className="mt-4 flex gap-2"><button type="button" onClick={() => setConfirmOpen(false)} className="amd-chip flex-1 min-h-11 text-[9px]">Cancel</button><button type="button" onClick={() => { setConfirmOpen(false); void executeBatch(); }} className="amd-btn amd-btn-primary flex-1 rounded-xl text-[9px] font-bold">Send Request</button></div></section></div>}

      <p className="mt-3 text-[8px] leading-4 text-white/28">Google live values are review references only and are not auto-written into the permanent database. No background retries, timers, idle jobs or automatic Google Places requests are used.</p>
    </section>
  );
}

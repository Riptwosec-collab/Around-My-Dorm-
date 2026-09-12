"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, CloudDownload, Database, RefreshCw, ShieldAlert, X } from "lucide-react";
import {
  GOOGLE_CLOUD_CACHE_TTL_DAYS,
  loadGoogleCloudEnrichmentStatus,
  runGoogleCloudAutoEnrichment,
  type GoogleCloudEnrichmentProgress,
  type GoogleCloudEnrichmentResult,
  type GoogleCloudEnrichmentStatus,
} from "@/lib/google-cloud-enrichment";
import { getGoogleApiControlSettings, hydrateGoogleApiControlSettings } from "@/lib/google-api-control";
import { getGoogleRequestUsage, hydrateGoogleRequestLogs } from "@/lib/google-request-manager";
import type { Place } from "@/types/place";

const EMPTY_PROGRESS: GoogleCloudEnrichmentProgress = {
  current: 0,
  total: 0,
  currentName: null,
  networkRequests: 0,
  linked: 0,
  cached: 0,
  review: 0,
  failed: 0,
};

export function GoogleCloudAutoEnrichment({ places, language, onReload }: { places: Place[]; language: "th" | "en"; onReload: () => void }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const [status, setStatus] = useState<GoogleCloudEnrichmentStatus | null>(null);
  const [progress, setProgress] = useState<GoogleCloudEnrichmentProgress>(EMPTY_PROGRESS);
  const [result, setResult] = useState<GoogleCloudEnrichmentResult | null>(null);
  const [running, setRunning] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [apiLocked, setApiLocked] = useState(() => getGoogleApiControlSettings().locked);
  const [dailyLimit, setDailyLimit] = useState(() => getGoogleApiControlSettings().dailyWarningLimit);
  const [usageToday, setUsageToday] = useState(() => getGoogleRequestUsage().today);
  const cancelRef = useRef(false);

  async function refreshCloudStatus() {
    const next = await loadGoogleCloudEnrichmentStatus(places);
    setStatus(next);
    setUsageToday(getGoogleRequestUsage().today);
    return next;
  }

  useEffect(() => {
    let alive = true;
    void Promise.all([
      loadGoogleCloudEnrichmentStatus(places),
      hydrateGoogleApiControlSettings(),
      hydrateGoogleRequestLogs(),
    ]).then(([nextStatus, control]) => {
      if (!alive) return;
      setStatus(nextStatus);
      setApiLocked(control.locked);
      setDailyLimit(control.dailyWarningLimit);
      setUsageToday(getGoogleRequestUsage().today);
    }).catch((error) => {
      if (alive) setMessage(error instanceof Error ? error.message : "Cloud enrichment status unavailable");
    });
    const sync = () => {
      const control = getGoogleApiControlSettings();
      setApiLocked(control.locked);
      setDailyLimit(control.dailyWarningLimit);
      setUsageToday(getGoogleRequestUsage().today);
    };
    window.addEventListener("amd-google-api-control-change", sync);
    window.addEventListener("amd-google-usage-change", sync);
    return () => {
      alive = false;
      window.removeEventListener("amd-google-api-control-change", sync);
      window.removeEventListener("amd-google-usage-change", sync);
    };
  }, [places]);

  const remainingToday = Math.max(0, dailyLimit - usageToday);
  const estimate = status?.estimatedMaxRequests ?? places.length * 2;
  const requestRisk = useMemo(() => {
    if (estimate > remainingToday) return "limit";
    if (estimate >= remainingToday * 0.8) return "high";
    return "normal";
  }, [estimate, remainingToday]);

  async function runBulk() {
    if (running) return;
    setConfirmOpen(false);
    setRunning(true);
    setMessage(null);
    setResult(null);
    cancelRef.current = false;
    setProgress({ ...EMPTY_PROGRESS, total: places.length });
    try {
      const next = await runGoogleCloudAutoEnrichment({
        apiKey,
        places,
        language,
        isCancelled: () => cancelRef.current,
        onProgress: (value) => setProgress(value),
      });
      setResult(next);
      await refreshCloudStatus();
      onReload();
      if (next.stoppedByLimit) {
        setMessage(next.stoppedReason || (language === "en" ? "Stopped at the daily safety limit." : "หยุดเมื่อถึง Daily Safety Limit"));
      } else if (next.cancelled) {
        setMessage(language === "en" ? "Bulk enrichment was cancelled. Completed results remain saved in Supabase." : "ยกเลิก Bulk enrichment แล้ว • ผลที่ทำเสร็จก่อนหน้านี้ยังถูกบันทึกไว้ใน Supabase");
      } else {
        setMessage(language === "en" ? "Google → Supabase enrichment completed." : "Google → Supabase enrichment เสร็จแล้ว");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Google cloud enrichment failed");
    } finally {
      setRunning(false);
    }
  }

  const percent = progress.total ? Math.min(100, Math.round((progress.current / progress.total) * 100)) : 0;

  return (
    <section data-testid="google-cloud-auto-enrichment" className="amd-glass amd-card mt-4 overflow-hidden p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-bold">GOOGLE → SUPABASE AUTO ENRICHMENT</p>
            <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[0.07] px-2 py-1 text-[8px] font-extrabold text-cyan-200">MANUAL BULK REQUEST</span>
          </div>
          <p className="mt-1 text-[9px] leading-5 text-[var(--amd-text-2)]">
            {language === "en"
              ? `One confirmed click checks every shop, links an unambiguous Google Place ID, fetches missing details, and stores a ${GOOGLE_CLOUD_CACHE_TTL_DAYS}-day cloud cache. Normal browsing reads Supabase only.`
              : `กดยืนยันครั้งเดียวเพื่อไล่ตรวจทุกร้าน จับคู่ Google Place ID ที่ชัดเจน ดึงข้อมูลที่ขาด และเก็บ Cloud Cache ${GOOGLE_CLOUD_CACHE_TTL_DAYS} วัน • การเปิดเว็บปกติอ่าน Supabase เท่านั้น`}
          </p>
        </div>
        <CloudDownload className="h-5 w-5 shrink-0 text-[#00D9FF]" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          [language === "en" ? "All shops" : "ร้านทั้งหมด", status?.total ?? places.length],
          [language === "en" ? "Place ID linked" : "มี Place ID", status?.linked ?? 0],
          [language === "en" ? "Fresh cloud cache" : "Cache ใช้งานได้", status?.freshCache ?? 0],
          [language === "en" ? "Needs review" : "ต้องตรวจ", status?.review ?? 0],
          [language === "en" ? "Max request estimate" : "Request สูงสุด", estimate],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-white/[0.06] bg-black/10 p-3">
            <p className="text-[8px] leading-4 text-white/36">{label}</p>
            <p className="mt-1 text-[19px] font-bold">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-2xl border border-white/[0.06] bg-black/10 p-3 text-[8px] leading-5 text-white/45">
        <div className="flex items-center gap-2"><Database className="h-4 w-4 text-[#8ecbff]" /><strong className="text-white/70">Cloud-first after refresh</strong></div>
        <p className="mt-1">{language === "en" ? "Place IDs remain as the durable identity link. Google Places content is kept as an expiring cache and only fills fields that are currently missing; existing local values are not overwritten." : "Place ID ใช้เป็นตัวเชื่อมระยะยาว ส่วน Google Places Content เก็บแบบมีวันหมดอายุ และเติมเฉพาะช่องที่ยังขาด — ไม่เขียนทับข้อมูลเดิมที่มีอยู่"}</p>
        <p className="mt-1">Today: {usageToday} / {dailyLimit} manual requests • Remaining safety headroom: {remainingToday}</p>
        {status?.lastFetchedAt && <p>Last cloud refresh: {new Date(status.lastFetchedAt).toLocaleString(language === "en" ? "en-GB" : "th-TH")}</p>}
      </div>

      {apiLocked && <div className="mt-3 flex items-start gap-2 rounded-2xl border border-amber-300/15 bg-amber-300/[0.06] p-3 text-[9px] leading-5 text-amber-100"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /><span>{language === "en" ? "Google API Request Lock is ON. Unlock it in the Google API Control section before running this bulk request." : "Google API Request Lock ยังเปิดอยู่ • ปลดล็อกในส่วน Google API Control ก่อนเริ่ม Bulk Request"}</span></div>}

      {requestRisk === "limit" && !apiLocked && <div className="mt-3 flex items-start gap-2 rounded-2xl border border-rose-300/15 bg-rose-300/[0.05] p-3 text-[9px] leading-5 text-rose-100"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{language === "en" ? `The worst-case estimate (${estimate}) exceeds today's remaining safety headroom (${remainingToday}). The run will save completed shops and stop automatically at the limit.` : `ประมาณการสูงสุด ${estimate} requests มากกว่าโควตาความปลอดภัยที่เหลือวันนี้ ${remainingToday} • ระบบจะบันทึกร้านที่ทำเสร็จแล้วและหยุดอัตโนมัติเมื่อถึง Limit`}</span></div>}

      {running && <div className="mt-4 rounded-2xl border border-cyan-300/10 bg-cyan-300/[0.04] p-3">
        <div className="flex items-center justify-between gap-3 text-[9px]"><span className="min-w-0 truncate">{progress.currentName || (language === "en" ? "Preparing…" : "กำลังเตรียม…")}</span><strong>{progress.current} / {progress.total}</strong></div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full bg-[#149CFF] transition-all" style={{ width: `${percent}%` }} /></div>
        <div className="mt-3 grid grid-cols-4 gap-1 text-center text-[8px] text-white/45"><div>API<br/><strong className="text-white/75">{progress.networkRequests}</strong></div><div>Linked<br/><strong className="text-emerald-200">{progress.linked}</strong></div><div>Review<br/><strong className="text-amber-100">{progress.review}</strong></div><div>Failed<br/><strong className="text-rose-200">{progress.failed}</strong></div></div>
        <button type="button" onClick={() => { cancelRef.current = true; }} className="amd-chip mt-3 h-10 min-h-0 w-full px-3 text-[9px] text-rose-100">{language === "en" ? "Cancel after current request" : "ยกเลิกหลัง Request ปัจจุบัน"}</button>
      </div>}

      {result && !running && <div className="mt-3 flex items-start gap-2 rounded-2xl border border-emerald-300/10 bg-emerald-300/[0.04] p-3 text-[9px] leading-5 text-emerald-100"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><span>{language === "en" ? `Processed ${result.current}/${result.total} shops • ${result.networkRequests} Google network requests • ${result.cached} cloud caches • ${result.review} review.` : `ประมวลผล ${result.current}/${result.total} ร้าน • Google network ${result.networkRequests} requests • Cloud cache ${result.cached} ร้าน • รอตรวจ ${result.review} ร้าน`}</span></div>}

      {message && <p className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2 text-[9px] leading-5 text-white/60">{message}</p>}

      <div className="mt-4 flex gap-2">
        <button data-testid="google-cloud-enrich-all" type="button" disabled={running || !apiKey || apiLocked || places.length === 0} onClick={() => setConfirmOpen(true)} className="amd-btn amd-btn-primary flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-[10px] font-bold disabled:opacity-40"><RefreshCw className={`h-4 w-4 ${running ? "animate-spin" : ""}`} />{language === "en" ? `Enrich all ${places.length} shops` : `ดึง Google → Cloud ทั้ง ${places.length} ร้าน`}</button>
        <button type="button" disabled={running} onClick={() => void refreshCloudStatus().catch((error) => setMessage(error instanceof Error ? error.message : "Refresh failed"))} className="amd-chip min-h-12 px-4 text-[9px]">{language === "en" ? "Refresh status" : "รีเฟรชสถานะ"}</button>
      </div>

      {!apiKey && <p className="mt-2 text-[8px] text-rose-200">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is missing.</p>}

      {confirmOpen && <div className="fixed inset-0 z-[160] grid place-items-end bg-black/70 p-3 sm:place-items-center">
        <button type="button" aria-label="Close confirmation" className="absolute inset-0" onClick={() => setConfirmOpen(false)} />
        <div className="amd-glass-strong relative w-full max-w-[520px] rounded-[28px] border border-white/[0.08] p-5 shadow-2xl">
          <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#00D9FF]">CONFIRM GOOGLE REQUESTS</p><h3 className="mt-1 text-[18px] font-bold">{language === "en" ? `Enrich all ${places.length} shops?` : `ดึงข้อมูล Google ให้ทั้ง ${places.length} ร้าน?`}</h3></div><button type="button" onClick={() => setConfirmOpen(false)} className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.06]"><X className="h-4 w-4" /></button></div>
          <div className="mt-4 rounded-2xl border border-amber-300/12 bg-amber-300/[0.05] p-3 text-[9px] leading-5 text-amber-100">
            <p><strong>{language === "en" ? "Worst-case estimate:" : "ประมาณการสูงสุด:"}</strong> {estimate} Google Places requests</p>
            <p>{language === "en" ? `${status?.estimatedSearchRequests ?? places.length} Text Search + up to ${status?.estimatedDetailRequests ?? places.length} Place Details. No request is sent until you press Confirm below.` : `${status?.estimatedSearchRequests ?? places.length} Text Search + สูงสุด ${status?.estimatedDetailRequests ?? places.length} Place Details • ยังไม่ยิง API จนกว่าจะกด Confirm ด้านล่าง`}</p>
            <p className="mt-1">{language === "en" ? "Ambiguous matches are saved for review instead of being linked to the wrong shop. There are no background retries or automatic refresh jobs." : "ร้านที่จับคู่กำกวมจะถูกส่งเข้า Review แทนการ Link ผิดร้าน • ไม่มี Background Retry และไม่มี Auto Refresh เอง"}</p>
          </div>
          <div className="mt-4 flex gap-2"><button type="button" onClick={() => setConfirmOpen(false)} className="amd-chip min-h-11 flex-1 px-4 text-[9px]">{language === "en" ? "Cancel" : "ยกเลิก"}</button><button data-testid="confirm-google-cloud-enrich-all" type="button" onClick={() => void runBulk()} className="amd-btn amd-btn-primary min-h-11 flex-[1.4] rounded-xl px-4 text-[9px] font-bold">{language === "en" ? "Confirm & Send Requests" : "ยืนยันและเริ่ม Request"}</button></div>
        </div>
      </div>}
    </section>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, CloudDownload, Database, RefreshCw, X } from "lucide-react";
import {
  GOOGLE_BULK_RUN_REQUEST_LIMIT,
  GOOGLE_CLOUD_CACHE_TTL_DAYS,
  loadGoogleCloudEnrichmentStatus,
  runGoogleCloudAutoEnrichment,
  type GoogleCloudEnrichmentProgress,
  type GoogleCloudEnrichmentResult,
  type GoogleCloudEnrichmentStatus,
} from "@/lib/google-cloud-enrichment";
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
  lastError: null,
};

export function GoogleCloudAutoEnrichment({
  places,
  language,
  onReload,
}: {
  places: Place[];
  language: "th" | "en";
  onReload: () => void;
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const [status, setStatus] = useState<GoogleCloudEnrichmentStatus | null>(null);
  const [progress, setProgress] = useState<GoogleCloudEnrichmentProgress>(EMPTY_PROGRESS);
  const [result, setResult] = useState<GoogleCloudEnrichmentResult | null>(null);
  const [running, setRunning] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const cancelRef = useRef(false);

  async function refreshCloudStatus() {
    const next = await loadGoogleCloudEnrichmentStatus(places);
    setStatus(next);
    return next;
  }

  useEffect(() => {
    let alive = true;
    void loadGoogleCloudEnrichmentStatus(places)
      .then((next) => {
        if (alive) setStatus(next);
      })
      .catch((error) => {
        if (alive) setMessage(error instanceof Error ? error.message : "Cloud enrichment status unavailable");
      });
    return () => {
      alive = false;
    };
  }, [places]);

  const estimate = status?.estimatedMaxRequests ?? places.length * 2;
  const requestRisk = useMemo(() => {
    if (estimate > GOOGLE_BULK_RUN_REQUEST_LIMIT) return "limit";
    if (estimate >= GOOGLE_BULK_RUN_REQUEST_LIMIT * 0.8) return "high";
    return "normal";
  }, [estimate]);

  async function runBulk() {
    if (running) return;
    setConfirmOpen(false);
    setCancelConfirmOpen(false);
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

      if (next.stoppedBySystemicError) {
        setMessage(
          language === "en"
            ? `Stopped after the first systemic Google error to avoid repeating failed requests. ${next.stoppedReason || next.lastError || "See diagnostics."}`
            : `หยุดหลังพบ Google error ที่เป็นปัญหาระดับระบบครั้งแรก เพื่อไม่ยิงซ้ำทั้ง 91 ร้าน • ${next.stoppedReason || next.lastError || "ดู Diagnostics"}`,
        );
      } else if (next.stoppedByLimit) {
        setMessage(
          language === "en"
            ? `${next.stoppedReason || "Safety limit reached."} Completed shops are already saved. Press the button again to continue the remaining shops.`
            : `${next.stoppedReason || "ถึง Safety Limit"} • ร้านที่เสร็จแล้วถูกบันทึกไว้แล้ว กดอีกครั้งเพื่อทำร้านที่เหลือต่อ`,
        );
      } else if (next.cancelled) {
        setMessage(
          language === "en"
            ? "Cancelled. Completed shops remain saved in Supabase."
            : "ยกเลิกแล้ว • ร้านที่ทำเสร็จก่อนหน้านี้ยังถูกเก็บไว้ใน Supabase",
        );
      } else {
        setMessage(
          language === "en"
            ? "Google → Supabase enrichment completed. Reloading place data from cloud."
            : "Google → Supabase enrichment เสร็จแล้ว • กำลังใช้ข้อมูลจาก Cloud กับหน้าร้าน",
        );
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Google cloud enrichment failed");
    } finally {
      setCancelConfirmOpen(false);
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
            <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[0.07] px-2 py-1 text-[8px] font-extrabold text-cyan-200">
              MANUAL BULK REQUEST
            </span>
          </div>
          <p className="mt-1 text-[9px] leading-5 text-[var(--amd-text-2)]">
            {language === "en"
              ? `One confirmed click checks every shop, links clear Google Place IDs, fetches details, and stores a ${GOOGLE_CLOUD_CACHE_TTL_DAYS}-day shared Supabase cache. Normal browsing never calls Google.`
              : `กดยืนยันครั้งเดียวเพื่อไล่ทุกร้าน → หา Google Place ID → ดึงรายละเอียด → เก็บ Shared Supabase Cache ${GOOGLE_CLOUD_CACHE_TTL_DAYS} วัน • เปิดเว็บปกติไม่ยิง Google`}
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
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-[#8ecbff]" />
          <strong className="text-white/70">Shared cloud data — no Supabase login required</strong>
        </div>
        <p className="mt-1">
          {language === "en"
            ? "This flow no longer depends on Anonymous Auth. Google results are saved into bounded shared cache/link tables and only fill missing local fields."
            : "แก้แล้ว: Flow นี้ไม่พึ่ง Supabase Anonymous Auth อีกต่อไป ผล Google จะบันทึกลงตาราง Shared Cache/Place Link โดยตรง และเติมเฉพาะช่องที่ข้อมูลเดิมยังขาด"}
        </p>
        <p className="mt-1">Per-run safety cap: {GOOGLE_BULK_RUN_REQUEST_LIMIT} Google requests</p>
        {status?.lastFetchedAt && (
          <p>Last cloud refresh: {new Date(status.lastFetchedAt).toLocaleString(language === "en" ? "en-GB" : "th-TH")}</p>
        )}
      </div>

      {requestRisk !== "normal" && (
        <div className={`mt-3 flex items-start gap-2 rounded-2xl border p-3 text-[9px] leading-5 ${requestRisk === "limit" ? "border-rose-300/15 bg-rose-300/[0.05] text-rose-100" : "border-amber-300/15 bg-amber-300/[0.05] text-amber-100"}`}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {requestRisk === "limit"
              ? language === "en"
                ? `Worst-case estimate is ${estimate}, above the ${GOOGLE_BULK_RUN_REQUEST_LIMIT}-request run cap. The app saves progress and you can press again to continue.`
                : `Worst case ${estimate} requests มากกว่า Run Limit ${GOOGLE_BULK_RUN_REQUEST_LIMIT} • ระบบบันทึกความคืบหน้าไว้ แล้วกดซ้ำเพื่อทำต่อได้`
              : language === "en"
                ? `This run may use up to ${estimate} Google requests.`
                : `รอบนี้อาจใช้ Google สูงสุดประมาณ ${estimate} requests`}
          </span>
        </div>
      )}

      {running && (
        <div className="mt-4 rounded-2xl border border-cyan-300/10 bg-cyan-300/[0.04] p-3">
          <div className="flex items-center justify-between gap-3 text-[9px]">
            <span className="min-w-0 truncate">{progress.currentName || (language === "en" ? "Preparing…" : "กำลังเตรียม…")}</span>
            <strong>{progress.current} / {progress.total}</strong>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full bg-[#149CFF] transition-all" style={{ width: `${percent}%` }} />
          </div>
          <div className="mt-3 grid grid-cols-4 gap-1 text-center text-[8px] text-white/45">
            <div>API<br /><strong className="text-white/75">{progress.networkRequests}</strong></div>
            <div>Linked<br /><strong className="text-emerald-200">{progress.linked}</strong></div>
            <div>Review<br /><strong className="text-amber-100">{progress.review}</strong></div>
            <div>Failed<br /><strong className="text-rose-200">{progress.failed}</strong></div>
          </div>
          {progress.lastError && <p className="mt-2 break-words text-[8px] leading-4 text-rose-200">Latest error: {progress.lastError}</p>}
          {!cancelConfirmOpen ? (
            <button type="button" onClick={() => setCancelConfirmOpen(true)} className="amd-chip mt-3 h-10 min-h-0 w-full px-3 text-[9px] text-rose-100">
              {language === "en" ? "Cancel after current request" : "ยกเลิกหลัง Request ปัจจุบัน"}
            </button>
          ) : (
            <div className="mt-3 rounded-xl border border-rose-300/15 bg-rose-300/[0.04] p-3">
              <p className="text-[9px] leading-5 text-rose-100">
                {language === "en"
                  ? "Confirm cancellation? The current request may finish, then the remaining shops will be skipped."
                  : "ยืนยันยกเลิกหรือไม่? Request ที่กำลังทำอาจทำจนจบ แล้วระบบจะหยุดก่อนร้านที่เหลือ"}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setCancelConfirmOpen(false)} className="amd-chip h-10 min-h-0 px-3 text-[9px]">
                  {language === "en" ? "Keep running" : "ทำต่อ"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    cancelRef.current = true;
                    setCancelConfirmOpen(false);
                  }}
                  className="amd-chip h-10 min-h-0 px-3 text-[9px] text-rose-100"
                >
                  {language === "en" ? "Confirm cancel" : "ยืนยันยกเลิก"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {result && !running && (
        <div className="mt-3 flex items-start gap-2 rounded-2xl border border-emerald-300/10 bg-emerald-300/[0.04] p-3 text-[9px] leading-5 text-emerald-100">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {language === "en"
              ? `Processed ${result.current}/${result.total} shops • ${result.networkRequests} Google requests • ${result.cached} cloud caches • ${result.review} review • ${result.failed} failed.`
              : `ประมวลผล ${result.current}/${result.total} ร้าน • Google ${result.networkRequests} requests • Cloud cache ${result.cached} ร้าน • รอตรวจ ${result.review} • ล้มเหลว ${result.failed}`}
            {result.lastError ? ` • Last error: ${result.lastError}` : ""}
          </span>
        </div>
      )}

      {message && <p className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2 text-[9px] leading-5 text-white/60">{message}</p>}

      <div className="mt-4 flex gap-2">
        <button
          data-testid="google-cloud-enrich-all"
          type="button"
          disabled={running || !apiKey || places.length === 0}
          onClick={() => setConfirmOpen(true)}
          className="amd-btn amd-btn-primary flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-[10px] font-bold disabled:opacity-40"
        >
          <RefreshCw className={`h-4 w-4 ${running ? "animate-spin" : ""}`} />
          {language === "en" ? `Enrich all ${places.length} shops` : `ดึง Google → Cloud ทั้ง ${places.length} ร้าน`}
        </button>
        <button
          type="button"
          disabled={running}
          onClick={() => void refreshCloudStatus().catch((error) => setMessage(error instanceof Error ? error.message : "Refresh failed"))}
          className="amd-chip min-h-12 px-4 text-[9px]"
        >
          {language === "en" ? "Refresh status" : "รีเฟรชสถานะ"}
        </button>
      </div>

      {!apiKey && <p className="mt-2 text-[8px] text-rose-200">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is missing.</p>}

      {confirmOpen && (
        <div className="fixed inset-0 z-[160] grid place-items-end bg-black/70 p-3 sm:place-items-center">
          <button type="button" aria-label="Close confirmation" className="absolute inset-0" onClick={() => setConfirmOpen(false)} />
          <div className="amd-glass-strong relative w-full max-w-[520px] rounded-[28px] border border-white/[0.08] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#00D9FF]">CONFIRM GOOGLE REQUESTS</p>
                <h3 className="mt-1 text-[18px] font-bold">{language === "en" ? `Enrich all ${places.length} shops?` : `ดึงข้อมูล Google ให้ทั้ง ${places.length} ร้าน?`}</h3>
              </div>
              <button type="button" onClick={() => setConfirmOpen(false)} className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.06]"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-4 rounded-2xl border border-white/[0.07] bg-black/20 p-3 text-[9px] leading-5 text-white/55">
              <p>Estimated worst case: <strong className="text-white/80">{estimate}</strong> Google requests</p>
              <p>Per-run hard cap: <strong className="text-white/80">{GOOGLE_BULK_RUN_REQUEST_LIMIT}</strong></p>
              <p>{language === "en" ? "Fresh cache and existing Place IDs are reused, so repeat runs do not re-request completed shops." : "ร้านที่มี Place ID / Cache สดแล้วจะถูกข้าม จึงไม่ยิงซ้ำให้ร้านที่ทำเสร็จแล้ว"}</p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setConfirmOpen(false)} className="amd-chip min-h-11 px-4 text-[9px]">{language === "en" ? "Cancel" : "ยกเลิก"}</button>
              <button data-testid="confirm-google-cloud-enrich-all" type="button" onClick={() => void runBulk()} className="amd-btn amd-btn-primary min-h-11 rounded-xl px-4 text-[9px] font-bold">{language === "en" ? "Send Google Requests" : "ยืนยันและยิง Google API"}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
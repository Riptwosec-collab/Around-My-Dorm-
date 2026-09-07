"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Database, History, RefreshCw, RotateCcw, Search, ShieldCheck, X } from "lucide-react";
import { auditPlaces, findDuplicatePairs, selectPlacesForUpdate, type UpdateMode } from "@/lib/place-update-engine";
import { freshnessState } from "@/lib/data-governance";
import { applyLocalPlacePatch, loadLocalPlaceHistory, rollbackLocalPlaceHistory, type LocalPlaceHistory } from "@/lib/database/places";
import { loadPendingPlaceChanges, savePendingPlaceChanges } from "@/lib/storage/place-updates";
import type { Place } from "@/types/place";

export function DataManagement({ places, databaseSource, language, onClose, onReload }: { places: Place[]; databaseSource: string; language: "th" | "en"; onClose: () => void; onReload: () => void }) {
  const [mode, setMode] = useState<UpdateMode>("older30");
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [auditDone, setAuditDone] = useState(false);
  const [pending, setPending] = useState(() => loadPendingPlaceChanges());
  const [history, setHistory] = useState<LocalPlaceHistory[]>(() => loadLocalPlaceHistory());
  const [message, setMessage] = useState<string | null>(null);

  const summary = useMemo(() => auditPlaces(places), [places]);
  const duplicates = useMemo(() => findDuplicatePairs(places).slice(0, 20), [places]);
  const selected = useMemo(() => selectPlacesForUpdate(places, mode), [places, mode]);
  const lastUpdated = useMemo(() => {
    const dates = places.map((place) => place.lastUpdated || place.lastChecked || place.lastVerified).filter(Boolean).map((value) => new Date(value as string).getTime()).filter(Number.isFinite);
    if (!dates.length) return null;
    return new Date(Math.max(...dates)).toLocaleString(language === "en" ? "en-GB" : "th-TH", { dateStyle: "medium", timeStyle: "short" });
  }, [places, language]);

  async function runLocalAudit() {
    setCancelled(false);
    setAuditDone(false);
    setMessage(null);
    setProgress({ current: 0, total: selected.length });
    for (let index = 0; index < selected.length; index += 1) {
      if (cancelled) break;
      setProgress({ current: index + 1, total: selected.length });
      await new Promise((resolve) => window.setTimeout(resolve, 12));
    }
    setProgress(null);
    setAuditDone(true);
    setMessage(language === "en" ? "Local database audit complete. No external POI provider was called." : "ตรวจฐานข้อมูลในแอปเสร็จแล้ว โดยไม่ได้เรียก External POI API");
  }

  function applySafeChange(changeId: string) {
    const change = pending.find((item) => item.id === changeId);
    if (!change) return;
    const place = places.find((item) => item.id === change.placeId);
    if (!place) return;
    const safeFields = change.fields.filter((field) => field.risk === "safe");
    if (!safeFields.length) {
      setMessage(language === "en" ? "This change contains no safe auto-applicable fields." : "รายการนี้ไม่มีฟิลด์ที่ปลอดภัยพอสำหรับ Apply อัตโนมัติ");
      return;
    }
    const patch = Object.fromEntries(safeFields.map((field) => [field.field, field.incomingValue])) as Partial<Place>;
    applyLocalPlacePatch(place, patch, change.source);
    const next = pending.filter((item) => item.id !== changeId);
    savePendingPlaceChanges(next);
    setPending(next);
    setHistory(loadLocalPlaceHistory());
    onReload();
  }

  function ignoreChange(changeId: string) {
    const next = pending.filter((item) => item.id !== changeId);
    savePendingPlaceChanges(next);
    setPending(next);
  }

  function undo(entry: LocalPlaceHistory) {
    rollbackLocalPlaceHistory(entry);
    setHistory(loadLocalPlaceHistory());
    onReload();
  }

  return (
    <div className="amd-sheet-backdrop z-[100]">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0" />
      <section className="amd-sheet amd-glass-strong relative max-h-[92dvh] w-full max-w-[620px] overflow-y-auto rounded-t-[34px] border-b-0 px-4 pb-[calc(28px+env(safe-area-inset-bottom))] pt-3">
        <div className="sticky top-0 z-20 -mx-4 flex items-center justify-between border-b border-white/[0.06] bg-[var(--amd-glass-strong)] px-4 pb-3 pt-2 backdrop-blur-2xl">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#00D9FF]">DATA MANAGEMENT</p><h2 className="mt-1 text-[22px] font-bold">{language === "en" ? "Place Database" : "จัดการฐานข้อมูลร้าน"}</h2></div>
          <button type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-full bg-white/[0.06]"><X className="h-4 w-4" /></button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[{ label: language === "en" ? "Places" : "สถานที่", value: summary.scanned }, { label: language === "en" ? "Verified" : "ยืนยันแล้ว", value: summary.verified }, { label: language === "en" ? "Stale" : "ข้อมูลเก่า", value: summary.stale }, { label: language === "en" ? "Review" : "ต้องตรวจ", value: summary.needsReview }].map((item) => <div key={item.label} className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-3"><p className="text-[9px] text-[var(--amd-text-3)]">{item.label}</p><p className="mt-1 text-[24px] font-semibold">{item.value}</p></div>)}
        </div>

        <section className="amd-glass amd-card mt-4 p-4">
          <div className="flex items-start gap-3"><Database className="mt-0.5 h-5 w-5 text-[#00D9FF]" /><div><p className="text-[13px] font-semibold">{language === "en" ? "Database-first runtime" : "Database-first runtime"}</p><p className="mt-1 text-[10px] leading-5 text-[var(--amd-text-2)]">{language === "en" ? `Current source: ${databaseSource}. Normal browsing does not query an external POI provider.` : `แหล่งข้อมูลปัจจุบัน: ${databaseSource} • การเปิดแอปปกติจะไม่ยิง External POI API`}</p><p className="mt-1 text-[9px] text-[var(--amd-text-3)]">{language === "en" ? `Last full data timestamp: ${lastUpdated || "Unknown"}` : `ข้อมูลล่าสุด: ${lastUpdated || "ยังไม่มีข้อมูล"}`}</p></div></div>
        </section>

        <section className="amd-glass amd-card mt-4 p-4">
          <p className="text-[11px] font-bold">{language === "en" ? "Update mode" : "โหมดตรวจอัปเดต"}</p>
          <select value={mode} onChange={(event) => setMode(event.target.value as UpdateMode)} className="amd-input mt-3 h-12 w-full rounded-2xl bg-[#07111f] px-3 text-[11px] outline-none">
            <option value="all">{language === "en" ? "All places" : "ทุกสถานที่"}</option>
            <option value="older14">{language === "en" ? "Older than 14 days" : "เก่ากว่า 14 วัน"}</option>
            <option value="older30">{language === "en" ? "Older than 30 days" : "เก่ากว่า 30 วัน"}</option>
            <option value="older90">{language === "en" ? "Older than 90 days" : "เก่ากว่า 90 วัน"}</option>
            <option value="restaurants_cafes">{language === "en" ? "Restaurants & cafes" : "ร้านอาหารและคาเฟ่"}</option>
            <option value="parking">{language === "en" ? "Parking only" : "ที่จอดรถเท่านั้น"}</option>
          </select>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={runLocalAudit} disabled={Boolean(progress)} className="amd-btn amd-btn-primary flex min-h-11 items-center gap-2 rounded-xl px-4 text-[10px] font-bold"><RefreshCw className={`h-4 w-4 ${progress ? "animate-spin" : ""}`} />{language === "en" ? "Check for updates" : "ตรวจสอบข้อมูล"}</button>
            <button type="button" onClick={() => { setMessage(language === "en" ? "External discovery is maintenance-only. Configure an approved importer before scanning for new places." : "การค้นหาร้านใหม่เป็น Maintenance-only ต้องตั้ง Approved Importer ก่อนใช้งาน"); }} className="amd-btn flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-4 text-[10px] font-bold"><Search className="h-4 w-4" />{language === "en" ? "Find New Places" : "ค้นหาร้านใหม่"}</button>
            {progress && <button type="button" onClick={() => setCancelled(true)} className="amd-btn min-h-11 rounded-xl border border-rose-300/15 px-4 text-[10px] font-bold text-rose-200">{language === "en" ? "Cancel" : "ยกเลิก"}</button>}
          </div>
          {progress && <div className="mt-3"><div className="flex justify-between text-[9px] text-[var(--amd-text-3)]"><span>{language === "en" ? "Checking places" : "กำลังตรวจข้อมูล"}</span><span>{progress.current} / {progress.total}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full bg-[#149CFF] transition-all" style={{ width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%` }} /></div></div>}
          {message && <p className="mt-3 rounded-xl border border-cyan-300/10 bg-cyan-300/[0.05] px-3 py-2 text-[9px] leading-4 text-cyan-100">{message}</p>}
        </section>

        {auditDone && <section className="amd-glass amd-card mt-4 p-4"><div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-300" /><p className="text-[12px] font-semibold">{language === "en" ? "Local audit complete" : "ตรวจฐานข้อมูลเสร็จแล้ว"}</p></div><div className="mt-3 grid grid-cols-5 gap-1 text-center text-[8px] text-[var(--amd-text-3)]">{Object.entries(summary.freshness).map(([state, count]) => <div key={state} className="rounded-xl bg-white/[0.035] p-2"><p className="uppercase">{state}</p><p className="mt-1 text-[14px] font-semibold text-[var(--amd-text)]">{count}</p></div>)}</div></section>}

        <section className="amd-glass amd-card mt-4 p-4">
          <div className="flex items-center justify-between"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-[#00D9FF]" /><p className="text-[12px] font-semibold">{language === "en" ? "Review Changes" : "ตรวจการเปลี่ยนแปลง"}</p></div><span className="rounded-full bg-white/[0.06] px-2 py-1 text-[9px]">{pending.length}</span></div>
          {!pending.length ? <p className="mt-3 text-[10px] leading-5 text-[var(--amd-text-3)]">{language === "en" ? "No provider diffs are waiting for review. Importers must write normalized diffs here before anything can change production data." : "ยังไม่มี Diff จาก Approved Importer รอตรวจ ระบบจะไม่เขียนทับข้อมูล Production โดยตรง"}</p> : <div className="mt-3 space-y-2">{pending.slice(0, 30).map((change) => <div key={change.id} className="rounded-2xl border border-white/[0.07] bg-black/10 p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold">{change.placeName}</p><p className="mt-1 text-[8px] uppercase text-[var(--amd-text-3)]">{change.risk} • {change.source}</p></div>{change.risk === "high" && <AlertTriangle className="h-4 w-4 text-amber-300" />}</div><div className="mt-2 space-y-1">{change.fields.slice(0, 4).map((field) => <p key={String(field.field)} className="text-[9px] text-[var(--amd-text-2)]">{String(field.field)}: <span className="text-white/45">{String(field.previousValue ?? "—")}</span> → <span className="text-white/80">{String(field.incomingValue ?? "—")}</span></p>)}</div><div className="mt-3 flex gap-2"><button type="button" onClick={() => applySafeChange(change.id)} className="amd-chip h-9 min-h-0 px-3 text-[9px] text-emerald-200">{language === "en" ? "Apply Safe Fields" : "ใช้เฉพาะ Safe Fields"}</button><button type="button" onClick={() => ignoreChange(change.id)} className="amd-chip h-9 min-h-0 px-3 text-[9px]">{language === "en" ? "Ignore" : "ข้าม"}</button></div></div>)}</div>}
        </section>

        <section className="amd-glass amd-card mt-4 p-4">
          <div className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-300" /><p className="text-[12px] font-semibold">{language === "en" ? "Possible duplicates" : "รายการที่อาจซ้ำ"}</p></div>
          <p className="mt-1 text-[9px] text-[var(--amd-text-3)]">{duplicates.length} {language === "en" ? "pairs flagged by similar name + coordinate proximity" : "คู่ที่พบจากชื่อใกล้เคียง + พิกัดใกล้กัน"}</p>
          {duplicates.slice(0, 5).map(({ a, b }) => <div key={`${a.id}-${b.id}`} className="mt-2 rounded-xl bg-white/[0.035] p-3 text-[9px]"><p className="font-semibold">{a.name}</p><p className="mt-1 text-[var(--amd-text-3)]">↔ {b.name}</p></div>)}
        </section>

        <section className="amd-glass amd-card mt-4 p-4">
          <div className="flex items-center gap-2"><History className="h-5 w-5 text-[#00D9FF]" /><p className="text-[12px] font-semibold">{language === "en" ? "Update History" : "ประวัติการอัปเดต"}</p></div>
          {!history.length ? <p className="mt-3 text-[10px] text-[var(--amd-text-3)]">{language === "en" ? "No approved updates applied yet." : "ยังไม่มีการ Apply ข้อมูลที่ผ่านการอนุมัติ"}</p> : history.slice(0, 12).map((entry) => <div key={entry.id} className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-white/[0.035] p-3"><div className="min-w-0"><p className="truncate text-[10px] font-semibold">{entry.placeName}</p><p className="mt-1 text-[8px] text-[var(--amd-text-3)]">{new Date(entry.changedAt).toLocaleString()} • {entry.source}</p></div><button type="button" onClick={() => undo(entry)} className="amd-chip flex h-9 min-h-0 items-center gap-1 px-3 text-[9px]"><RotateCcw className="h-3.5 w-3.5" />{language === "en" ? "Undo" : "ย้อนกลับ"}</button></div>)}
        </section>

        <section className="mt-4 rounded-[20px] border border-white/[0.06] bg-black/10 p-4 text-[9px] leading-5 text-[var(--amd-text-3)]">
          <p>{language === "en" ? "Mapbox is used as the map engine only. Permanent business data stays in the Around My Dorm database. External discovery must be run intentionally through an approved maintenance importer." : "Mapbox ใช้เป็น Map Engine เท่านั้น ข้อมูลร้านถาวรอยู่ในฐานข้อมูล Around My Dorm และ External Discovery ต้องเรียกแบบตั้งใจผ่าน Approved Maintenance Importer เท่านั้น"}</p>
          <p className="mt-2">{language === "en" ? `Refresh candidates in current mode: ${selected.length}` : `จำนวนรายการตามโหมดปัจจุบัน: ${selected.length}`}</p>
          <p className="mt-1">{language === "en" ? `Sample freshness: ${places[0] ? freshnessState(places[0]) : "n/a"}` : `ตัวอย่าง Freshness: ${places[0] ? freshnessState(places[0]) : "ไม่มี"}`}</p>
        </section>
      </section>
    </div>
  );
}

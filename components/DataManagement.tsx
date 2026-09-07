"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Database, FileUp, History, Plus, RefreshCw, RotateCcw, Search, ShieldCheck, X } from "lucide-react";
import { CATEGORIES } from "@/data/categories";
import { auditPlaces, findDuplicatePairs, selectPlacesForUpdate, type UpdateMode } from "@/lib/place-update-engine";
import { freshnessState } from "@/lib/data-governance";
import { addReviewedLocalPlace, applyLocalPlacePatch, loadLocalPlaceHistory, rollbackLocalPlaceHistory, type LocalPlaceHistory } from "@/lib/database/places";
import { buildImportPlan, type ImportCandidate, type ImportPlan, type NewPlaceCandidate } from "@/lib/maintenance/import-plan";
import { loadPendingPlaceChanges, savePendingPlaceChanges } from "@/lib/storage/place-updates";
import type { CategoryId, Place } from "@/types/place";

const EMPTY_HOURS = { monday: null, tuesday: null, wednesday: null, thursday: null, friday: null, saturday: null, sunday: null };

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9ก-๙]+/g, "-").replace(/^-+|-+$/g, "") || `place-${Date.now()}`;
}

function makeReviewedPlace(input: { name: string; category: CategoryId; latitude: number; longitude: number; address?: string | null; area?: string | null }, source: string, candidate?: Partial<Place>): Place {
  const now = new Date().toISOString();
  const id = candidate?.id || `${source}-${slugify(input.name)}-${Math.round(input.latitude * 10000)}-${Math.round(input.longitude * 10000)}`;
  const base: Place = {
    id,
    googlePlaceId: candidate?.googlePlaceId ?? null,
    name: input.name,
    nameEn: candidate?.nameEn ?? null,
    slug: candidate?.slug || slugify(input.name),
    category: input.category,
    categories: candidate?.categories?.length ? candidate.categories : [input.category],
    subcategory: candidate?.subcategory ?? null,
    shortDescription: candidate?.shortDescription ?? "",
    description: candidate?.description ?? "",
    address: input.address ?? candidate?.address ?? null,
    area: input.area ?? candidate?.area ?? "",
    soi: candidate?.soi ?? null,
    latitude: input.latitude,
    longitude: input.longitude,
    distanceKm: null,
    walkingMinutes: null,
    drivingMinutes: null,
    openingHours: candidate?.openingHours ?? EMPTY_HOURS,
    is24Hours: candidate?.is24Hours ?? false,
    priceLevel: candidate?.priceLevel ?? null,
    priceText: candidate?.priceText ?? null,
    averagePricePerPerson: candidate?.averagePricePerPerson ?? null,
    minPrice: candidate?.minPrice ?? null,
    maxPrice: candidate?.maxPrice ?? null,
    popularMenus: candidate?.popularMenus ?? [],
    recommendedItems: candidate?.recommendedItems ?? [],
    tags: candidate?.tags ?? [],
    rating: candidate?.rating ?? null,
    reviewCount: candidate?.reviewCount ?? null,
    phone: candidate?.phone ?? null,
    line: candidate?.line ?? null,
    facebook: candidate?.facebook ?? null,
    instagram: candidate?.instagram ?? null,
    website: candidate?.website ?? null,
    googleMapsUrl: candidate?.googleMapsUrl ?? null,
    image: candidate?.image ?? null,
    images: candidate?.images ?? [],
    coverImage: candidate?.coverImage ?? null,
    galleryImages: candidate?.galleryImages ?? [],
    imageSource: candidate?.imageSource ?? null,
    imageAttribution: candidate?.imageAttribution ?? null,
    imageMetadata: candidate?.imageMetadata ?? [],
    paymentMethods: candidate?.paymentMethods ?? [],
    delivery: candidate?.delivery ?? null,
    deliveryApps: candidate?.deliveryApps ?? [],
    dineIn: candidate?.dineIn ?? null,
    takeaway: candidate?.takeaway ?? null,
    parking: candidate?.parking ?? { available: null, type: null, price: null, note: null },
    airConditioned: candidate?.airConditioned ?? null,
    wifi: candidate?.wifi ?? null,
    powerOutlet: candidate?.powerOutlet ?? null,
    toilet: candidate?.toilet ?? null,
    petFriendly: candidate?.petFriendly ?? null,
    wheelchairAccessible: candidate?.wheelchairAccessible ?? null,
    openLate: candidate?.openLate ?? null,
    studentFriendly: candidate?.studentFriendly ?? null,
    goodForWorking: candidate?.goodForWorking ?? null,
    recommended: candidate?.recommended ?? false,
    localFavorite: candidate?.localFavorite ?? false,
    hiddenGem: candidate?.hiddenGem ?? false,
    verified: candidate?.verified ?? false,
    lastVerified: candidate?.lastVerified ?? null,
    source: Array.from(new Set([...(candidate?.source || []), source])),
    sourceId: candidate?.sourceId ?? null,
    sourceUrl: candidate?.sourceUrl ?? null,
    lastChecked: candidate?.lastChecked ?? now,
    lastUpdated: now,
    notes: candidate?.notes ?? null,
  };
  return { ...base, ...candidate, id: base.id, name: base.name, category: base.category, categories: base.categories, latitude: base.latitude, longitude: base.longitude, source: base.source, lastUpdated: now };
}

export function DataManagement({ places, databaseSource, language, onClose, onReload }: { places: Place[]; databaseSource: string; language: "th" | "en"; onClose: () => void; onReload: () => void }) {
  const [mode, setMode] = useState<UpdateMode>("older30");
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [cancelRequested, setCancelRequested] = useState(false);
  const cancelRef = useRef(false);
  const [auditDone, setAuditDone] = useState(false);
  const [pending, setPending] = useState(() => loadPendingPlaceChanges());
  const [history, setHistory] = useState<LocalPlaceHistory[]>(() => loadLocalPlaceHistory());
  const [message, setMessage] = useState<string | null>(null);
  const [importPlan, setImportPlan] = useState<ImportPlan | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState({ name: "", category: "food" as CategoryId, latitude: "", longitude: "", address: "", area: "" });

  const summary = useMemo(() => auditPlaces(places), [places]);
  const duplicates = useMemo(() => findDuplicatePairs(places).slice(0, 20), [places]);
  const selected = useMemo(() => selectPlacesForUpdate(places, mode), [places, mode]);
  const lastUpdated = useMemo(() => {
    const dates = places.map((place) => place.lastUpdated || place.lastChecked || place.lastVerified).filter(Boolean).map((value) => new Date(value as string).getTime()).filter(Number.isFinite);
    if (!dates.length) return null;
    return new Date(Math.max(...dates)).toLocaleString(language === "en" ? "en-GB" : "th-TH", { dateStyle: "medium", timeStyle: "short" });
  }, [places, language]);
  const externalUsage = useMemo(() => {
    if (typeof window === "undefined") return 0;
    try { return Number(JSON.parse(localStorage.getItem("around-dorm-external-usage-v1") || "0")) || 0; } catch { return 0; }
  }, []);

  async function runLocalAudit() {
    setCancelRequested(false);
    cancelRef.current = false;
    setAuditDone(false);
    setMessage(null);
    setProgress({ current: 0, total: selected.length });
    for (let index = 0; index < selected.length; index += 25) {
      if (cancelRef.current) break;
      const current = Math.min(index + 25, selected.length);
      setProgress({ current, total: selected.length });
      await new Promise((resolve) => window.setTimeout(resolve, 35));
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

  async function importProviderFile(file: File) {
    setMessage(null);
    try {
      const payload = JSON.parse(await file.text()) as { provider?: string; candidates?: ImportCandidate[] } | ImportCandidate[];
      const provider = Array.isArray(payload) ? "approved_import" : payload.provider || "approved_import";
      const rawCandidates = Array.isArray(payload) ? payload : payload.candidates || [];
      const candidates = rawCandidates.map((candidate) => ({ ...candidate, sourceProvider: candidate.sourceProvider || provider }));
      const plan = buildImportPlan(places, candidates, provider);
      setImportPlan(plan);
      const nextPending = [...pending, ...plan.diffs].filter((item, index, array) => array.findIndex((candidate) => candidate.id === item.id) === index);
      setPending(nextPending);
      savePendingPlaceChanges(nextPending);
      setMessage(language === "en" ? `Import scanned ${plan.scanned}: ${plan.diffs.length} changes, ${plan.newPlaces.length} new candidates, ${plan.rejected.length} rejected by policy.` : `ตรวจไฟล์ ${plan.scanned} รายการ: เปลี่ยนแปลง ${plan.diffs.length}, ร้านใหม่ ${plan.newPlaces.length}, ถูก Policy ปฏิเสธ ${plan.rejected.length}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invalid import file");
    }
  }

  function addCandidate(item: NewPlaceCandidate, keepSeparate = false) {
    const candidate = item.candidate;
    if (item.duplicateIds.length && !keepSeparate) {
      setMessage(language === "en" ? "Possible duplicate: review before adding." : "อาจเป็นรายการซ้ำ กรุณาตรวจสอบก่อนเพิ่ม");
      return;
    }
    if (!candidate.category || candidate.latitude == null || candidate.longitude == null) {
      setMessage(language === "en" ? "Candidate is missing category or coordinates." : "Candidate ไม่มีหมวดหรือพิกัดที่จำเป็น");
      return;
    }
    const place = makeReviewedPlace({ name: candidate.name, category: candidate.category, latitude: candidate.latitude, longitude: candidate.longitude, address: candidate.address, area: candidate.area }, candidate.sourceProvider, candidate);
    addReviewedLocalPlace(place, candidate.sourceProvider);
    setImportPlan((current) => current ? { ...current, newPlaces: current.newPlaces.filter((candidateItem) => candidateItem !== item) } : current);
    setHistory(loadLocalPlaceHistory());
    onReload();
  }

  function addManualPlace() {
    const latitude = Number(manual.latitude);
    const longitude = Number(manual.longitude);
    if (!manual.name.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setMessage(language === "en" ? "Name and valid coordinates are required." : "กรุณากรอกชื่อและพิกัดที่ถูกต้อง");
      return;
    }
    const place = makeReviewedPlace({ name: manual.name.trim(), category: manual.category, latitude, longitude, address: manual.address || null, area: manual.area || null }, "manual");
    addReviewedLocalPlace(place, "manual");
    setManual({ name: "", category: "food", latitude: "", longitude: "", address: "", area: "" });
    setManualOpen(false);
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
          <div className="flex items-start gap-3"><Database className="mt-0.5 h-5 w-5 text-[#00D9FF]" /><div><p className="text-[13px] font-semibold">Database-first runtime</p><p className="mt-1 text-[10px] leading-5 text-[var(--amd-text-2)]">{language === "en" ? `Current source: ${databaseSource}. Normal browsing does not query an external POI provider.` : `แหล่งข้อมูลปัจจุบัน: ${databaseSource} • การเปิดแอปปกติจะไม่ยิง External POI API`}</p><p className="mt-1 text-[9px] text-[var(--amd-text-3)]">{language === "en" ? `Last data timestamp: ${lastUpdated || "Unknown"}` : `ข้อมูลล่าสุด: ${lastUpdated || "ยังไม่มีข้อมูล"}`} • External calls: {externalUsage}</p></div></div>
        </section>

        <section className="amd-glass amd-card mt-4 p-4">
          <p className="text-[11px] font-bold">{language === "en" ? "Update mode" : "โหมดตรวจอัปเดต"}</p>
          <select value={mode} onChange={(event) => setMode(event.target.value as UpdateMode)} className="amd-input mt-3 h-12 w-full rounded-2xl bg-[#07111f] px-3 text-[11px] outline-none">
            <option value="all">{language === "en" ? "All places" : "ทุกสถานที่"}</option><option value="older14">{language === "en" ? "Older than 14 days" : "เก่ากว่า 14 วัน"}</option><option value="older30">{language === "en" ? "Older than 30 days" : "เก่ากว่า 30 วัน"}</option><option value="older90">{language === "en" ? "Older than 90 days" : "เก่ากว่า 90 วัน"}</option><option value="restaurants_cafes">{language === "en" ? "Restaurants & cafes" : "ร้านอาหารและคาเฟ่"}</option><option value="parking">{language === "en" ? "Parking only" : "ที่จอดรถเท่านั้น"}</option>
          </select>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={runLocalAudit} disabled={Boolean(progress)} className="amd-btn amd-btn-primary flex min-h-11 items-center gap-2 rounded-xl px-4 text-[10px] font-bold"><RefreshCw className={`h-4 w-4 ${progress ? "animate-spin" : ""}`} />{language === "en" ? "Check Existing Places" : "ตรวจร้านเดิม"}</button>
            <label className="amd-btn flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-white/10 px-4 text-[10px] font-bold"><FileUp className="h-4 w-4" />{language === "en" ? "Review Import File" : "ตรวจไฟล์ Import"}<input type="file" accept="application/json,.json" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importProviderFile(file); event.currentTarget.value = ""; }} /></label>
            <button type="button" onClick={() => setManualOpen((value) => !value)} className="amd-btn flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-4 text-[10px] font-bold"><Plus className="h-4 w-4" />{language === "en" ? "Add Manual Place" : "เพิ่มร้านเอง"}</button>
            <button type="button" onClick={() => setMessage(language === "en" ? "External discovery is maintenance-only. Run an approved provider scan outside normal browsing, then import its normalized JSON here." : "External Discovery เป็น Maintenance-only ให้รัน Approved Provider Scan แล้วนำไฟล์ JSON ที่ Normalize แล้วมาตรวจที่นี่")} className="amd-btn flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-4 text-[10px] font-bold"><Search className="h-4 w-4" />{language === "en" ? "Find New Places" : "ค้นหาร้านใหม่"}</button>
            {progress && <button type="button" onClick={() => { cancelRef.current = true; setCancelRequested(true); }} className="amd-btn min-h-11 rounded-xl border border-rose-300/15 px-4 text-[10px] font-bold text-rose-200">{language === "en" ? "Cancel" : "ยกเลิก"}</button>}
          </div>
          {progress && <div className="mt-3"><div className="flex justify-between text-[9px] text-[var(--amd-text-3)]"><span>{language === "en" ? "Checking places" : "กำลังตรวจข้อมูล"}</span><span>{progress.current} / {progress.total}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full bg-[#149CFF] transition-all" style={{ width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%` }} /></div></div>}
          {message && <p className="mt-3 rounded-xl border border-cyan-300/10 bg-cyan-300/[0.05] px-3 py-2 text-[9px] leading-4 text-cyan-100">{message}</p>}

          {manualOpen && <div className="mt-4 rounded-2xl border border-white/[0.07] bg-black/10 p-3"><p className="text-[11px] font-semibold">{language === "en" ? "Manual place" : "เพิ่มสถานที่ด้วยตนเอง"}</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><input value={manual.name} onChange={(event) => setManual((current) => ({ ...current, name: event.target.value }))} placeholder={language === "en" ? "Name" : "ชื่อร้าน"} className="amd-input h-11 rounded-xl px-3 text-[10px]" /><select value={manual.category} onChange={(event) => setManual((current) => ({ ...current, category: event.target.value as CategoryId }))} className="amd-input h-11 rounded-xl bg-[#07111f] px-3 text-[10px]">{CATEGORIES.filter((item) => item.id !== "all").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><input value={manual.latitude} onChange={(event) => setManual((current) => ({ ...current, latitude: event.target.value }))} placeholder="Latitude" inputMode="decimal" className="amd-input h-11 rounded-xl px-3 text-[10px]" /><input value={manual.longitude} onChange={(event) => setManual((current) => ({ ...current, longitude: event.target.value }))} placeholder="Longitude" inputMode="decimal" className="amd-input h-11 rounded-xl px-3 text-[10px]" /><input value={manual.address} onChange={(event) => setManual((current) => ({ ...current, address: event.target.value }))} placeholder={language === "en" ? "Address (optional)" : "ที่อยู่ (ถ้ามี)"} className="amd-input h-11 rounded-xl px-3 text-[10px] sm:col-span-2" /><input value={manual.area} onChange={(event) => setManual((current) => ({ ...current, area: event.target.value }))} placeholder={language === "en" ? "Area (optional)" : "พื้นที่ (ถ้ามี)"} className="amd-input h-11 rounded-xl px-3 text-[10px] sm:col-span-2" /></div><button type="button" onClick={addManualPlace} className="amd-btn amd-btn-primary mt-3 min-h-11 rounded-xl px-4 text-[10px] font-bold">{language === "en" ? "Add as unverified manual record" : "เพิ่มเป็นข้อมูล Manual ที่ยังไม่ Verified"}</button></div>}
        </section>

        {auditDone && <section className="amd-glass amd-card mt-4 p-4"><div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-300" /><p className="text-[12px] font-semibold">{language === "en" ? "Local audit complete" : "ตรวจฐานข้อมูลเสร็จแล้ว"}</p></div><div className="mt-3 grid grid-cols-5 gap-1 text-center text-[8px] text-[var(--amd-text-3)]">{Object.entries(summary.freshness).map(([state, count]) => <div key={state} className="rounded-xl bg-white/[0.035] p-2"><p className="uppercase">{state}</p><p className="mt-1 text-[14px] font-semibold text-[var(--amd-text)]">{count}</p></div>)}</div></section>}

        {importPlan && <section className="amd-glass amd-card mt-4 p-4"><div className="flex items-center justify-between"><p className="text-[12px] font-semibold">{language === "en" ? "New Place Candidates" : "ร้านใหม่ที่รอตรวจ"}</p><span className="text-[9px] text-[var(--amd-text-3)]">{importPlan.newPlaces.length}</span></div>{!importPlan.newPlaces.length ? <p className="mt-3 text-[9px] text-[var(--amd-text-3)]">{language === "en" ? "No new candidates in this import." : "ไม่มี Candidate ใหม่ในไฟล์นี้"}</p> : <div className="mt-3 space-y-2">{importPlan.newPlaces.slice(0, 30).map((item, index) => <div key={`${item.candidate.name}-${index}`} className="rounded-2xl border border-white/[0.07] bg-black/10 p-3"><p className="text-[11px] font-semibold">{item.candidate.name}</p><p className="mt-1 text-[8px] text-[var(--amd-text-3)]">{item.candidate.category || "unknown"} • {item.candidate.latitude ?? "?"}, {item.candidate.longitude ?? "?"} • {item.candidate.sourceProvider}</p>{item.duplicateIds.length > 0 && <p className="mt-2 text-[9px] text-amber-200">Possible duplicate: {item.duplicateIds.join(", ")}</p>}<div className="mt-3 flex gap-2">{item.duplicateIds.length === 0 ? <button type="button" onClick={() => addCandidate(item)} className="amd-chip h-9 min-h-0 px-3 text-[9px] text-emerald-200">{language === "en" ? "Add" : "เพิ่ม"}</button> : <button type="button" onClick={() => addCandidate(item, true)} className="amd-chip h-9 min-h-0 px-3 text-[9px] text-amber-100">{language === "en" ? "Keep Separate" : "ยืนยันว่าแยกสาขา"}</button>}<button type="button" onClick={() => setImportPlan((current) => current ? { ...current, newPlaces: current.newPlaces.filter((candidateItem) => candidateItem !== item) } : current)} className="amd-chip h-9 min-h-0 px-3 text-[9px]">{language === "en" ? "Ignore" : "ข้าม"}</button></div></div>)}</div>}</section>}

        <section className="amd-glass amd-card mt-4 p-4">
          <div className="flex items-center justify-between"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-[#00D9FF]" /><p className="text-[12px] font-semibold">{language === "en" ? "Review Changes" : "ตรวจการเปลี่ยนแปลง"}</p></div><span className="rounded-full bg-white/[0.06] px-2 py-1 text-[9px]">{pending.length}</span></div>
          {!pending.length ? <p className="mt-3 text-[10px] leading-5 text-[var(--amd-text-3)]">{language === "en" ? "No approved provider diffs are waiting for review." : "ยังไม่มี Diff จาก Approved Importer รอตรวจ ระบบจะไม่เขียนทับ Production โดยตรง"}</p> : <div className="mt-3 space-y-2">{pending.slice(0, 30).map((change) => <div key={change.id} className="rounded-2xl border border-white/[0.07] bg-black/10 p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold">{change.placeName}</p><p className="mt-1 text-[8px] uppercase text-[var(--amd-text-3)]">{change.risk} • {change.source}</p></div>{change.risk === "high" && <AlertTriangle className="h-4 w-4 text-amber-300" />}</div><div className="mt-2 space-y-1">{change.fields.slice(0, 4).map((field) => <p key={String(field.field)} className="text-[9px] text-[var(--amd-text-2)]">{String(field.field)}: <span className="text-white/45">{String(field.previousValue ?? "—")}</span> → <span className="text-white/80">{String(field.incomingValue ?? "—")}</span></p>)}</div><div className="mt-3 flex gap-2"><button type="button" onClick={() => applySafeChange(change.id)} className="amd-chip h-9 min-h-0 px-3 text-[9px] text-emerald-200">{language === "en" ? "Apply Safe Fields" : "ใช้เฉพาะ Safe Fields"}</button><button type="button" onClick={() => ignoreChange(change.id)} className="amd-chip h-9 min-h-0 px-3 text-[9px]">{language === "en" ? "Ignore" : "ข้าม"}</button></div></div>)}</div>}
        </section>

        <section className="amd-glass amd-card mt-4 p-4"><div className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-300" /><p className="text-[12px] font-semibold">{language === "en" ? "Possible duplicates" : "รายการที่อาจซ้ำ"}</p></div><p className="mt-1 text-[9px] text-[var(--amd-text-3)]">{duplicates.length} {language === "en" ? "pairs flagged by similar name + coordinate proximity" : "คู่ที่พบจากชื่อใกล้เคียง + พิกัดใกล้กัน"}</p>{duplicates.slice(0, 5).map(({ a, b }) => <div key={`${a.id}-${b.id}`} className="mt-2 rounded-xl bg-white/[0.035] p-3 text-[9px]"><p className="font-semibold">{a.name}</p><p className="mt-1 text-[var(--amd-text-3)]">↔ {b.name}</p></div>)}</section>

        <section className="amd-glass amd-card mt-4 p-4"><div className="flex items-center gap-2"><History className="h-5 w-5 text-[#00D9FF]" /><p className="text-[12px] font-semibold">{language === "en" ? "Update History" : "ประวัติการอัปเดต"}</p></div>{!history.length ? <p className="mt-3 text-[10px] text-[var(--amd-text-3)]">{language === "en" ? "No approved updates applied yet." : "ยังไม่มีการ Apply ข้อมูลที่ผ่านการอนุมัติ"}</p> : history.slice(0, 12).map((entry) => <div key={entry.id} className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-white/[0.035] p-3"><div className="min-w-0"><p className="truncate text-[10px] font-semibold">{entry.placeName}</p><p className="mt-1 text-[8px] text-[var(--amd-text-3)]">{new Date(entry.changedAt).toLocaleString()} • {entry.source}</p></div><button type="button" onClick={() => undo(entry)} className="amd-chip flex h-9 min-h-0 items-center gap-1 px-3 text-[9px]"><RotateCcw className="h-3.5 w-3.5" />{language === "en" ? "Undo" : "ย้อนกลับ"}</button></div>)}</section>

        <section className="mt-4 rounded-[20px] border border-white/[0.06] bg-black/10 p-4 text-[9px] leading-5 text-[var(--amd-text-3)]"><p>{language === "en" ? "Mapbox is used as the map engine only. Permanent business data stays in the Around My Dorm database. External discovery must be run intentionally through an approved maintenance importer." : "Mapbox ใช้เป็น Map Engine เท่านั้น ข้อมูลร้านถาวรอยู่ในฐานข้อมูล Around My Dorm และ External Discovery ต้องเรียกแบบตั้งใจผ่าน Approved Maintenance Importer เท่านั้น"}</p><p className="mt-2">{language === "en" ? `Refresh candidates in current mode: ${selected.length}` : `จำนวนรายการตามโหมดปัจจุบัน: ${selected.length}`}</p><p className="mt-1">{language === "en" ? `Sample freshness: ${places[0] ? freshnessState(places[0]) : "n/a"}` : `ตัวอย่าง Freshness: ${places[0] ? freshnessState(places[0]) : "ไม่มี"}`}</p></section>
      </section>
    </div>
  );
}

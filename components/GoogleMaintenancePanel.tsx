"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { fetchGoogleLiveDetails, type GoogleLiveDetails } from "@/lib/google-live";
import type { Place } from "@/types/place";

type ReviewField = { label: string; existing: unknown; live: unknown; risk: "review" | "high" };
type ReviewItem = { place: Place; live: GoogleLiveDetails; fields: ReviewField[]; possiblyClosed: boolean };
type Summary = { scanned: number; changed: number; unchanged: number; possiblyClosed: number; failed: number; lookups: number };

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
  push("Address", place.address, live.address, "review");
  if (live.latitude != null && live.longitude != null && place.latitude != null && place.longitude != null) {
    const delta = Math.hypot(live.latitude - place.latitude, live.longitude - place.longitude);
    if (delta > 0.00035) fields.push({ label: "Coordinates", existing: `${place.latitude}, ${place.longitude}`, live: `${live.latitude}, ${live.longitude}`, risk: "high" });
  }
  push("Phone", place.phone, live.phone, "review");
  push("Website", place.website, live.website, "review");
  push("Rating", place.rating, live.rating, "review");
  push("Review count", place.reviewCount, live.reviewCount, "review");
  if (live.openingHoursText.length) push("Opening hours", place.openingHoursText || null, live.openingHoursText.join(" | "), "review");

  const status = String(live.businessStatus || "").toUpperCase();
  const possiblyClosed = status.includes("CLOSED") || status.includes("CLOSE");
  if (possiblyClosed) fields.push({ label: "Business status", existing: place.permanentlyClosed ? "closed" : "active/unknown", live: live.businessStatus, risk: "high" });
  return { place, live, fields, possiblyClosed };
}

async function retry<T>(fn: () => Promise<T>, attempts = 2) {
  let last: unknown;
  for (let index = 0; index < attempts; index += 1) {
    try { return await fn(); } catch (error) { last = error; if (index + 1 < attempts) await new Promise((resolve) => window.setTimeout(resolve, 450 * (index + 1))); }
  }
  throw last;
}

export function GoogleMaintenancePanel({ places, language }: { places: Place[]; language: "th" | "en" }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const [progress, setProgress] = useState<{ current: number; total: number; name: string } | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef(false);
  const eligible = useMemo(() => places.filter((place) => Boolean(place.googlePlaceId)), [places]);

  async function runCheck() {
    if (!apiKey || !eligible.length) return;
    cancelRef.current = false;
    setError(null);
    setReviews([]);
    setSummary(null);
    const collected: ReviewItem[] = [];
    let completed = 0;
    let failed = 0;
    let lookups = 0;

    for (let offset = 0; offset < eligible.length && !cancelRef.current; offset += 4) {
      const batch = eligible.slice(offset, offset + 4);
      await Promise.all(batch.map(async (place) => {
        if (cancelRef.current) return;
        setProgress({ current: completed, total: eligible.length, name: place.name });
        try {
          const live = await retry(() => fetchGoogleLiveDetails(apiKey, place.googlePlaceId as string, 5 * 60_000), 2);
          lookups += 1;
          collected.push(liveReview(place, live));
        } catch {
          failed += 1;
        } finally {
          completed += 1;
          setProgress({ current: completed, total: eligible.length, name: place.name });
        }
      }));
      if (!cancelRef.current && offset + 4 < eligible.length) await new Promise((resolve) => window.setTimeout(resolve, 220));
    }

    const changed = collected.filter((item) => item.fields.length > 0);
    setReviews(changed);
    setSummary({
      scanned: completed,
      changed: changed.length,
      unchanged: collected.filter((item) => item.fields.length === 0).length,
      possiblyClosed: collected.filter((item) => item.possiblyClosed).length,
      failed,
      lookups,
    });
    setProgress(null);
    try {
      const previous = Number(JSON.parse(localStorage.getItem("around-dorm-external-usage-v1") || "0")) || 0;
      localStorage.setItem("around-dorm-external-usage-v1", JSON.stringify(previous + lookups));
    } catch {}
  }

  return (
    <section className="amd-glass amd-card mt-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-[11px] font-bold">{language === "en" ? "Google Place ID update check" : "ตรวจอัปเดตด้วย Google Place ID"}</p><p className="mt-1 text-[9px] leading-5 text-[var(--amd-text-2)]">{language === "en" ? `${eligible.length} of ${places.length} selected places have a Google Place ID. This check is manual and never runs during normal browsing.` : `${eligible.length} จาก ${places.length} ร้านที่เลือกมี Google Place ID • ระบบนี้ทำงานเฉพาะเมื่อแอดมินกด ไม่ทำงานตอนผู้ใช้เปิดแอปปกติ`}</p></div><ShieldCheck className="h-5 w-5 shrink-0 text-[#00D9FF]" /></div>

      {!apiKey && <p className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.06] px-3 py-2 text-[9px] text-amber-100">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not configured.</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={!apiKey || !eligible.length || Boolean(progress)} onClick={() => void runCheck()} className="amd-btn amd-btn-primary flex min-h-11 items-center gap-2 rounded-xl px-4 text-[10px] font-bold disabled:opacity-45">{progress ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{language === "en" ? "Check for Updates" : "ตรวจอัปเดต"}</button>
        {progress && <button type="button" onClick={() => { cancelRef.current = true; }} className="amd-btn min-h-11 rounded-xl border border-rose-300/15 px-4 text-[10px] font-bold text-rose-200">{language === "en" ? "Cancel" : "ยกเลิก"}</button>}
      </div>

      {progress && <div className="mt-3"><div className="flex justify-between gap-3 text-[9px] text-[var(--amd-text-3)]"><span className="truncate">{progress.name}</span><span className="shrink-0">{progress.current} / {progress.total}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full bg-[#149CFF] transition-all" style={{ width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%` }} /></div></div>}
      {error && <p className="mt-3 text-[9px] text-rose-100">{error}</p>}

      {summary && <div className="mt-4 rounded-2xl border border-white/[0.07] bg-black/10 p-3"><p className="text-[10px] font-bold">{language === "en" ? "UPDATE CHECK COMPLETE" : "ตรวจอัปเดตเสร็จแล้ว"}</p><div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">{[
        [language === "en" ? "Scanned" : "ตรวจ", summary.scanned],
        [language === "en" ? "Changed" : "เปลี่ยน", summary.changed],
        [language === "en" ? "Unchanged" : "เดิม", summary.unchanged],
        [language === "en" ? "Closed?" : "อาจปิด", summary.possiblyClosed],
        [language === "en" ? "Failed" : "ล้มเหลว", summary.failed],
        [language === "en" ? "Lookups" : "API", summary.lookups],
      ].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-white/[0.035] p-2 text-center"><p className="text-[8px] text-white/35">{label}</p><p className="mt-1 text-[15px] font-bold">{value}</p></div>)}</div></div>}

      {reviews.length > 0 && <div className="mt-4 space-y-3"><div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-200" /><p className="text-[10px] font-bold">{language === "en" ? "Review live differences" : "ตรวจความต่างจากข้อมูลสด"}</p></div>{reviews.map((item) => <article key={item.place.id} className="rounded-2xl border border-white/[0.07] bg-black/10 p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-bold">{item.place.name}</p><p className="mt-1 text-[8px] text-white/35">Place ID: {item.place.googlePlaceId}</p></div>{item.live.googleMapsUrl && <a href={item.live.googleMapsUrl} target="_blank" rel="noreferrer" className="amd-chip flex h-9 min-h-0 items-center gap-1 px-2 text-[8px]">Google <ExternalLink className="h-3 w-3" /></a>}</div><div className="mt-3 space-y-2">{item.fields.map((field) => <div key={field.label} className="rounded-xl border border-white/[0.05] bg-white/[0.025] p-2"><div className="flex items-center justify-between gap-2"><p className="text-[9px] font-semibold">{field.label}</p><span className={`text-[8px] font-bold uppercase ${field.risk === "high" ? "text-amber-200" : "text-[#8ecbff]"}`}>{field.risk}</span></div><p className="mt-1 break-all text-[8px] leading-4 text-white/38">{String(field.existing ?? "—")} → <span className="text-white/72">{String(field.live ?? "—")}</span></p></div>)}</div></article>)}</div>}

      {summary && reviews.length === 0 && <p className="mt-3 flex items-center gap-2 text-[9px] text-emerald-200"><CheckCircle2 className="h-4 w-4" />{language === "en" ? "No live differences detected for the successfully checked places." : "ไม่พบความต่างในร้านที่ตรวจสำเร็จ"}</p>}
      <p className="mt-3 text-[8px] leading-4 text-white/28">{language === "en" ? "Google live values are review references only and are not auto-written into the permanent database. Apply persistent changes only after an authorized/manual source confirms them." : "ข้อมูล Google สดใช้เพื่ออ้างอิงตอน Review เท่านั้น และจะไม่ถูกเขียนทับฐานข้อมูลถาวรอัตโนมัติ ให้ Apply ข้อมูลถาวรเมื่อมีแหล่ง Manual/Authorized ยืนยันแล้ว"}</p>
    </section>
  );
}

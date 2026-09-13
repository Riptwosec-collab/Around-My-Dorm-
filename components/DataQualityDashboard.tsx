"use client";

import { useMemo } from "react";
import { BarChart3, CheckCircle2, ImageOff, MapPinned, PhoneOff, TimerOff } from "lucide-react";
import { buildDataCompletenessDashboard } from "@/lib/data-quality";
import { buildDataHealthSummary } from "@/lib/place-data/data-health";
import type { Place } from "@/types/place";

export function DataQualityDashboard({ places, language }: { places: Place[]; language: "th" | "en" }) {
  const quality = useMemo(() => buildDataCompletenessDashboard(places), [places]);
  const health = useMemo(() => buildDataHealthSummary(places), [places]);
  const tone = quality.average >= 85 ? "text-emerald-200" : quality.average >= 70 ? "text-cyan-200" : quality.average >= 50 ? "text-amber-100" : "text-rose-200";
  const cards = [
    { label: language === "en" ? "Missing Place ID" : "ไม่มี Place ID", value: quality.missingPlaceId, icon: MapPinned },
    { label: language === "en" ? "Missing photo" : "ไม่มีรูปจริง", value: quality.missingPhoto, icon: ImageOff },
    { label: language === "en" ? "Missing hours" : "ไม่มีเวลาเปิด", value: quality.missingHours, icon: TimerOff },
    { label: language === "en" ? "Missing phone" : "ไม่มีเบอร์โทร", value: quality.missingPhone, icon: PhoneOff },
  ];
  return <section data-testid="data-quality-dashboard" className="amd-glass amd-card mt-4 p-4">
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3"><BarChart3 className="mt-0.5 h-5 w-5 text-[#00D9FF]" /><div><p className="text-[12px] font-bold">{language === "en" ? "Data Quality & Completeness" : "คุณภาพและความครบถ้วนของข้อมูล"}</p><p className="mt-1 text-[9px] leading-4 text-[var(--amd-text-3)]">{language === "en" ? "Calculated locally. No external API request is used for this score." : "คำนวณจากฐานข้อมูลในเครื่อง ไม่ใช้ External API"}</p></div></div>
      <div className="text-right"><p className={`text-[28px] font-bold leading-none ${tone}`}>{quality.average}</p><p className="mt-1 text-[8px] text-[var(--amd-text-3)]">/ 100 average</p></div>
    </div>
    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-gradient-to-r from-[#007AFF] to-[#19E6FF]" style={{ width: `${quality.average}%` }} /></div>
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{cards.map((item) => <div key={item.label} className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3"><item.icon className="h-4 w-4 text-white/38" /><p className="mt-2 text-[18px] font-bold">{item.value}</p><p className="mt-1 text-[8px] leading-3 text-white/38">{item.label}</p></div>)}</div>
    <div className="mt-3 flex flex-wrap gap-2 text-[8px]"><span className="flex items-center gap-1 rounded-full border border-emerald-300/10 bg-emerald-300/[0.05] px-2.5 py-1.5 text-emerald-200"><CheckCircle2 className="h-3 w-3" /> A: {quality.excellent}</span><span className="rounded-full border border-cyan-300/10 bg-cyan-300/[0.05] px-2.5 py-1.5 text-cyan-100">B: {quality.good}</span><span className="rounded-full border border-amber-300/10 bg-amber-300/[0.05] px-2.5 py-1.5 text-amber-100">C/D: {quality.needsWork}</span></div>

    <div className="mt-4 border-t border-white/[0.06] pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-bold text-[var(--amd-text-2)]">{language === "en" ? "Canonical data coverage" : "ความครอบคลุมข้อมูลหลัก"}</p>
        <p className="text-[8px] text-[var(--amd-text-3)]">{language === "en" ? "Local diagnostics only" : "ตรวจจากข้อมูลในระบบเท่านั้น"}</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <div data-testid="data-health-total" className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3"><p className="text-[18px] font-bold">{health.total}</p><p className="text-[8px] text-white/38">{language === "en" ? "Canonical places" : "ร้านทั้งหมด"}</p></div>
        <div data-testid="data-health-coordinates" className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3"><p className="text-[18px] font-bold">{health.withCoordinates}</p><p className="text-[8px] text-white/38">{language === "en" ? "With coordinates" : "มีพิกัด"}</p></div>
        <div data-testid="data-health-maps" className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3"><p className="text-[18px] font-bold">{health.withMapsLink}</p><p className="text-[8px] text-white/38">Maps link</p></div>
        <div data-testid="data-health-images" className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3"><p className="text-[18px] font-bold">{health.withUsableImage}</p><p className="text-[8px] text-white/38">{language === "en" ? "Usable image" : "มีรูปใช้งานได้"}</p></div>
        <div data-testid="data-health-review" className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3"><p className="text-[18px] font-bold">{health.needsReview}</p><p className="text-[8px] text-white/38">{language === "en" ? "Needs review" : "ควรตรวจสอบ"}</p></div>
      </div>
      <p className="mt-3 text-[8px] leading-4 text-[var(--amd-text-3)]">{language === "en"
        ? `Status: verified ${health.status.verified} • partial ${health.status.partial} • stale ${health.status.stale} • unverified ${health.status.unverified} • duplicate candidates ${health.duplicateCandidates}`
        : `สถานะ: ยืนยันแล้ว ${health.status.verified} • บางส่วน ${health.status.partial} • เก่า ${health.status.stale} • ยังไม่ยืนยัน ${health.status.unverified} • คู่ซ้ำที่ควรตรวจ ${health.duplicateCandidates}`}</p>
    </div>
  </section>;
}

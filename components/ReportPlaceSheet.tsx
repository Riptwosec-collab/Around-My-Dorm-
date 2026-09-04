"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import type { Place } from "@/types/place";

const REPORT_TYPES = [
  "ร้านปิดแล้ว",
  "เวลาเปิดผิด",
  "ราคาผิด",
  "ย้ายร้าน",
  "เบอร์โทรผิด",
  "ตำแหน่งผิด",
  "รูปไม่ตรง",
  "ร้านซ้ำ",
  "Delivery ใช้ไม่ได้",
  "ที่จอดรถข้อมูลผิด",
  "อื่น ๆ",
] as const;

export function ReportPlaceSheet({ place, onClose }: { place: Place; onClose: () => void }) {
  const [type, setType] = useState<string>(REPORT_TYPES[0]);
  const [description, setDescription] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function submit() {
    const report = {
      id: `report-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      placeId: place.id,
      reportType: type,
      description: description.trim(),
      image: null,
      userId: null,
      createdAt: new Date().toISOString(),
      status: "pending",
    };
    try {
      const current = JSON.parse(localStorage.getItem("around-dorm-place-reports-v1") || "[]");
      const next = Array.isArray(current) ? [report, ...current].slice(0, 100) : [report];
      localStorage.setItem("around-dorm-place-reports-v1", JSON.stringify(next));
      setSubmitted(true);
    } catch {
      setSubmitted(true);
    }
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/70 backdrop-blur-sm">
      <button type="button" aria-label="ปิดรายงาน" onClick={onClose} className="absolute inset-0" />
      <section className="relative max-h-[84dvh] w-full max-w-[520px] overflow-y-auto rounded-t-[32px] border border-white/10 bg-[#09121f] px-4 pb-[calc(24px+env(safe-area-inset-bottom))] pt-3 shadow-2xl">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/15" />
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-[9px] font-black uppercase tracking-[0.16em] text-amber-200">DATA FEEDBACK</p><h3 className="mt-1 text-xl font-black">ข้อมูลร้านไม่ถูกต้อง?</h3><p className="mt-1 text-[10px] text-white/40">{place.name} • รายงานจะไม่แก้ข้อมูลร้านอัตโนมัติ</p></div>
          <button type="button" onClick={onClose} aria-label="ปิด" className="grid h-11 w-11 place-items-center rounded-full bg-white/[0.05]"><X className="h-4 w-4" /></button>
        </div>

        {submitted ? (
          <div className="mt-7 rounded-[24px] border border-emerald-300/15 bg-emerald-300/[0.06] p-6 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-300" />
            <p className="mt-3 text-sm font-black">รับรายงานแล้ว</p>
            <p className="mt-1 text-[10px] leading-5 text-white/42">สถานะเป็น pending และต้อง Review ก่อนนำไปแก้ข้อมูลจริง</p>
            <button type="button" onClick={onClose} className="mt-4 min-h-11 rounded-2xl bg-cyan-300 px-5 text-[10px] font-black text-[#031018]">ปิด</button>
          </div>
        ) : (
          <>
            <div className="mt-5 grid grid-cols-2 gap-2">
              {REPORT_TYPES.map((item) => <button key={item} type="button" onClick={() => setType(item)} className={`min-h-11 rounded-2xl border px-3 py-2 text-left text-[10px] font-bold ${type === item ? "border-amber-300/25 bg-amber-300/[0.09] text-amber-100" : "border-white/[0.08] bg-white/[0.035] text-white/55"}`}>{item}</button>)}
            </div>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="รายละเอียดเพิ่มเติม (ไม่บังคับ)" className="mt-4 min-h-28 w-full resize-none rounded-[20px] border border-white/[0.08] bg-white/[0.04] p-3 text-[11px] outline-none placeholder:text-white/25 focus:border-cyan-300/25" />
            <div className="mt-3 flex items-start gap-2 rounded-2xl border border-amber-300/10 bg-amber-300/[0.04] p-3 text-[9px] leading-4 text-white/40"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-200" />รายงานเก็บในเครื่องนี้เป็น Local demo จนกว่าจะเชื่อม Backend/Supabase และจะไม่แก้ Place Data โดยอัตโนมัติ</div>
            <button type="button" onClick={submit} className="mt-4 h-12 w-full rounded-2xl bg-cyan-300 text-[11px] font-black text-[#031018]">ส่งรายงาน</button>
          </>
        )}
      </section>
    </div>
  );
}

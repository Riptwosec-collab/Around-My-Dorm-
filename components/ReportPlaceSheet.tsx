"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, LoaderCircle, X } from "lucide-react";
import { submitPlaceReport, type PlaceReportType } from "@/lib/cloud/place-reports";
import type { Place } from "@/types/place";

const REPORT_TYPES: Array<{ value: PlaceReportType; th: string; en: string }> = [
  { value: "closed", th: "ร้านปิดแล้ว", en: "Place closed" },
  { value: "opening_hours", th: "เวลาเปิดไม่ตรง", en: "Opening hours incorrect" },
  { value: "price", th: "ราคาเปลี่ยน", en: "Price changed" },
  { value: "moved", th: "ร้านย้าย", en: "Place moved" },
  { value: "parking", th: "ที่จอดไม่ตรง", en: "Parking incorrect" },
  { value: "phone", th: "เบอร์โทรผิด", en: "Phone incorrect" },
  { value: "location", th: "พิกัด/ที่อยู่ผิด", en: "Location incorrect" },
  { value: "other", th: "อื่น ๆ", en: "Other" },
];

type ResultState = "idle" | "accepted" | "duplicate" | "rate_limited" | "error";

export function ReportPlaceSheet({
  place,
  onClose,
  language = "th",
}: {
  place: Place;
  onClose: () => void;
  language?: "th" | "en";
}) {
  const [type, setType] = useState<PlaceReportType>("closed");
  const [description, setDescription] = useState("");
  const [resultState, setResultState] = useState<ResultState>("idle");
  const [submitting, setSubmitting] = useState(false);

  const isEnglish = language === "en";

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setResultState("idle");
    try {
      const result = await submitPlaceReport({
        placeId: place.id,
        reportType: type,
        message: description,
      });
      if (result.status === "duplicate") setResultState("duplicate");
      if (result.status === "rate_limited") setResultState("rate_limited");
      if (result.status === "accepted") setResultState("accepted");
    } catch {
      setResultState("error");
    } finally {
      setSubmitting(false);
    }
  }

  const completed = resultState === "accepted" || resultState === "duplicate";
  const title = resultState === "duplicate"
    ? isEnglish ? "Report already received" : "เราได้รับรายงานนี้แล้ว"
    : isEnglish ? "Report received" : "รับรายงานแล้ว";
  const detail = resultState === "duplicate"
    ? isEnglish ? "An equivalent report for this place is already under review." : "มีรายงานประเภทเดียวกันสำหรับร้านนี้แล้ว และกำลังรอตรวจสอบ"
    : isEnglish ? "The data will be reviewed before any place information is changed." : "ข้อมูลจะถูกตรวจสอบก่อนแก้ไขข้อมูลร้านจริง";

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/70 backdrop-blur-sm">
      <button type="button" aria-label={isEnglish ? "Close report" : "ปิดรายงาน"} onClick={onClose} className="absolute inset-0" />
      <section className="relative max-h-[84dvh] w-full max-w-[520px] overflow-y-auto rounded-t-[32px] border border-white/10 bg-[#09121f] px-4 pb-[calc(24px+env(safe-area-inset-bottom))] pt-3 shadow-2xl">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/15" />
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-amber-200">DATA FEEDBACK</p>
            <h3 className="mt-1 text-xl font-black">{isEnglish ? "Report incorrect data" : "รายงานข้อมูลผิด"}</h3>
            <p className="mt-1 text-[10px] text-white/40">{place.name} • {isEnglish ? "Reports never change place data automatically" : "รายงานจะไม่แก้ข้อมูลร้านอัตโนมัติ"}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={isEnglish ? "Close" : "ปิด"} className="grid h-11 w-11 place-items-center rounded-full bg-white/[0.05]"><X className="h-4 w-4" /></button>
        </div>

        {completed ? (
          <div className="mt-7 rounded-[24px] border border-emerald-300/15 bg-emerald-300/[0.06] p-6 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-300" />
            <p className="mt-3 text-sm font-black">{title}</p>
            <p className="mt-1 text-[10px] leading-5 text-white/42">{detail}</p>
            <button type="button" onClick={onClose} className="mt-4 min-h-11 rounded-2xl bg-cyan-300 px-5 text-[10px] font-black text-[#031018]">{isEnglish ? "Close" : "ปิด"}</button>
          </div>
        ) : (
          <>
            <div className="mt-5 grid grid-cols-2 gap-2">
              {REPORT_TYPES.map((item) => (
                <button key={item.value} type="button" onClick={() => setType(item.value)} disabled={submitting} className={`min-h-11 rounded-2xl border px-3 py-2 text-left text-[10px] font-bold ${type === item.value ? "border-amber-300/25 bg-amber-300/[0.09] text-amber-100" : "border-white/[0.08] bg-white/[0.035] text-white/55"}`}>
                  {isEnglish ? item.en : item.th}
                </button>
              ))}
            </div>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={500}
              disabled={submitting}
              placeholder={isEnglish ? "Additional details (optional)" : "รายละเอียดเพิ่มเติม (ไม่บังคับ)"}
              className="mt-4 min-h-28 w-full resize-none rounded-[20px] border border-white/[0.08] bg-white/[0.04] p-3 text-[11px] outline-none placeholder:text-white/25 focus:border-cyan-300/25"
            />
            <div className="mt-2 text-right text-[9px] text-white/30">{description.length}/500</div>
            <div className="mt-3 flex items-start gap-2 rounded-2xl border border-amber-300/10 bg-amber-300/[0.04] p-3 text-[9px] leading-4 text-white/40"><AlertTriangle className="mt-0.5 h-3.5 w-3 shrink-0 text-amber-200" />{isEnglish ? "Reports are sent to the review queue and never edit canonical place data automatically." : "รายงานจะเข้าสู่คิวตรวจสอบ และไม่แก้ข้อมูลหลักของร้านโดยอัตโนมัติ"}</div>
            {resultState === "rate_limited" && <p className="mt-3 rounded-xl border border-amber-300/12 bg-amber-300/[0.05] p-3 text-[10px] text-amber-100">{isEnglish ? "Too many reports. Please try again later." : "ส่งรายงานหลายครั้งเกินไป กรุณาลองใหม่ภายหลัง"}</p>}
            {resultState === "error" && <p className="mt-3 rounded-xl border border-rose-300/12 bg-rose-300/[0.05] p-3 text-[10px] text-rose-100">{isEnglish ? "Could not send the report. Your note is still here; please retry." : "ส่งรายงานไม่สำเร็จ ข้อความยังอยู่ สามารถลองส่งใหม่ได้"}</p>}
            <button type="button" onClick={submit} disabled={submitting} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-cyan-300 text-[11px] font-black text-[#031018] disabled:opacity-60">{submitting && <LoaderCircle className="h-4 w-4 animate-spin" />}{submitting ? (isEnglish ? "Sending..." : "กำลังส่ง...") : (isEnglish ? "Send report" : "ส่งรายงาน")}</button>
          </>
        )}
      </section>
    </div>
  );
}

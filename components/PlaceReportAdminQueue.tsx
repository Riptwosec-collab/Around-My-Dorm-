"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, LoaderCircle, RefreshCcw, XCircle } from "lucide-react";
import {
  loadPlaceReports,
  transitionPlaceReport,
  type PlaceReportRow,
  type PlaceReportStatus,
  type PlaceReportType,
} from "@/lib/cloud/place-reports";
import type { Place } from "@/types/place";

const REPORT_LABELS: Record<PlaceReportType, { th: string; en: string }> = {
  closed: { th: "ร้านปิดแล้ว", en: "Place closed" },
  opening_hours: { th: "เวลาเปิดไม่ตรง", en: "Opening hours" },
  price: { th: "ราคาเปลี่ยน", en: "Price" },
  moved: { th: "ร้านย้าย", en: "Moved" },
  parking: { th: "ที่จอดไม่ตรง", en: "Parking" },
  phone: { th: "เบอร์โทรผิด", en: "Phone" },
  location: { th: "พิกัด/ที่อยู่ผิด", en: "Location" },
  other: { th: "อื่น ๆ", en: "Other" },
};

export function PlaceReportAdminQueue({ places, language }: { places: Place[]; language: "th" | "en" }) {
  const [reports, setReports] = useState<PlaceReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | PlaceReportStatus>("all");
  const isEnglish = language === "en";
  const placeMap = useMemo(() => new Map(places.map((place) => [place.id, place])), [places]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setReports(await loadPlaceReports());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Report queue unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const counts = useMemo(() => ({
    pending: reports.filter((report) => report.status === "pending").length,
    reviewed: reports.filter((report) => report.status === "reviewed").length,
    resolved: reports.filter((report) => report.status === "resolved").length,
    rejected: reports.filter((report) => report.status === "rejected").length,
  }), [reports]);
  const visible = filter === "all" ? reports : reports.filter((report) => report.status === filter);

  async function transition(report: PlaceReportRow, status: Exclude<PlaceReportStatus, "pending">) {
    setBusyId(report.id);
    try {
      const updated = await transitionPlaceReport(report.id, status);
      setReports((current) => current.map((item) => item.id === updated.id ? updated : item));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Report transition failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="amd-glass amd-card mt-4 p-4" data-testid="place-report-admin-queue">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-[9px] font-black uppercase tracking-[0.16em] text-amber-200">DATA REPORTS</p><h3 className="mt-1 text-[13px] font-bold">{isEnglish ? "Public report review" : "คิวตรวจรายงานข้อมูล"}</h3></div>
        <button type="button" onClick={() => void refresh()} disabled={loading} className="grid h-10 w-10 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.035]"><RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
        {(["pending", "reviewed", "resolved", "rejected"] as const).map((status) => <button key={status} type="button" onClick={() => setFilter(status)} className={`rounded-xl border p-2 ${filter === status ? "border-cyan-300/25 bg-cyan-300/[0.07]" : "border-white/[0.06] bg-white/[0.025]"}`}><p className="text-[16px] font-bold">{counts[status]}</p><p className="mt-1 text-[7px] uppercase text-white/40">{status}</p></button>)}
      </div>
      <button type="button" onClick={() => setFilter("all")} className="mt-2 text-[8px] font-bold text-cyan-200">{isEnglish ? "Show all" : "แสดงทั้งหมด"}</button>

      {error && <p className="mt-3 rounded-xl border border-rose-300/12 bg-rose-300/[0.05] p-3 text-[9px] text-rose-100">{error}</p>}
      {loading ? <div className="mt-5 flex items-center justify-center gap-2 text-[9px] text-white/40"><LoaderCircle className="h-4 w-4 animate-spin" />{isEnglish ? "Loading reports..." : "กำลังโหลดรายงาน..."}</div> : (
        <div className="mt-4 space-y-2">
          {visible.length === 0 && <p className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4 text-center text-[9px] text-white/38">{isEnglish ? "No reports in this state" : "ไม่มีรายงานในสถานะนี้"}</p>}
          {visible.map((report) => {
            const place = placeMap.get(report.placeId);
            const label = REPORT_LABELS[report.reportType][isEnglish ? "en" : "th"];
            const busy = busyId === report.id;
            return <article key={report.id} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3">
              <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-bold">{place?.name || report.placeId}</p><p className="mt-1 text-[9px] font-semibold text-amber-100">{label}</p></div><span className="rounded-lg bg-white/[0.05] px-2 py-1 text-[8px] uppercase text-white/45">{report.status}</span></div>
              {report.message && <p className="mt-2 rounded-xl bg-black/10 p-2 text-[9px] leading-4 text-white/55">{report.message}</p>}
              <p className="mt-2 text-[8px] text-white/35">{new Date(report.createdAt).toLocaleString(isEnglish ? "en-GB" : "th-TH")} • duplicate +{report.duplicateCount}</p>
              {(report.status === "pending" || report.status === "reviewed") && <div className="mt-3 grid grid-cols-3 gap-2">
                {report.status === "pending" && <button type="button" disabled={busy} onClick={() => void transition(report, "reviewed")} className="min-h-10 rounded-xl border border-cyan-300/12 bg-cyan-300/[0.05] text-[8px] font-bold text-cyan-100">{isEnglish ? "Review" : "รับตรวจ"}</button>}
                <button type="button" disabled={busy} onClick={() => void transition(report, "resolved")} className="min-h-10 rounded-xl border border-emerald-300/12 bg-emerald-300/[0.05] text-[8px] font-bold text-emerald-100"><CheckCircle2 className="mx-auto mb-1 h-3 w-3" />{isEnglish ? "Resolved" : "แก้แล้ว"}</button>
                <button type="button" disabled={busy} onClick={() => void transition(report, "rejected")} className="min-h-10 rounded-xl border border-rose-300/12 bg-rose-300/[0.05] text-[8px] font-bold text-rose-100"><XCircle className="mx-auto mb-1 h-3 w-3" />{isEnglish ? "Reject" : "ปฏิเสธ"}</button>
              </div>}
            </article>;
          })}
        </div>
      )}
      <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-300/10 bg-amber-300/[0.035] p-3 text-[8px] leading-4 text-white/40"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-200" />{isEnglish ? "Resolving a report does not modify canonical place data. Correct or verify the place first." : "การกดแก้แล้วจะเปลี่ยนสถานะรายงานเท่านั้น ต้องแก้หรือยืนยันข้อมูลร้านจริงก่อน"}</div>
    </section>
  );
}

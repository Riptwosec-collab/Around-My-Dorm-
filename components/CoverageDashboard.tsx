"use client";

import { useMemo } from "react";
import { AlertTriangle, Crosshair, Search } from "lucide-react";
import { buildCoverageReport, type CoverageGap } from "@/lib/coverage/coverage";
import type { Place } from "@/types/place";

export function CoverageDashboard({
  places,
  language,
  onReviewGap,
  onSearchGap,
}: {
  places: Place[];
  language: "th" | "en";
  onReviewGap: (gap: CoverageGap) => void;
  onSearchGap: (gap: CoverageGap) => void;
}) {
  const report = useMemo(() => buildCoverageReport(places), [places]);
  const importantGaps = report.gaps.slice(0, 12);

  return (
    <section data-testid="coverage-dashboard" className="amd-glass amd-card mt-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-bold">{language === "en" ? "Coverage around Baan Supar" : "Coverage รอบบ้านสุภา"}</p>
          <p className="mt-1 text-[9px] leading-4 text-[var(--amd-text-3)]">
            {language === "en" ? "Stored data only. Coverage analysis sends no external provider request." : "วิเคราะห์จากข้อมูลที่บันทึกไว้เท่านั้น ไม่เรียก External Provider"}
          </p>
        </div>
        <span className="rounded-full border border-cyan-300/10 bg-cyan-300/[0.05] px-2.5 py-1.5 text-[8px] text-cyan-100">{report.totalPlaces} places</span>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {report.rings.map((summary) => (
          <article key={summary.ring.id} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3">
            <div className="flex items-center justify-between gap-2">
              <div><p className="text-[11px] font-bold">{summary.ring.label}</p><p className="mt-1 text-[8px] text-white/38">{summary.total} {language === "en" ? "places" : "สถานที่"}</p></div>
              <span className="rounded-full bg-white/[0.05] px-2 py-1 text-[8px] text-white/55">{summary.verified} verified</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-1.5 text-[8px] text-white/48">
              <span>{language === "en" ? "Coordinates" : "พิกัด"} {summary.coordinateCoverage}%</span>
              <span>Maps {summary.mapsCoverage}%</span>
              <span>{language === "en" ? "Images" : "รูป"} {summary.imageCoverage}%</span>
              <span>{language === "en" ? "Hours" : "เวลา"} {summary.hoursCoverage}%</span>
              <span>{language === "en" ? "Price" : "ราคา"} {summary.priceCoverage}%</span>
              <span>{language === "en" ? "Stale" : "ข้อมูลเก่า"} {summary.stale}</span>
            </div>
          </article>
        ))}
      </div>

      <div className="mt-4 border-t border-white/[0.06] pt-4">
        <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-200" /><p className="text-[10px] font-bold">{language === "en" ? "Coverage gaps" : "ช่องว่าง Coverage"}</p></div>
        <div className="mt-3 space-y-2">
          {importantGaps.map((gap) => (
            <article key={gap.id} className="rounded-xl border border-white/[0.06] bg-black/10 p-3">
              <div className="flex items-start justify-between gap-2"><p className="text-[9px] leading-4 text-white/65">{gap.message}</p><span className="shrink-0 text-[8px] font-bold uppercase text-amber-100">{gap.severity}</span></div>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => onReviewGap(gap)} className="amd-chip flex min-h-9 flex-1 items-center justify-center gap-1 text-[8px] font-bold"><Crosshair className="h-3 w-3" />{language === "en" ? "Review existing" : "ตรวจข้อมูลเดิม"}</button>
                <button type="button" onClick={() => onSearchGap(gap)} className="amd-chip flex min-h-9 flex-1 items-center justify-center gap-1 text-[8px] font-bold text-[#8ecbff]"><Search className="h-3 w-3" />{language === "en" ? "Search candidates" : "ค้นหา Candidate"}</button>
              </div>
            </article>
          ))}
          {!importantGaps.length && <p className="rounded-xl border border-emerald-300/10 bg-emerald-300/[0.04] p-3 text-[9px] text-emerald-100">{language === "en" ? "No configured coverage gaps detected." : "ยังไม่พบ Coverage Gap ตามเกณฑ์ที่ตั้งไว้"}</p>}
        </div>
      </div>
    </section>
  );
}

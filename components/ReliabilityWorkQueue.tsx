"use client";

import { Search, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import type { CoverageReliabilityTask, PlaceReliabilityTask, ReliabilityTask } from "@/lib/reliability/types";

type QueueFilter = "all" | "critical" | "high" | "reports" | "openingHours" | "price" | "parking" | "phone" | "location" | "coverage";

export function ReliabilityWorkQueue({
  tasks,
  language,
  onVerifyTask,
  onReviewCoverage,
  onSearchCandidates,
}: {
  tasks: ReliabilityTask[];
  language: "th" | "en";
  onVerifyTask: (task: PlaceReliabilityTask) => void;
  onReviewCoverage: (task: CoverageReliabilityTask) => void;
  onSearchCandidates: (task: CoverageReliabilityTask) => void;
}) {
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [query, setQuery] = useState("");
  const isEnglish = language === "en";
  const filters: Array<{ id: QueueFilter; label: string }> = [
    { id: "all", label: isEnglish ? "All" : "ทั้งหมด" },
    { id: "critical", label: "Critical" },
    { id: "high", label: "High" },
    { id: "reports", label: isEnglish ? "Reports" : "รายงาน" },
    { id: "openingHours", label: isEnglish ? "Opening hours" : "เวลาเปิด" },
    { id: "price", label: isEnglish ? "Price" : "ราคา" },
    { id: "parking", label: isEnglish ? "Parking" : "ที่จอด" },
    { id: "phone", label: isEnglish ? "Phone" : "เบอร์โทร" },
    { id: "location", label: isEnglish ? "Location" : "พิกัด" },
    { id: "coverage", label: "Coverage" },
  ];

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(language === "th" ? "th-TH" : "en-US");
    return tasks.filter((task) => {
      if (filter === "critical" && task.severity !== "critical") return false;
      if (filter === "high" && task.severity !== "high") return false;
      if (filter === "reports" && !(task.kind === "place_field" && task.reportIds.length > 0)) return false;
      if (["openingHours", "price", "parking", "phone", "location"].includes(filter) && !(task.kind === "place_field" && task.field === filter)) return false;
      if (filter === "coverage" && task.kind !== "coverage_gap") return false;
      if (!needle) return true;
      return task.placeName.toLocaleLowerCase(language === "th" ? "th-TH" : "en-US").includes(needle);
    });
  }, [filter, language, query, tasks]);

  return (
    <section className="amd-glass amd-card mt-4 p-4" data-testid="reliability-work-queue">
      <div className="flex items-start gap-3"><ShieldAlert className="mt-0.5 h-5 w-5 text-amber-200" /><div><p className="text-[12px] font-bold">{isEnglish ? "Reliability work queue" : "คิวตรวจความน่าเชื่อถือข้อมูล"}</p><p className="mt-1 text-[9px] text-[var(--amd-text-3)]">{visible.length} {isEnglish ? "visible tasks" : "งานที่แสดง"}</p></div></div>

      <label className="mt-3 flex min-h-10 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3">
        <Search className="h-4 w-4 text-white/35" />
        <input type="search" aria-label={isEnglish ? "Search reliability tasks" : "ค้นหางานตรวจข้อมูล"} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={isEnglish ? "Search place…" : "ค้นหาร้าน…"} className="min-w-0 flex-1 bg-transparent text-[10px] outline-none placeholder:text-white/30" />
      </label>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {filters.map((item) => <button key={item.id} type="button" onClick={() => setFilter(item.id)} className={`amd-chip min-h-9 shrink-0 px-3 text-[8px] font-bold ${filter === item.id ? "amd-chip-active" : ""}`}>{item.label}</button>)}
      </div>

      <div className="mt-3 space-y-2">
        {visible.map((task) => task.kind === "place_field"
          ? <PlaceTaskCard key={task.id} task={task} language={language} onVerify={onVerifyTask} />
          : <CoverageTaskCard key={task.id} task={task} language={language} onReview={onReviewCoverage} onSearch={onSearchCandidates} />)}
        {!visible.length && <p className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4 text-center text-[9px] text-white/40">{isEnglish ? "No matching reliability tasks" : "ไม่มีงานตรวจที่ตรงเงื่อนไข"}</p>}
      </div>
    </section>
  );
}

function PlaceTaskCard({ task, language, onVerify }: { task: PlaceReliabilityTask; language: "th" | "en"; onVerify: (task: PlaceReliabilityTask) => void }) {
  const isEnglish = language === "en";
  const fieldLabels: Record<PlaceReliabilityTask["field"], string> = {
    openingHours: isEnglish ? "Opening hours" : "เวลาเปิด",
    price: isEnglish ? "Price" : "ราคา",
    phone: isEnglish ? "Phone" : "เบอร์โทร",
    parking: isEnglish ? "Parking" : "ที่จอด",
    location: isEnglish ? "Location" : "พิกัด",
    reportReview: isEnglish ? "Report review" : "ตรวจรายงาน",
  };
  return <article className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3">
    <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-bold">{task.placeName}</p><p className="mt-1 text-[8px] text-white/45">{fieldLabels[task.field]} • {task.freshnessStatus ?? (isEnglish ? "report" : "รายงาน")}</p></div><div className="text-right"><p className="text-[12px] font-bold">{task.priority}/100</p><p className="mt-1 text-[7px] uppercase text-white/35">{task.severity}</p></div></div>
    {task.reportIds.length > 0 && <p className="mt-2 text-[8px] text-amber-100">{isEnglish ? `${task.reportIds.length} unresolved report(s)` : `มี ${task.reportIds.length} รายงานที่ยังไม่ปิด`}</p>}
    <button type="button" onClick={() => onVerify(task)} className="mt-3 min-h-10 w-full rounded-xl border border-cyan-300/12 bg-cyan-300/[0.05] text-[9px] font-bold text-cyan-100">{task.field === "reportReview" ? (isEnglish ? "Review report" : "ตรวจรายงาน") : (isEnglish ? "Verify" : "ตรวจข้อมูล")}</button>
  </article>;
}

function CoverageTaskCard({ task, language, onReview, onSearch }: { task: CoverageReliabilityTask; language: "th" | "en"; onReview: (task: CoverageReliabilityTask) => void; onSearch: (task: CoverageReliabilityTask) => void }) {
  const isEnglish = language === "en";
  return <article className="rounded-2xl border border-amber-300/10 bg-amber-300/[0.025] p-3">
    <div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-bold text-amber-100">COVERAGE</p><p className="mt-1 text-[9px] leading-4 text-white/60">{task.placeName}</p></div><span className="text-[10px] font-bold">{task.priority}/100</span></div>
    <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => onReview(task)} className="min-h-10 rounded-xl border border-white/[0.07] bg-white/[0.03] text-[8px] font-bold">{isEnglish ? "Review existing" : "ตรวจข้อมูลเดิม"}</button><button type="button" onClick={() => onSearch(task)} className="min-h-10 rounded-xl border border-cyan-300/12 bg-cyan-300/[0.05] text-[8px] font-bold text-cyan-100">{isEnglish ? "Search candidates" : "ค้นหา Candidate"}</button></div>
  </article>;
}

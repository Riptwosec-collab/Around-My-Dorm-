"use client";

import { AlertTriangle, CircleAlert, FileWarning, ShieldCheck } from "lucide-react";
import type { ReliabilityTask } from "@/lib/reliability/types";

export function ReliabilitySummary({ tasks, language }: { tasks: ReliabilityTask[]; language: "th" | "en" }) {
  const critical = tasks.filter((task) => task.severity === "critical").length;
  const high = tasks.filter((task) => task.severity === "high").length;
  const reports = tasks.filter((task) => task.kind === "place_field" && task.reportIds.length > 0).length;
  const stale = tasks.filter((task) => task.kind === "place_field" && task.freshnessStatus === "stale").length;
  const unknown = tasks.filter((task) => task.kind === "place_field" && task.freshnessStatus === "unknown").length;
  const isEnglish = language === "en";

  return (
    <section className="amd-glass amd-card mt-4 p-4" data-testid="reliability-summary">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 text-cyan-200" />
        <div>
          <p className="text-[12px] font-bold">{isEnglish ? "Data reliability operations" : "ศูนย์ปฏิบัติการความน่าเชื่อถือข้อมูล"}</p>
          <p className="mt-1 text-[9px] leading-4 text-[var(--amd-text-3)]">{isEnglish ? "Derived from stored freshness, reports, and coverage. No provider request is sent." : "คำนวณจาก freshness, รายงาน และ coverage ที่บันทึกไว้ โดยไม่เรียก Provider"}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Metric icon={CircleAlert} label={isEnglish ? "Critical" : "เร่งด่วน"} value={critical} />
        <Metric icon={AlertTriangle} label={isEnglish ? "High" : "สำคัญ"} value={high} />
        <Metric icon={FileWarning} label={isEnglish ? "Reports" : "มีรายงาน"} value={reports} />
        <Metric icon={AlertTriangle} label={isEnglish ? "Stale" : "ข้อมูลเก่า"} value={stale} />
        <Metric icon={CircleAlert} label={isEnglish ? "Unknown" : "ไม่ทราบวันตรวจ"} value={unknown} />
      </div>
    </section>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof ShieldCheck; label: string; value: number }) {
  return <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3"><Icon className="h-3.5 w-3.5 text-white/40" /><p className="mt-2 text-[18px] font-bold">{value}</p><p className="mt-1 text-[8px] text-white/40">{label}</p></div>;
}

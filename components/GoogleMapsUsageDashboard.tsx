"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Gauge, ShieldCheck } from "lucide-react";
import { getGoogleApiBudgetSummary, hydrateGoogleApiBudgetSummary, type GoogleApiBudgetSummary } from "@/lib/google-api-budget";
import { googleDynamicMapSafetyState, googleMapsMonthlySoftLimit } from "@/lib/google-map-cost-control";
import { getGoogleRequestUsage, hydrateGoogleRequestLogs } from "@/lib/google-request-manager";

function formatWhen(value: string | null, language: "th" | "en") {
  if (!value) return language === "en" ? "Never" : "ยังไม่เคย";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(language === "en" ? "en-GB" : "th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function GoogleMapsUsageDashboard({ language }: { language: "th" | "en" }) {
  const [version, setVersion] = useState(0);
  const [budget, setBudget] = useState<GoogleApiBudgetSummary>(() => getGoogleApiBudgetSummary());

  useEffect(() => {
    let active = true;
    void hydrateGoogleRequestLogs().finally(() => {
      if (active) setVersion((value) => value + 1);
    });
    void hydrateGoogleApiBudgetSummary()
      .then((next) => { if (active) setBudget(next); })
      .catch(() => undefined);

    const sync = () => {
      setVersion((value) => value + 1);
      void hydrateGoogleApiBudgetSummary(true)
        .then((next) => { if (active) setBudget(next); })
        .catch(() => undefined);
    };
    window.addEventListener("amd-google-usage-change", sync);
    return () => {
      active = false;
      window.removeEventListener("amd-google-usage-change", sync);
    };
  }, []);

  const usage = useMemo(() => getGoogleRequestUsage(), [version]);
  const budgetState = useMemo(
    () => googleDynamicMapSafetyState(budget.used, googleMapsMonthlySoftLimit()),
    [budget.used],
  );
  const safety = useMemo(
    () => googleDynamicMapSafetyState(budget.breakdown.dynamicMap, googleMapsMonthlySoftLimit()),
    [budget.breakdown.dynamicMap],
  );
  const monthlyManual = Math.max(0, budget.used - budget.breakdown.dynamicMap);
  const tone = safety.level === "safe" ? "text-emerald-200" : safety.level === "warning" ? "text-amber-100" : safety.level === "high" ? "text-orange-200" : "text-rose-200";

  return (
    <section data-testid="google-maps-usage-dashboard" className="amd-glass amd-card mt-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><Gauge className="h-5 w-5 text-[#00D9FF]" /><p className="text-[11px] font-bold">GOOGLE MAPS USAGE</p></div>
          <p className="mt-1 text-[8px] leading-4 text-white/38">{language === "en" ? "Admin project-wide app estimate — not the official Google billing counter." : "ตัวนับโดยประมาณทั้งโปรเจกต์สำหรับ Admin — ไม่ใช่ตัวเลข Billing อย่างเป็นทางการของ Google"}</p>
        </div>
        <ShieldCheck className="h-5 w-5 text-[#00E5C3]" />
      </div>

      <div className="mt-3 rounded-[22px] border border-cyan-300/10 bg-[linear-gradient(145deg,rgba(0,140,255,.09),rgba(0,229,195,.035))] p-4" data-testid="google-api-budget-card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#8ecbff]">FREE API LEFT</p>
            <p className="mt-1 text-[28px] font-black tracking-[-0.04em] text-white">{budgetState.remaining.toLocaleString()} <span className="text-[13px] font-semibold text-white/35">/ {budgetState.freeLimit.toLocaleString()}</span></p>
          </div>
          <div className="text-right text-[8px] leading-4 text-white/45">
            <p>{language === "en" ? "Used" : "ใช้แล้ว"} <strong className="text-white/75">{budgetState.used.toLocaleString()}</strong></p>
            <p>Reset <strong className="text-white/75">{formatWhen(budget.resetAt || budgetState.resetAt, language)}</strong></p>
            <p>{budget.resetTimezone}</p>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full bg-white/55 transition-[width]" style={{ width: `${Math.min(100, budgetState.percent)}%` }} /></div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[8px] leading-4 text-white/35">
          <span>App-tracked estimate</span>
          <span>{language === "en" ? "Project-wide monthly cycle • Asia/Bangkok" : "รอบรายเดือนทั้งโปรเจกต์ • Asia/Bangkok"}</span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-2xl border border-white/[0.06] bg-black/10 p-3"><p className="text-[8px] text-white/35">Dynamic Map Loads — This Browser Today</p><p className="mt-1 text-[20px] font-bold">{usage.dynamicMapToday}</p></div>
        <div className="rounded-2xl border border-white/[0.06] bg-black/10 p-3"><p className="text-[8px] text-white/35">Dynamic Map Loads — Project Month</p><p className="mt-1 text-[20px] font-bold">{budget.breakdown.dynamicMap}</p></div>
        <div className="rounded-2xl border border-white/[0.06] bg-black/10 p-3"><p className="text-[8px] text-white/35">Manual Google Requests — This Browser Today</p><p className="mt-1 text-[20px] font-bold">{usage.manualToday}</p></div>
        <div className="rounded-2xl border border-white/[0.06] bg-black/10 p-3"><p className="text-[8px] text-white/35">Manual Google Requests — Project Month</p><p className="mt-1 text-[20px] font-bold">{monthlyManual}</p></div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[8px] sm:grid-cols-5">
        {[
          ["Places Search", budget.breakdown.textSearch],
          ["Place Details", budget.breakdown.placeDetails],
          ["Photos", budget.breakdown.placePhoto],
          ["Geocoding", budget.breakdown.geocoding],
          ["Routes", budget.breakdown.routes],
        ].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-white/[0.035] p-2"><span className="text-white/35">{label}</span><strong className="float-right text-white/78">{Number(value).toLocaleString()}</strong></div>)}
      </div>

      <div className="mt-3 rounded-2xl border border-white/[0.06] bg-black/10 p-3">
        <div className="flex items-center justify-between gap-3">
          <div><p className={`text-[10px] font-extrabold ${tone}`}>{safety.level.toUpperCase()}</p><p className="mt-1 text-[8px] leading-4 text-white/42">{safety.message}</p></div>
          <div className="text-right"><p className="text-[16px] font-bold">{safety.used.toLocaleString()} / {safety.target.toLocaleString()}</p><p className="text-[7px] text-white/28">Dynamic Maps soft limit {safety.softLimit.toLocaleString()}</p></div>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full bg-white/50 transition-[width]" style={{ width: `${Math.min(100, safety.percent)}%` }} /></div>
      </div>

      <div className="mt-3 grid gap-2 text-[8px] sm:grid-cols-2">
        <div className="rounded-xl bg-white/[0.025] p-2"><span className="text-white/35">Last Google API Request</span><p className="mt-1 font-semibold text-white/70">{formatWhen(budget.lastRequestAt || usage.lastGoogleRequest, language)}</p></div>
        <div className="rounded-xl bg-white/[0.025] p-2"><span className="text-white/35">Last Manual Data Update</span><p className="mt-1 font-semibold text-white/70">{formatWhen(usage.lastManualDataUpdate, language)}</p></div>
      </div>
      <a href="https://console.cloud.google.com/google/maps-apis/metrics" target="_blank" rel="noreferrer" className="amd-chip mt-3 flex min-h-11 w-full items-center justify-center gap-2 px-4 text-[9px] font-bold text-[#8ecbff]">Open Google Cloud Usage <ExternalLink className="h-3.5 w-3.5" /></a>
    </section>
  );
}

"use client";

import { useState } from "react";
import { ChevronRight, RotateCcw, Utensils, X } from "lucide-react";
import { getCopy } from "@/locales";
import type { FoodNowOptions, FoodNowResult } from "@/lib/discovery/food-now";
import type { Language } from "@/types/app";
import type { Place } from "@/types/place";

export type { FoodNowOptions } from "@/lib/discovery/food-now";

type FoodNowSheetProps = {
  language: Language;
  defaultRadius: number;
  results: FoodNowResult[];
  onClose: () => void;
  onSubmit: (value: FoodNowOptions) => void;
  onOpenPlace: (place: Place) => void;
};

export function FoodNowSheet({
  language,
  defaultRadius,
  results,
  onClose,
  onSubmit,
  onOpenPlace,
}: FoodNowSheetProps) {
  const copy = getCopy(language);
  const [budget, setBudget] = useState<number | null>(200);
  const [radius, setRadius] = useState(Math.min(defaultRadius, 2000));
  const [localOnly, setLocalOnly] = useState(false);
  const [openNow, setOpenNow] = useState(true);
  const [lateOnly, setLateOnly] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function submit(next: FoodNowOptions = { budget, radius, localOnly, openNow, lateOnly }) {
    setSubmitted(true);
    onSubmit(next);
  }

  function retry() {
    setSubmitted(false);
  }

  function relaxRadius() {
    const next = { budget, radius: 2000, localOnly, openNow, lateOnly };
    setRadius(2000);
    submit(next);
  }

  function relaxBudget() {
    const next = { budget: null, radius, localOnly, openNow, lateOnly };
    setBudget(null);
    submit(next);
  }

  function relaxOpenStatus() {
    const next = { budget, radius, localOnly, openNow: false, lateOnly };
    setOpenNow(false);
    submit(next);
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/65 backdrop-blur-sm">
      <button type="button" onClick={onClose} aria-label={copy.close} className="absolute inset-0" />
      <section role="dialog" aria-modal="true" className="amd-glass-strong relative max-h-[88dvh] w-full max-w-[520px] overflow-y-auto rounded-t-[30px] p-4 pb-[calc(18px+env(safe-area-inset-bottom))]">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/15" />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Utensils className="h-5 w-5 text-[#00D9FF]" />
            <h3 className="text-[20px] font-bold">{copy.foodNow}</h3>
          </div>
          <button type="button" onClick={onClose} aria-label={copy.close} className="amd-btn grid h-11 w-11 place-items-center rounded-full">
            <X className="h-4 w-4" />
          </button>
        </div>

        {!submitted ? (
          <>
            <p className="mt-4 text-[11px] font-semibold text-[var(--amd-text-2)]">{copy.budget}</p>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {[100, 200, 300, null].map((value) => (
                <button key={String(value)} type="button" onClick={() => setBudget(value)} className={`amd-chip min-h-11 px-2 text-[10px] ${budget === value ? "amd-chip-active" : ""}`}>
                  {value == null ? copy.unlimited : `≤ ${value}`}
                </button>
              ))}
            </div>

            <p className="mt-4 text-[11px] font-semibold text-[var(--amd-text-2)]">{copy.distance}</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {[[500, "500 ม."], [1000, "1 กม."], [2000, "2 กม."]] .map(([value, label]) => (
                <button key={String(value)} type="button" onClick={() => setRadius(Number(value))} className={`amd-chip min-h-11 text-[10px] ${radius === value ? "amd-chip-active" : ""}`}>
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <button type="button" aria-pressed={localOnly} onClick={() => setLocalOnly(!localOnly)} className={`amd-chip min-h-11 px-2 text-[9px] ${localOnly ? "amd-chip-active" : ""}`}>{copy.localOnly}</button>
              <button type="button" aria-pressed={openNow} onClick={() => setOpenNow(!openNow)} className={`amd-chip min-h-11 px-2 text-[9px] ${openNow ? "amd-chip-active" : ""}`}>{copy.openNow}</button>
              <button type="button" aria-pressed={lateOnly} onClick={() => setLateOnly(!lateOnly)} className={`amd-chip min-h-11 px-2 text-[9px] ${lateOnly ? "amd-chip-active" : ""}`}>{copy.late}</button>
            </div>

            <button type="button" onClick={() => submit()} className="amd-btn amd-btn-primary mt-5 h-12 w-full rounded-2xl font-bold">{copy.chooseFood}</button>
          </>
        ) : results.length ? (
          <>
            <div className="mt-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[15px] font-bold">{language === "en" ? "Good choices right now" : "ตัวเลือกที่เหมาะตอนนี้"}</p>
                <p className="mt-1 text-[10px] text-[var(--amd-text-3)]">{language === "en" ? `${results.length} matches from stored local data` : `${results.length} ร้านจากข้อมูลที่บันทึกไว้`}</p>
              </div>
              <button type="button" onClick={retry} className="amd-chip flex shrink-0 items-center gap-1.5 px-3 text-[10px] font-semibold">
                <RotateCcw className="h-3.5 w-3.5" /> {language === "en" ? "Try again" : "ลองใหม่"}
              </button>
            </div>

            <div className="mt-4 space-y-2.5">
              {results.map((result, index) => (
                <button
                  key={result.place.id}
                  type="button"
                  onClick={() => { onClose(); onOpenPlace(result.place); }}
                  className="amd-glass amd-card flex w-full items-center gap-3 p-3 text-left"
                >
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-[#00D9FF]/20 bg-[#00D9FF]/[0.07] text-[12px] font-bold text-[#00D9FF]">{index + 1}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold text-[var(--amd-text)]">{result.place.name}</p>
                    <p className="mt-1 text-[10px] leading-4 text-[var(--amd-text-2)]">{result.reasonLine}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[var(--amd-text-3)]" />
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="mt-5 rounded-2xl border border-amber-300/15 bg-amber-300/[0.05] p-4">
              <p className="text-[14px] font-bold text-amber-100">{language === "en" ? "No exact match yet" : "ยังไม่พบร้านที่ตรงทุกเงื่อนไข"}</p>
              <p className="mt-1 text-[10px] leading-5 text-amber-100/70">{language === "en" ? "Choose one relaxation below. Nothing is relaxed automatically." : "เลือกผ่อนเงื่อนไขด้านล่างได้ทีละข้อ ระบบจะไม่ผ่อนเงื่อนไขให้อัตโนมัติ"}</p>
            </div>
            <div className="mt-3 grid gap-2">
              {radius < 2000 && <button type="button" onClick={relaxRadius} className="amd-chip min-h-11 px-4 text-left text-[10px] font-semibold">{language === "en" ? "Expand to 2 km" : "ขยายเป็น 2 กม."}</button>}
              {budget != null && <button type="button" onClick={relaxBudget} className="amd-chip min-h-11 px-4 text-left text-[10px] font-semibold">{language === "en" ? "Remove budget limit" : "ไม่จำกัดงบ"}</button>}
              {openNow && <button type="button" onClick={relaxOpenStatus} className="amd-chip min-h-11 px-4 text-left text-[10px] font-semibold">{language === "en" ? "Include places with unknown opening status" : "รวมร้านที่ไม่ทราบเวลาเปิด"}</button>}
            </div>
            <button type="button" onClick={retry} className="amd-btn mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-2xl text-[11px] font-semibold">
              <RotateCcw className="h-4 w-4" /> {language === "en" ? "Try again" : "ลองใหม่"}
            </button>
          </>
        )}
      </section>
    </div>
  );
}

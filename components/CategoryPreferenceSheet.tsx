"use client";
import { Check, X } from "lucide-react";
import { CATEGORIES } from "@/data/categories";
import { getCopy } from "@/locales";
import type { Language } from "@/types/app";
import type { CategoryId } from "@/types/place";

export function CategoryPreferenceSheet({ value, language, onChange, onClose }: { value: CategoryId[]; language: Language; onChange: (next: CategoryId[]) => void; onClose: () => void }) {
  const copy = getCopy(language);
  const selected = new Set(value);
  return <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/65 backdrop-blur-sm"><button type="button" onClick={onClose} aria-label={copy.close} className="absolute inset-0" /><section role="dialog" aria-modal="true" className="amd-glass-strong relative max-h-[82dvh] w-full max-w-[520px] overflow-y-auto rounded-t-[30px] p-4 pb-[calc(18px+env(safe-area-inset-bottom))]"><div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/15" /><div className="flex items-center justify-between"><div><h3 className="text-[20px] font-bold">{copy.categoryPreferences}</h3><p className="mt-1 text-[11px] text-[var(--amd-text-2)]">{copy.interestedCategoriesSub}</p></div><button type="button" onClick={onClose} className="amd-btn grid h-11 w-11 place-items-center rounded-full"><X className="h-4 w-4" /></button></div><div className="mt-4 grid grid-cols-2 gap-2">{CATEGORIES.filter((item) => item.id !== "all").map((item) => { const id = item.id as CategoryId; const active = selected.has(id); return <button key={id} type="button" aria-pressed={active} onClick={() => onChange(active ? value.filter((x) => x !== id) : [...value, id])} className={`amd-chip flex min-h-12 items-center gap-2 px-3 text-left text-[11px] font-semibold ${active ? "amd-chip-active" : ""}`}><span>{item.icon}</span><span className="min-w-0 flex-1 truncate">{item.name}</span>{active && <Check className="h-4 w-4" />}</button>; })}</div><button type="button" onClick={onClose} className="amd-btn amd-btn-primary mt-5 h-12 w-full rounded-2xl font-bold">{copy.done}</button></section></div>;
}

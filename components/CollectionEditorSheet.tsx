"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { getCopy } from "@/locales";
import type { Language, SavedCollection } from "@/types/app";

export function CollectionEditorSheet({ mode, collection, language, onClose, onSubmit }: {
  mode: "create" | "rename" | "delete";
  collection?: SavedCollection;
  language: Language;
  onClose: () => void;
  onSubmit: (value?: string) => void;
}) {
  const copy = getCopy(language);
  const [value, setValue] = useState(collection?.title || "");
  useEffect(() => setValue(collection?.title || ""), [collection]);
  return <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/65 backdrop-blur-sm">
    <button type="button" aria-label={copy.close} onClick={onClose} className="absolute inset-0" />
    <section role="dialog" aria-modal="true" className="amd-glass-strong relative w-full max-w-[520px] rounded-t-[30px] p-4 pb-[calc(18px+env(safe-area-inset-bottom))]">
      <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/15" />
      <div className="flex items-center justify-between"><h3 className="text-[20px] font-bold">{mode === "create" ? copy.createCollection : mode === "rename" ? copy.rename : copy.deleteCollection}</h3><button type="button" onClick={onClose} className="amd-btn grid h-11 w-11 place-items-center rounded-full"><X className="h-4 w-4" /></button></div>
      {mode === "delete" ? <div className="mt-4 rounded-2xl border border-rose-300/15 bg-rose-300/[0.05] p-4"><div className="flex gap-3"><AlertTriangle className="h-5 w-5 shrink-0 text-rose-300" /><div><p className="font-semibold">{collection?.title}</p><p className="mt-1 text-[12px] text-[var(--amd-text-2)]">{copy.deleteConfirm}</p></div></div></div> : <input autoFocus value={value} onChange={(event) => setValue(event.target.value)} placeholder={copy.collectionName} className="amd-input mt-4 h-12 w-full px-4 text-[14px] outline-none" />}
      <div className="mt-5 grid grid-cols-2 gap-3"><button type="button" onClick={onClose} className="amd-btn h-12 rounded-2xl border border-[rgba(120,160,210,.18)]">{copy.cancel}</button><button type="button" disabled={mode !== "delete" && !value.trim()} onClick={() => onSubmit(mode === "delete" ? undefined : value.trim())} className={`amd-btn h-12 rounded-2xl font-bold ${mode === "delete" ? "border border-rose-300/20 bg-rose-400/10 text-rose-200" : "amd-btn-primary"}`}>{mode === "delete" ? copy.delete : copy.save}</button></div>
    </section>
  </div>;
}

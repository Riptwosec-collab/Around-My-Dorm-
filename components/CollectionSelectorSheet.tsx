"use client";
import { Check, X } from "lucide-react";
import { getCopy } from "@/locales";
import type { Language, SavedCollection } from "@/types/app";
import type { Place } from "@/types/place";

export function CollectionSelectorSheet({ place, collections, language, onToggle, onClose }: {
  place: Place; collections: SavedCollection[]; language: Language; onToggle: (collectionId: string) => void; onClose: () => void;
}) {
  const copy = getCopy(language);
  return <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/65 backdrop-blur-sm"><button type="button" onClick={onClose} aria-label={copy.close} className="absolute inset-0" /><section role="dialog" aria-modal="true" className="amd-glass-strong relative w-full max-w-[520px] rounded-t-[30px] p-4 pb-[calc(18px+env(safe-area-inset-bottom))]"><div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/15" /><div className="flex items-center justify-between"><div><h3 className="text-[20px] font-bold">{copy.chooseCollections}</h3><p className="mt-1 truncate text-[11px] text-[var(--amd-text-2)]">{place.name}</p></div><button type="button" onClick={onClose} className="amd-btn grid h-11 w-11 place-items-center rounded-full"><X className="h-4 w-4" /></button></div><div className="mt-4 space-y-2">{collections.map((collection) => { const active = collection.placeIds.includes(place.id); return <button key={collection.id} type="button" role="checkbox" aria-checked={active} onClick={() => onToggle(collection.id)} className="amd-glass flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-left"><span className="text-xl">{collection.icon}</span><span className="flex-1 text-[13px] font-semibold">{collection.title}</span><span className={`grid h-7 w-7 place-items-center rounded-lg border ${active ? "border-[#00D9FF] bg-[#007AFF] text-white" : "border-[rgba(120,160,210,.2)] text-transparent"}`}><Check className="h-4 w-4" /></span></button>; })}</div><button type="button" onClick={onClose} className="amd-btn amd-btn-primary mt-5 h-12 w-full rounded-2xl font-bold">{copy.done}</button></section></div>;
}

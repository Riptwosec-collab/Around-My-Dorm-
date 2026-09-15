"use client";

import { History, Search, SlidersHorizontal, Sparkles } from "lucide-react";
import { CATEGORIES } from "@/data/categories";
import type { RelaxationId, RelaxationOption } from "@/lib/discovery/search-assist";
import type { Language } from "@/types/app";

export function SearchAssistPanel({
  language,
  query,
  focused,
  suggestions,
  recognizedLabels,
  relaxations,
  resultCount,
  onSearchSuggestion,
  onRelaxSearch,
}: {
  language: Language;
  query: string;
  focused: boolean;
  suggestions: string[];
  recognizedLabels: string[];
  relaxations: RelaxationOption[];
  resultCount: number;
  onSearchSuggestion: (value: string) => void;
  onRelaxSearch: (id: RelaxationId) => void;
}) {
  const hasQuery = query.trim().length > 0;
  const showSuggestions = focused && suggestions.length > 0;
  const showIntent = hasQuery && recognizedLabels.length > 0;
  const showRelaxations = hasQuery && resultCount === 0 && relaxations.length > 0;
  const categoryItems = CATEGORIES.filter((item) => item.id !== "all");

  return (
    <section data-testid="search-assist-panel" className="mt-2">
      <div data-testid="category-search-bar" className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0">
        <div className="flex w-max gap-2">
          {categoryItems.map((item) => {
            const active = query.trim() === item.name || recognizedLabels.includes(item.name);
            return (
              <button
                key={item.id}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onSearchSuggestion(item.name)}
                aria-pressed={active}
                className={`amd-chip flex min-h-10 shrink-0 items-center gap-1.5 px-3 text-[10px] font-semibold ${active ? "amd-chip-active" : ""}`}
              >
                <span aria-hidden="true" className="text-[13px]">{item.icon}</span>
                <span>{item.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {(showSuggestions || showIntent || showRelaxations) && (
        <div className="amd-glass amd-card mt-2 overflow-hidden p-3">
          {showIntent && (
            <div data-testid="search-intent-chips" className="flex flex-wrap gap-2">
              <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-[#00D9FF]/15 bg-[#00D9FF]/[0.05] px-2.5 text-[9px] font-semibold text-[#9feeff]">
                <Sparkles className="h-3 w-3" />
                {language === "en" ? "Understood" : "เข้าใจว่า"}
              </span>
              {recognizedLabels.map((label) => (
                <span key={label} className="amd-chip min-h-8 px-2.5 text-[9px] font-semibold">
                  {label}
                </span>
              ))}
            </div>
          )}

          {showSuggestions && (
            <div className={showIntent ? "mt-3 border-t border-white/[0.06] pt-3" : ""}>
              <div className="mb-2 flex items-center gap-1.5 text-[9px] font-semibold text-[var(--amd-text-3)]">
                {query.trim() ? <Search className="h-3.5 w-3.5" /> : <History className="h-3.5 w-3.5" />}
                {query.trim()
                  ? (language === "en" ? "Local search suggestions" : "คำค้นแนะนำจากข้อมูลในเครื่อง")
                  : (language === "en" ? "Recent and suggested searches" : "ค้นหาล่าสุดและคำค้นแนะนำ")}
              </div>
              <div className="grid gap-1.5">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onSearchSuggestion(suggestion)}
                    className="amd-btn flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-[10px] text-[var(--amd-text-2)]"
                  >
                    <Search className="h-3.5 w-3.5 shrink-0 text-[#00D9FF]" />
                    <span className="min-w-0 flex-1 truncate">{suggestion}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {showRelaxations && (
            <div data-testid="search-relaxations" className={(showSuggestions || showIntent) ? "mt-3 border-t border-white/[0.06] pt-3" : ""}>
              <div className="flex items-start gap-2">
                <SlidersHorizontal className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
                <div>
                  <p className="text-[10px] font-bold text-amber-100">
                    {language === "en" ? "No exact match" : "ยังไม่พบผลลัพธ์ที่ตรงทุกเงื่อนไข"}
                  </p>
                  <p className="mt-1 text-[9px] leading-4 text-[var(--amd-text-3)]">
                    {language === "en"
                      ? "Choose a constraint to relax. Nothing changes automatically."
                      : "เลือกผ่อนเงื่อนไขเองได้ ระบบจะไม่เปลี่ยนเงื่อนไขอัตโนมัติ"}
                  </p>
                </div>
              </div>
              <div className="mt-2 grid gap-2">
                {relaxations.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onRelaxSearch(option.id)}
                    className="amd-chip min-h-11 px-3 text-left"
                  >
                    <span className="block text-[10px] font-semibold text-[var(--amd-text)]">{option.label}</span>
                    <span className="mt-0.5 block text-[8px] leading-4 text-[var(--amd-text-3)]">{option.description}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

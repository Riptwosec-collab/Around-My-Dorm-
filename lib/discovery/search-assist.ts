import type { FilterState } from "@/components/FilterSheet";
import type { DiscoveryIntent } from "@/lib/discovery/query-intent";
import type { CategoryId } from "@/types/place";

export type SearchAssistLanguage = "th" | "en";

export type RelaxationId =
  | "clear_category"
  | "relax_budget"
  | "relax_walking"
  | "include_closed"
  | "include_chains";

export type RelaxationOption = {
  id: RelaxationId;
  label: string;
  description: string;
};

export type RelaxableDiscoveryState = {
  category: "all" | CategoryId;
  filters: FilterState;
  intent: DiscoveryIntent;
};

export type RelaxationOptionsInput = RelaxableDiscoveryState & {
  resultCount: number;
  language: SearchAssistLanguage;
};

const PRESETS: Record<SearchAssistLanguage, string[]> = {
  th: [
    "ข้าวไม่เกิน 100 เปิดอยู่",
    "คาเฟ่ภายใน 1 กม.",
    "ร้าน Local เปิดดึก",
    "ที่จอดรายเดือน",
    "ก๋วยเตี๋ยวเดินไม่เกิน 10 นาที",
    "หมูกระทะเปิดดึก",
  ],
  en: [
    "food under 100 open now",
    "cafe within 1 km",
    "late local food",
    "monthly parking",
    "noodles within 10 min walk",
    "mookata open late",
  ],
};

function normalizeQuery(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("th-TH")
    .replace(/\s+/g, " ")
    .trim();
}

function pushUnique(target: string[], value: string, seen: Set<string>, limit: number) {
  if (target.length >= limit) return;
  const normalized = normalizeQuery(value);
  if (!normalized || seen.has(normalized)) return;
  seen.add(normalized);
  target.push(value.trim());
}

export function addSearchHistoryEntry(
  history: readonly string[],
  query: string,
  limit = 6,
) {
  const clean = query.replace(/\s+/g, " ").trim();
  if (!clean || limit <= 0) return [...history].slice(0, Math.max(0, limit));

  const key = normalizeQuery(clean);
  const withoutDuplicate = history.filter((item) => normalizeQuery(item) !== key);
  return [clean, ...withoutDuplicate].slice(0, limit);
}

export function buildSearchSuggestions(
  query: string,
  history: readonly string[],
  language: SearchAssistLanguage,
  limit = 6,
) {
  if (limit <= 0) return [];
  const needle = normalizeQuery(query);
  const candidates = [...history, ...PRESETS[language]];
  const suggestions: string[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    if (needle && !normalizeQuery(candidate).includes(needle)) continue;
    pushUnique(suggestions, candidate, seen, limit);
    if (suggestions.length >= limit) break;
  }

  // If a partial query has too few literal matches, retain deterministic presets
  // as fallbacks rather than inventing completions.
  if (suggestions.length < limit) {
    for (const preset of PRESETS[language]) {
      pushUnique(suggestions, preset, seen, limit);
      if (suggestions.length >= limit) break;
    }
  }

  return suggestions;
}

function hasBudget(filters: FilterState, intent: DiscoveryIntent) {
  return filters.maxPrice != null || intent.filterPatch.maxPrice != null;
}

function hasWalkingLimit(filters: FilterState, intent: DiscoveryIntent) {
  return filters.maxWalkingMinutes != null || intent.filterPatch.maxWalkingMinutes != null;
}

function isCategoryConflict(category: "all" | CategoryId, intent: DiscoveryIntent) {
  return category !== "all"
    && intent.categoryIds.length > 0
    && !intent.categoryIds.includes(category);
}

function optionCopy(id: RelaxationId, language: SearchAssistLanguage): RelaxationOption {
  const copy: Record<RelaxationId, Record<SearchAssistLanguage, [string, string]>> = {
    clear_category: {
      th: ["ค้นหาทุกหมวด", "เอาตัวกรองหมวดที่ขัดกับคำค้นออก"],
      en: ["Search all categories", "Remove the category filter that conflicts with the query"],
    },
    relax_budget: {
      th: ["ผ่อนงบราคา", "เอาเพดานราคาปัจจุบันออก"],
      en: ["Relax budget", "Remove the current maximum-price constraint"],
    },
    relax_walking: {
      th: ["ผ่อนระยะเดิน", "เอาเพดานเวลาเดินปัจจุบันออก"],
      en: ["Relax walking limit", "Remove the current maximum walking-time constraint"],
    },
    include_closed: {
      th: ["รวมร้านที่ปิดอยู่", "เอาเงื่อนไขเปิดอยู่ตอนนี้ออก"],
      en: ["Include closed places", "Remove the open-now constraint"],
    },
    include_chains: {
      th: ["รวมร้าน Chain", "เอาเงื่อนไข LOCAL เท่านั้นออก"],
      en: ["Include chains", "Remove the local-only constraint"],
    },
  };
  const [label, description] = copy[id][language];
  return { id, label, description };
}

export function buildRelaxationOptions(input: RelaxationOptionsInput) {
  if (input.resultCount > 0) return [] as RelaxationOption[];

  const options: RelaxationOption[] = [];
  if (isCategoryConflict(input.category, input.intent)) {
    options.push(optionCopy("clear_category", input.language));
  }
  if (hasBudget(input.filters, input.intent)) {
    options.push(optionCopy("relax_budget", input.language));
  }
  if (hasWalkingLimit(input.filters, input.intent)) {
    options.push(optionCopy("relax_walking", input.language));
  }
  if (input.filters.onlyOpen || input.intent.filterPatch.onlyOpen === true) {
    options.push(optionCopy("include_closed", input.language));
  }
  if (input.filters.localOnly || input.intent.filterPatch.localOnly === true) {
    options.push(optionCopy("include_chains", input.language));
  }
  return options;
}

function cloneDiscoveryState(state: RelaxableDiscoveryState): RelaxableDiscoveryState {
  return {
    category: state.category,
    filters: {
      ...state.filters,
      priceLevels: [...state.filters.priceLevels],
    },
    intent: {
      ...state.intent,
      categoryIds: [...state.intent.categoryIds],
      filterPatch: { ...state.intent.filterPatch },
      recognizedLabels: [...state.intent.recognizedLabels],
    },
  };
}

export function applyDiscoveryRelaxation(
  state: RelaxableDiscoveryState,
  relaxationId: RelaxationId,
) {
  const next = cloneDiscoveryState(state);

  if (relaxationId === "clear_category") {
    next.category = "all";
  } else if (relaxationId === "relax_budget") {
    next.filters.maxPrice = null;
    delete next.intent.filterPatch.maxPrice;
  } else if (relaxationId === "relax_walking") {
    next.filters.maxWalkingMinutes = null;
    delete next.intent.filterPatch.maxWalkingMinutes;
  } else if (relaxationId === "include_closed") {
    next.filters.onlyOpen = false;
    delete next.intent.filterPatch.onlyOpen;
  } else if (relaxationId === "include_chains") {
    next.filters.localOnly = false;
    delete next.intent.filterPatch.localOnly;
  }

  return next;
}

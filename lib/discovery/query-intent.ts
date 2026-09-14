import type { FilterState } from "@/components/FilterSheet";
import type { CategoryId, SortMode } from "@/types/place";

export type DiscoveryIntent = {
  categoryIds: CategoryId[];
  filterPatch: Partial<FilterState>;
  suggestedSortMode: SortMode | null;
  freeText: string;
  recognizedLabels: string[];
};

type CategoryRule = {
  pattern: RegExp;
  categories: CategoryId[];
  label: string;
};

type FilterRule = {
  pattern: RegExp;
  patch: Partial<FilterState>;
  label: string;
};

type SortRule = {
  pattern: RegExp;
  mode: SortMode;
  label: string;
};

const CATEGORY_RULES: CategoryRule[] = [
  { pattern: /(กาแฟ|คาเฟ่|coffee|cafe)/giu, categories: ["cafe"], label: "คาเฟ่" },
  { pattern: /(ก๋วยเตี๋ยว|เส้น|noodle|noodles)/giu, categories: ["noodle"], label: "ก๋วยเตี๋ยว" },
  { pattern: /(หมูกระทะ|mookata|mu\s*kratha)/giu, categories: ["mookata"], label: "หมูกระทะ" },
  { pattern: /(ชาบู|hotpot|hot\s*pot)/giu, categories: ["hotpot"], label: "ชาบู" },
  { pattern: /(ข้าว|อาหาร|กินข้าว|food|meal)/giu, categories: ["food", "local_food", "thai_food", "isan_food"], label: "อาหาร" },
];

const FILTER_RULES: FilterRule[] = [
  { pattern: /(เปิดอยู่(?:ตอนนี้)?|เปิดตอนนี้|open\s*now)/giu, patch: { onlyOpen: true }, label: "เปิดอยู่" },
  { pattern: /(เปิดดึก|late\s*night|open\s*late)/giu, patch: { openLate: true }, label: "เปิดดึก" },
  { pattern: /(24\s*(?:ชม\.?|ชั่วโมง|hours?|hrs?))/giu, patch: { only24Hours: true }, label: "24 ชั่วโมง" },
  { pattern: /(มีที่จอด|ที่จอดรถ|parking)/giu, patch: { parking: true }, label: "มีที่จอด" },
  { pattern: /(นั่งทำงาน|work[-\s]?friendly|good\s*for\s*working)/giu, patch: { goodForWorking: true }, label: "นั่งทำงาน" },
  { pattern: /(wifi|wi-fi|ไวไฟ)/giu, patch: { wifi: true }, label: "Wi‑Fi" },
  { pattern: /(ปลั๊ก|power\s*outlets?|outlets?)/giu, patch: { powerOutlet: true }, label: "ปลั๊ก" },
  { pattern: /(แอร์|air\s*con(?:ditioning)?|air[-\s]?conditioned)/giu, patch: { airConditioned: true }, label: "แอร์" },
  { pattern: /(ร้าน\s*local|local\s*(?:shop|place)?|ร้านท้องถิ่น)/giu, patch: { localOnly: true }, label: "LOCAL" },
  { pattern: /(เดินถึง|walkable)/giu, patch: { maxWalkingMinutes: 10 }, label: "เดิน ≤10 นาที" },
  { pattern: /(เดิน\s*ไม่เกิน\s*10\s*นาที|walk\s*(?:within|under|<=|≤)\s*10\s*(?:min|mins|minutes))/giu, patch: { maxWalkingMinutes: 10 }, label: "เดิน ≤10 นาที" },
];

const SORT_RULES: SortRule[] = [
  { pattern: /(ใกล้สุด|nearest|closest)/giu, mode: "distanceAsc", label: "ใกล้สุด" },
  { pattern: /(ราคาถูก|cheapest|price\s*low)/giu, mode: "price", label: "ราคาถูก" },
];

const THAI_DIGITS: Record<string, string> = {
  "๐": "0",
  "๑": "1",
  "๒": "2",
  "๓": "3",
  "๔": "4",
  "๕": "5",
  "๖": "6",
  "๗": "7",
  "๘": "8",
  "๙": "9",
};

function normalizeThaiDigits(value: string) {
  return value.replace(/[๐-๙]/g, (digit) => THAI_DIGITS[digit] ?? digit);
}

function collapseWhitespace(value: string) {
  return value.replace(/[\s,]+/g, " ").trim();
}

function addUnique<T>(target: T[], values: readonly T[]) {
  for (const value of values) {
    if (!target.includes(value)) target.push(value);
  }
}

function consumeRule(
  source: string,
  pattern: RegExp,
  onRecognized: () => void,
) {
  pattern.lastIndex = 0;
  if (!pattern.test(source)) return source;
  pattern.lastIndex = 0;
  onRecognized();
  return source.replace(pattern, " ");
}

function parseBudget(source: string) {
  const patterns = [
    /(?:ไม่เกิน|ไม่เกินราคา|ราคาไม่เกิน|≤|<=|under)\s*฿?\s*(\d{1,5})(?:\s*(?:บาท|baht|thb))?/giu,
  ];

  let working = source;
  let maxPrice: number | null = null;
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    const matches = [...working.matchAll(pattern)];
    if (!matches.length) continue;
    for (const match of matches) {
      const parsed = Number(match[1]);
      if (Number.isFinite(parsed) && parsed >= 0) {
        maxPrice = maxPrice == null ? parsed : Math.min(maxPrice, parsed);
      }
    }
    working = working.replace(pattern, " ");
  }
  return { working, maxPrice };
}

export function parseDiscoveryQuery(query: string): DiscoveryIntent {
  let working = normalizeThaiDigits(query).normalize("NFKC");
  const categoryIds: CategoryId[] = [];
  const recognizedLabels: string[] = [];
  const filterPatch: Partial<FilterState> = {};
  let suggestedSortMode: SortMode | null = null;

  const budget = parseBudget(working);
  working = budget.working;
  if (budget.maxPrice != null) {
    filterPatch.maxPrice = budget.maxPrice;
    recognizedLabels.push(`≤ ฿${budget.maxPrice}`);
  }

  for (const rule of CATEGORY_RULES) {
    working = consumeRule(working, rule.pattern, () => {
      addUnique(categoryIds, rule.categories);
      addUnique(recognizedLabels, [rule.label]);
    });
  }

  for (const rule of FILTER_RULES) {
    working = consumeRule(working, rule.pattern, () => {
      Object.assign(filterPatch, rule.patch);
      addUnique(recognizedLabels, [rule.label]);
    });
  }

  for (const rule of SORT_RULES) {
    working = consumeRule(working, rule.pattern, () => {
      if (suggestedSortMode == null) suggestedSortMode = rule.mode;
      addUnique(recognizedLabels, [rule.label]);
    });
  }

  // A standalone Thai "ตอนนี้" expresses open-now intent in the approved
  // vocabulary. Consume it only after the longer open-now rules above.
  working = consumeRule(working, /ตอนนี้/giu, () => {
    filterPatch.onlyOpen = true;
    addUnique(recognizedLabels, ["เปิดอยู่"]);
  });

  // Unit words are part of a recognized price phrase even when separated by
  // punctuation/extra whitespace after normalization.
  if (budget.maxPrice != null) working = working.replace(/\b(?:baht|thb)\b|บาท/giu, " ");

  return {
    categoryIds,
    filterPatch,
    suggestedSortMode,
    freeText: collapseWhitespace(working),
    recognizedLabels,
  };
}

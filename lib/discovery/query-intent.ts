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

/**
 * Category phrases are consumed before generic filters/free text. Keep the
 * more specific phrases first so queries such as "ที่จอดรายเดือน" do not get
 * reduced to the generic parking filter.
 */
const CATEGORY_RULES: CategoryRule[] = [
  { pattern: /(ที่จอด(?:รถ)?รายเดือน|จอดรถรายเดือน|monthly\s*parking)/giu, categories: ["monthly_parking"], label: "ที่จอดรายเดือน" },
  { pattern: /(ร้านขายยา|ร้านยา|เภสัช|pharmacy|drugstore)/giu, categories: ["pharmacy"], label: "ร้านขายยา" },
  { pattern: /(โรงพยาบาล|hospital)/giu, categories: ["hospital"], label: "โรงพยาบาล" },
  { pattern: /(คลินิก|clinic|medical\s*clinic)/giu, categories: ["clinic"], label: "คลินิก" },
  { pattern: /(ซักผ้า|ซักรีด|laundry|laundromat)/giu, categories: ["laundry"], label: "ซักผ้า" },
  { pattern: /(ฟิตเนส|ยิม|fitness|gym)/giu, categories: ["fitness"], label: "ฟิตเนส" },
  { pattern: /(ร้านตัดผม|ตัดผมชาย|barber)/giu, categories: ["barber"], label: "ร้านตัดผม" },
  { pattern: /(ร้านเสริมสวย|เสริมสวย|beauty\s*salon|salon)/giu, categories: ["salon"], label: "เสริมสวย" },
  { pattern: /(ซูเปอร์มาร์เก็ต|ซุปเปอร์มาร์เก็ต|supermarket|grocery)/giu, categories: ["supermarket"], label: "ซูเปอร์มาร์เก็ต" },
  { pattern: /(ร้านสะดวกซื้อ|มินิมาร์ท|minimart|convenience\s*store|7\s*-?\s*eleven|เซเว่น)/giu, categories: ["convenience"], label: "ร้านสะดวกซื้อ" },
  { pattern: /(ตลาด|market)/giu, categories: ["market"], label: "ตลาด" },
  { pattern: /(ห้าง|community\s*mall|shopping\s*mall|ช้อปปิ้ง)/giu, categories: ["shopping"], label: "ช้อปปิ้ง" },
  { pattern: /(ส่งพัสดุ|ร้านพัสดุ|courier|parcel)/giu, categories: ["parcel"], label: "พัสดุ" },
  { pattern: /(ไปรษณีย์|post\s*office)/giu, categories: ["post_office"], label: "ไปรษณีย์" },
  { pattern: /(ถ่ายเอกสาร|ร้านปริ้น|ร้านพิมพ์|copy\s*shop|print\s*shop)/giu, categories: ["copy_print"], label: "ถ่ายเอกสาร/พิมพ์" },
  { pattern: /(ซ่อมมือถือ|ซ่อมโทรศัพท์|mobile\s*repair|phone\s*repair)/giu, categories: ["mobile_repair"], label: "ซ่อมมือถือ" },
  { pattern: /(ซ่อมคอม|ซ่อมคอมพิวเตอร์|computer\s*repair|pc\s*repair)/giu, categories: ["computer_repair"], label: "ซ่อมคอม" },
  { pattern: /(ซ่อมรถ|อู่รถ|car\s*repair|auto\s*repair)/giu, categories: ["auto_repair"], label: "ซ่อมรถ" },
  { pattern: /(ร้านยาง|ยางรถ|tire\s*shop|tyre\s*shop)/giu, categories: ["tire_shop"], label: "ร้านยาง" },
  { pattern: /(ปั๊มน้ำมัน|สถานีบริการน้ำมัน|gas\s*station|petrol\s*station)/giu, categories: ["gas_station"], label: "ปั๊มน้ำมัน" },
  { pattern: /(ev\s*charger|ชาร์จรถไฟฟ้า|สถานีชาร์จ)/giu, categories: ["ev_charger"], label: "EV Charger" },
  { pattern: /(ตู้\s*atm|\batm\b)/giu, categories: ["atm"], label: "ATM" },
  { pattern: /(ธนาคาร|bank)/giu, categories: ["bank"], label: "ธนาคาร" },
  { pattern: /(ร้านสัตว์เลี้ยง|pet\s*shop|pet\s*store)/giu, categories: ["pet_shop"], label: "ร้านสัตว์เลี้ยง" },
  { pattern: /(สัตวแพทย์|คลินิกสัตว์|vet|veterinary)/giu, categories: ["vet"], label: "สัตวแพทย์" },
  { pattern: /(กาแฟ|คาเฟ่|coffee|cafe)/giu, categories: ["cafe"], label: "คาเฟ่" },
  { pattern: /(ก๋วยเตี๋ยว|noodle|noodles)/giu, categories: ["noodle"], label: "ก๋วยเตี๋ยว" },
  { pattern: /(ราเมง|ramen)/giu, categories: ["japanese"], label: "ราเมง" },
  { pattern: /(อาหารญี่ปุ่น|ญี่ปุ่น|ซูชิ|japanese|sushi)/giu, categories: ["japanese"], label: "อาหารญี่ปุ่น" },
  { pattern: /(อาหารเกาหลี|เกาหลี|korean)/giu, categories: ["korean_food"], label: "อาหารเกาหลี" },
  { pattern: /(อาหารเวียดนาม|เวียดนาม|แหนมเนือง|vietnamese)/giu, categories: ["vietnamese_food"], label: "อาหารเวียดนาม" },
  { pattern: /(อาหารจีน|จีน|chinese)/giu, categories: ["chinese_food"], label: "อาหารจีน" },
  { pattern: /(หมูกระทะ|มูกะทะ|จิ้มจุ่ม|mookata|mu\s*kratha)/giu, categories: ["mookata"], label: "หมูกระทะ/จิ้มจุ่ม" },
  { pattern: /(ชาบู|สุกี้|hotpot|hot\s*pot)/giu, categories: ["hotpot"], label: "ชาบู/สุกี้" },
  { pattern: /(ปิ้งย่าง|barbecue|\bbbq\b)/giu, categories: ["bbq"], label: "ปิ้งย่าง" },
  { pattern: /(อาหารอีสาน|ส้มตำ|ลาบ|อีสาน|isan)/giu, categories: ["isan_food"], label: "อาหารอีสาน" },
  { pattern: /(อาหารไทย|thai\s*food)/giu, categories: ["thai_food"], label: "อาหารไทย" },
  { pattern: /(อาหารตามสั่ง|อาหารจานเดียว|ตามสั่ง|local\s*food)/giu, categories: ["local_food"], label: "อาหารตามสั่ง" },
  { pattern: /(ร้านดึก|ร้านกลางคืน|night\s*food)/giu, categories: ["night_food"], label: "ร้านดึก" },
  { pattern: /(บาร์|ร้านนั่งชิล|bar\b)/giu, categories: ["bar"], label: "บาร์" },
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

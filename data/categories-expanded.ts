import {
  CATEGORIES as BASE_CATEGORIES,
  type Category,
} from "./categories";

const EXPANSION_CATEGORIES: Category[] = [
  { id: "korean_food", name: "อาหารเกาหลี", icon: "🥘", googleTypes: ["restaurant"] },
  { id: "vietnamese_food", name: "อาหารเวียดนาม", icon: "🥢", googleTypes: ["restaurant"] },
  { id: "hotpot", name: "สุกี้ / ชาบู / หม้อไฟ", icon: "🍲", googleTypes: ["restaurant"] },
  { id: "bbq", name: "BBQ / ปิ้งย่าง", icon: "🥩", googleTypes: ["restaurant"] },
  { id: "chinese_food", name: "อาหารจีน", icon: "🥟", googleTypes: ["restaurant"] },
  { id: "shopping", name: "ห้าง / Community Mall", icon: "🏬", googleTypes: ["shopping_mall"] },
  { id: "night_food", name: "ร้านกลางคืน", icon: "🌙", googleTypes: ["restaurant"] },
];

export const CATEGORIES: Category[] = [
  ...BASE_CATEGORIES,
  ...EXPANSION_CATEGORIES,
];

export const CATEGORY_MAP = Object.fromEntries(
  CATEGORIES.map((category) => [category.id, category]),
) as Record<string, Category>;

export type { Category };

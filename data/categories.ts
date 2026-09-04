import type { CategoryId } from "@/types/place";

export type Category = {
  id: "all" | CategoryId;
  name: string;
  icon: string;
  googleTypes: string[];
};

export const CATEGORIES: Category[] = [
  { id: "all", name: "ทั้งหมด", icon: "✨", googleTypes: [] },
  { id: "food", name: "ร้านอาหาร", icon: "🍜", googleTypes: ["restaurant"] },
  { id: "local_food", name: "ร้าน Local", icon: "🍚", googleTypes: ["restaurant"] },
  { id: "noodle", name: "ก๋วยเตี๋ยว", icon: "🍜", googleTypes: ["restaurant"] },
  { id: "thai_food", name: "อาหารไทย", icon: "🍛", googleTypes: ["thai_restaurant", "restaurant"] },
  { id: "isan_food", name: "อาหารอีสาน", icon: "🌶️", googleTypes: ["restaurant"] },
  { id: "mookata", name: "หมูกระทะ / จิ้มจุ่ม", icon: "🥩", googleTypes: ["restaurant"] },
  { id: "japanese", name: "อาหารญี่ปุ่น", icon: "🍱", googleTypes: ["japanese_restaurant", "restaurant"] },
  { id: "cafe", name: "คาเฟ่ / กาแฟ", icon: "☕", googleTypes: ["cafe", "coffee_shop"] },
  { id: "bar", name: "Bar / ร้านนั่งชิล", icon: "🍸", googleTypes: ["bar"] },
  { id: "convenience", name: "ร้านสะดวกซื้อ", icon: "🛒", googleTypes: ["convenience_store"] },
  { id: "supermarket", name: "Supermarket", icon: "🛍️", googleTypes: ["supermarket"] },
  { id: "pharmacy", name: "ร้านขายยา", icon: "💊", googleTypes: ["pharmacy"] },
  { id: "laundry", name: "ร้านซักผ้า", icon: "🧺", googleTypes: ["laundry"] },
  { id: "salon", name: "ร้านทำผม", icon: "✂️", googleTypes: ["hair_salon", "beauty_salon"] },
  { id: "fitness", name: "Fitness", icon: "🏋️", googleTypes: ["gym"] },
  { id: "service", name: "บริการ", icon: "🛠️", googleTypes: [] },
  { id: "parking", name: "ที่จอดรถ", icon: "🚗", googleTypes: ["parking"] },
  { id: "other", name: "อื่น ๆ", icon: "📍", googleTypes: [] },
];

export const CATEGORY_MAP = Object.fromEntries(
  CATEGORIES.map((category) => [category.id, category]),
) as Record<string, Category>;

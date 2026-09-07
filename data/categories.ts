import type { CategoryId } from "@/types/place";

export type Category = {
  id: "all" | CategoryId;
  name: string;
  icon: string;
  googleTypes: string[];
};

export const CATEGORIES: Category[] = [
  { id: "all", name: "ทั้งหมด", icon: "✨", googleTypes: [] },
  { id: "food", name: "อาหาร", icon: "🍽️", googleTypes: ["restaurant"] },
  { id: "local_food", name: "อาหารตามสั่ง / Local", icon: "🍳", googleTypes: ["restaurant"] },
  { id: "noodle", name: "ก๋วยเตี๋ยว", icon: "🍜", googleTypes: ["restaurant"] },
  { id: "thai_food", name: "อาหารไทย", icon: "🍛", googleTypes: ["restaurant"] },
  { id: "isan_food", name: "อาหารอีสาน", icon: "🌶️", googleTypes: ["restaurant"] },
  { id: "mookata", name: "หมูกระทะ / จิ้มจุ่ม", icon: "🥩", googleTypes: ["restaurant"] },
  { id: "japanese", name: "อาหารญี่ปุ่น / ราเมง", icon: "🍱", googleTypes: ["japanese_restaurant", "restaurant"] },
  { id: "korean_food", name: "อาหารเกาหลี", icon: "🥘", googleTypes: ["korean_restaurant", "restaurant"] },
  { id: "vietnamese_food", name: "อาหารเวียดนาม", icon: "🥬", googleTypes: ["vietnamese_restaurant", "restaurant"] },
  { id: "hotpot", name: "ชาบู / Hotpot", icon: "🍲", googleTypes: ["restaurant"] },
  { id: "bbq", name: "BBQ", icon: "🔥", googleTypes: ["barbecue_restaurant", "restaurant"] },
  { id: "chinese_food", name: "อาหารจีน", icon: "🥟", googleTypes: ["chinese_restaurant", "restaurant"] },
  { id: "night_food", name: "ร้านดึก", icon: "🌙", googleTypes: ["restaurant"] },
  { id: "cafe", name: "คาเฟ่", icon: "☕", googleTypes: ["cafe", "coffee_shop"] },
  { id: "bar", name: "บาร์ / ร้านนั่งชิล", icon: "🍸", googleTypes: ["bar"] },
  { id: "convenience", name: "มินิมาร์ท", icon: "🏪", googleTypes: ["convenience_store"] },
  { id: "supermarket", name: "ซูเปอร์มาร์เก็ต", icon: "🛒", googleTypes: ["supermarket"] },
  { id: "shopping", name: "ช้อปปิ้ง", icon: "🛍️", googleTypes: ["shopping_mall"] },
  { id: "market", name: "ตลาด", icon: "🧺", googleTypes: ["market"] },
  { id: "pharmacy", name: "ร้านขายยา", icon: "💊", googleTypes: ["pharmacy"] },
  { id: "clinic", name: "คลินิก", icon: "🩺", googleTypes: ["doctor"] },
  { id: "hospital", name: "โรงพยาบาล", icon: "🏥", googleTypes: ["hospital"] },
  { id: "laundry", name: "ซักรีด / ซักผ้า", icon: "🧺", googleTypes: ["laundry"] },
  { id: "barber", name: "ร้านตัดผม", icon: "💈", googleTypes: ["hair_salon"] },
  { id: "salon", name: "เสริมสวย", icon: "✂️", googleTypes: ["beauty_salon", "hair_salon"] },
  { id: "fitness", name: "ฟิตเนส", icon: "🏋️", googleTypes: ["gym"] },
  { id: "hardware", name: "ฮาร์ดแวร์ / ของใช้", icon: "🧰", googleTypes: ["hardware_store"] },
  { id: "mobile_repair", name: "ซ่อมมือถือ", icon: "📱", googleTypes: [] },
  { id: "computer_repair", name: "ซ่อมคอม", icon: "💻", googleTypes: [] },
  { id: "auto_repair", name: "ซ่อมรถ", icon: "🔧", googleTypes: ["car_repair"] },
  { id: "tire_shop", name: "ยางรถ", icon: "🛞", googleTypes: [] },
  { id: "gas_station", name: "ปั๊มน้ำมัน", icon: "⛽", googleTypes: ["gas_station"] },
  { id: "ev_charger", name: "EV Charger", icon: "⚡", googleTypes: ["electric_vehicle_charging_station"] },
  { id: "atm", name: "ATM", icon: "🏧", googleTypes: ["atm"] },
  { id: "bank", name: "ธนาคาร", icon: "🏦", googleTypes: ["bank"] },
  { id: "topup", name: "เติมเงิน", icon: "💳", googleTypes: [] },
  { id: "parcel", name: "พัสดุ / ขนส่ง", icon: "📦", googleTypes: [] },
  { id: "post_office", name: "ไปรษณีย์", icon: "📮", googleTypes: ["post_office"] },
  { id: "copy_print", name: "ถ่ายเอกสาร / พิมพ์", icon: "🖨️", googleTypes: [] },
  { id: "motorcycle_rental", name: "เช่ามอเตอร์ไซค์", icon: "🛵", googleTypes: [] },
  { id: "parking", name: "ที่จอดรถ", icon: "🅿️", googleTypes: ["parking"] },
  { id: "monthly_parking", name: "ที่จอดรถรายเดือน", icon: "🚗", googleTypes: ["parking"] },
  { id: "pet_shop", name: "ร้านสัตว์เลี้ยง", icon: "🐾", googleTypes: ["pet_store"] },
  { id: "vet", name: "สัตวแพทย์", icon: "🐶", googleTypes: ["veterinary_care"] },
  { id: "water", name: "น้ำดื่ม", icon: "💧", googleTypes: [] },
  { id: "dorm_supplies", name: "ของใช้หอ", icon: "🧻", googleTypes: [] },
  { id: "service", name: "บริการ", icon: "💼", googleTypes: [] },
  { id: "other", name: "อื่น ๆ", icon: "📍", googleTypes: [] },
];

export const CATEGORY_MAP = Object.fromEntries(
  CATEGORIES.map((category) => [category.id, category]),
) as Record<string, Category>;

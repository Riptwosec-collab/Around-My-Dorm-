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

  { id: "market", name: "ตลาด", icon: "🥬", googleTypes: ["market"] },
  { id: "clinic", name: "คลินิก", icon: "🩺", googleTypes: ["medical_clinic"] },
  { id: "hospital", name: "โรงพยาบาล", icon: "🏥", googleTypes: ["hospital"] },
  { id: "barber", name: "Barber", icon: "💈", googleTypes: ["barber_shop", "hair_salon"] },
  { id: "hardware", name: "Hardware", icon: "🔧", googleTypes: ["hardware_store"] },
  { id: "mobile_repair", name: "ซ่อมมือถือ", icon: "📱", googleTypes: ["electronics_store"] },
  { id: "computer_repair", name: "ซ่อมคอม", icon: "💻", googleTypes: ["electronics_store"] },
  { id: "auto_repair", name: "ซ่อมรถ", icon: "🛠️", googleTypes: ["car_repair"] },
  { id: "tire_shop", name: "ร้านยาง", icon: "🛞", googleTypes: ["tire_shop"] },
  { id: "gas_station", name: "ปั๊มน้ำมัน", icon: "⛽", googleTypes: ["gas_station"] },
  { id: "ev_charger", name: "EV Charger", icon: "⚡", googleTypes: ["electric_vehicle_charging_station"] },
  { id: "atm", name: "ATM", icon: "🏧", googleTypes: ["atm"] },
  { id: "bank", name: "ธนาคาร", icon: "🏦", googleTypes: ["bank"] },
  { id: "topup", name: "ตู้เติมเงิน", icon: "💳", googleTypes: [] },
  { id: "parcel", name: "ส่งพัสดุ", icon: "📦", googleTypes: ["courier_service"] },
  { id: "post_office", name: "ไปรษณีย์", icon: "📮", googleTypes: ["post_office"] },
  { id: "copy_print", name: "ถ่ายเอกสาร / Print", icon: "🖨️", googleTypes: ["copy_shop"] },
  { id: "motorcycle_rental", name: "เช่ามอเตอร์ไซค์", icon: "🏍️", googleTypes: ["motorcycle_rental_agency"] },
  { id: "monthly_parking", name: "ที่จอดรายเดือน", icon: "🅿️", googleTypes: ["parking"] },
  { id: "pet_shop", name: "Pet Shop", icon: "🐾", googleTypes: ["pet_store"] },
  { id: "vet", name: "Vet", icon: "🐶", googleTypes: ["veterinary_care"] },
  { id: "water", name: "ร้านน้ำดื่ม", icon: "💧", googleTypes: [] },
  { id: "dorm_supplies", name: "ของใช้หอพัก", icon: "🧴", googleTypes: ["home_goods_store"] },
];

const seen = new Set<string>();
export const CATEGORIES: Category[] = [...BASE_CATEGORIES, ...EXPANSION_CATEGORIES].filter((category) => {
  if (seen.has(category.id)) return false;
  seen.add(category.id);
  return true;
});

export const CATEGORY_MAP = Object.fromEntries(
  CATEGORIES.map((category) => [category.id, category]),
) as Record<string, Category>;

export type { Category };

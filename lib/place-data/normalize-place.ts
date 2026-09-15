import type { CategoryId, Place } from "@/types/place";

function compactNullable(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function uniqueStrings(values: readonly string[] | null | undefined): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values ?? []) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

type CategoryInferenceRule = {
  id: CategoryId;
  pattern: RegExp;
};

/**
 * Add secondary categories only when existing place metadata says so
 * explicitly. The primary category is never replaced and unknown facts are not
 * guessed from weak signals such as price, area or popularity.
 */
const CATEGORY_INFERENCE_RULES: CategoryInferenceRule[] = [
  { id: "local_food", pattern: /(อาหารตามสั่ง|อาหารจานเดียว|ตามสั่ง|local\s*food)/iu },
  { id: "noodle", pattern: /(ก๋วยเตี๋ยว|บะหมี่|noodle)/iu },
  { id: "thai_food", pattern: /(อาหารไทย|thai\s*food)/iu },
  { id: "isan_food", pattern: /(อาหารอีสาน|ส้มตำ|ลาบ|น้ำตก|อีสาน|isan)/iu },
  { id: "mookata", pattern: /(หมูกระทะ|มูกะทะ|จิ้มจุ่ม|mookata|mu\s*kratha)/iu },
  { id: "japanese", pattern: /(อาหารญี่ปุ่น|ญี่ปุ่น|ซูชิ|ราเมง|japanese|sushi|ramen)/iu },
  { id: "korean_food", pattern: /(อาหารเกาหลี|เกาหลี|korean)/iu },
  { id: "vietnamese_food", pattern: /(อาหารเวียดนาม|เวียดนาม|แหนมเนือง|vietnamese)/iu },
  { id: "hotpot", pattern: /(ชาบู|สุกี้|hotpot|hot\s*pot)/iu },
  { id: "bbq", pattern: /(ปิ้งย่าง|barbecue|\bbbq\b)/iu },
  { id: "chinese_food", pattern: /(อาหารจีน|chinese)/iu },
  { id: "night_food", pattern: /(ร้านดึก|ร้านกลางคืน|night\s*food)/iu },
  { id: "cafe", pattern: /(คาเฟ่|กาแฟ|coffee|cafe)/iu },
  { id: "bar", pattern: /(บาร์|ร้านนั่งชิล|\bbar\b)/iu },
  { id: "convenience", pattern: /(ร้านสะดวกซื้อ|มินิมาร์ท|minimart|convenience|7\s*-?\s*eleven|เซเว่น)/iu },
  { id: "supermarket", pattern: /(ซูเปอร์มาร์เก็ต|ซุปเปอร์มาร์เก็ต|supermarket|grocery)/iu },
  { id: "shopping", pattern: /(ห้าง|community\s*mall|shopping\s*mall)/iu },
  { id: "market", pattern: /(ตลาด|market)/iu },
  { id: "pharmacy", pattern: /(ร้านขายยา|ร้านยา|เภสัช|pharmacy|drugstore)/iu },
  { id: "clinic", pattern: /(คลินิก|clinic|medical\s*clinic)/iu },
  { id: "hospital", pattern: /(โรงพยาบาล|hospital)/iu },
  { id: "laundry", pattern: /(ซักผ้า|ซักรีด|laundry|laundromat)/iu },
  { id: "barber", pattern: /(ร้านตัดผม|ตัดผมชาย|barber)/iu },
  { id: "salon", pattern: /(ร้านเสริมสวย|เสริมสวย|beauty\s*salon|salon)/iu },
  { id: "fitness", pattern: /(ฟิตเนส|ยิม|fitness|\bgym\b)/iu },
  { id: "hardware", pattern: /(ฮาร์ดแวร์|hardware\s*store)/iu },
  { id: "mobile_repair", pattern: /(ซ่อมมือถือ|ซ่อมโทรศัพท์|mobile\s*repair|phone\s*repair)/iu },
  { id: "computer_repair", pattern: /(ซ่อมคอม|ซ่อมคอมพิวเตอร์|computer\s*repair|pc\s*repair)/iu },
  { id: "auto_repair", pattern: /(ซ่อมรถ|อู่รถ|car\s*repair|auto\s*repair)/iu },
  { id: "tire_shop", pattern: /(ร้านยาง|ยางรถ|tire\s*shop|tyre\s*shop)/iu },
  { id: "gas_station", pattern: /(ปั๊มน้ำมัน|สถานีบริการน้ำมัน|gas\s*station|petrol\s*station)/iu },
  { id: "ev_charger", pattern: /(ev\s*charger|ชาร์จรถไฟฟ้า|สถานีชาร์จ)/iu },
  { id: "atm", pattern: /(ตู้\s*atm|\batm\b)/iu },
  { id: "bank", pattern: /(ธนาคาร|\bbank\b)/iu },
  { id: "parcel", pattern: /(ส่งพัสดุ|ร้านพัสดุ|courier|parcel)/iu },
  { id: "post_office", pattern: /(ไปรษณีย์|post\s*office)/iu },
  { id: "copy_print", pattern: /(ถ่ายเอกสาร|ร้านปริ้น|ร้านพิมพ์|copy\s*shop|print\s*shop)/iu },
  { id: "monthly_parking", pattern: /(ที่จอด(?:รถ)?รายเดือน|จอดรถรายเดือน|monthly\s*parking)/iu },
  { id: "parking", pattern: /(ที่จอดรถ|parking)/iu },
  { id: "pet_shop", pattern: /(ร้านสัตว์เลี้ยง|pet\s*shop|pet\s*store)/iu },
  { id: "vet", pattern: /(สัตวแพทย์|คลินิกสัตว์|veterinary|\bvet\b)/iu },
];

function categoryEvidenceText(place: Place) {
  return [
    place.name,
    place.nameEn,
    place.subcategory,
    place.shortDescription,
    place.description,
    ...(place.tags ?? []),
    ...(place.popularMenus ?? []),
    ...(place.recommendedItems ?? []),
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .normalize("NFKC");
}

function normalizeCategories(place: Place): CategoryId[] {
  const categories = new Set<CategoryId>([place.category, ...(place.categories ?? [])]);
  const evidence = categoryEvidenceText(place);
  for (const rule of CATEGORY_INFERENCE_RULES) {
    if (rule.pattern.test(evidence)) categories.add(rule.id);
  }
  return Array.from(categories);
}

export function normalizePlace(place: Place): Place {
  return {
    ...place,
    name: place.name.trim(),
    nameEn: compactNullable(place.nameEn),
    googlePlaceId: compactNullable(place.googlePlaceId),
    address: compactNullable(place.address),
    soi: compactNullable(place.soi),
    phone: compactNullable(place.phone),
    line: compactNullable(place.line),
    facebook: compactNullable(place.facebook),
    instagram: compactNullable(place.instagram),
    website: compactNullable(place.website),
    googleMapsUrl: compactNullable(place.googleMapsUrl),
    image: compactNullable(place.image),
    priceText: compactNullable(place.priceText),
    notes: compactNullable(place.notes),
    categories: normalizeCategories(place),
    tags: uniqueStrings(place.tags),
    images: uniqueStrings(place.images),
    popularMenus: uniqueStrings(place.popularMenus),
    recommendedItems: uniqueStrings(place.recommendedItems),
    paymentMethods: uniqueStrings(place.paymentMethods),
    deliveryApps: uniqueStrings(place.deliveryApps),
    source: uniqueStrings(place.source),
    galleryImages: place.galleryImages ? uniqueStrings(place.galleryImages) : place.galleryImages,
    menuImages: place.menuImages ? uniqueStrings(place.menuImages) : place.menuImages,
    parkingImages: place.parkingImages ? uniqueStrings(place.parkingImages) : place.parkingImages,
  };
}

export function normalizePlaces(places: Place[]): Place[] {
  return places.map(normalizePlace);
}

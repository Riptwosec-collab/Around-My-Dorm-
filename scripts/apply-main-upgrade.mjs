import fs from "node:fs";

const path = "components/AroundMyDormApp.tsx";
let source = fs.readFileSync(path, "utf8");

function replaceOnce(from, to, label) {
  if (!source.includes(from)) {
    throw new Error(`Patch target not found: ${label}`);
  }
  source = source.replace(from, to);
}

replaceOnce(
`  dedupePlaces,
  formatDistance,
  getOpenStatus,
  googleMapsDirectionsUrl,
  matchesSearch,
  normalizeText,
  withDistance,`,
`  calculateLocalScore,
  dedupePlaces,
  formatDistance,
  getOpenStatus,
  getPlacePriceMax,
  googleMapsDirectionsUrl,
  matchesSearch,
  normalizeText,
  withDistance,`,
"place-utils imports",
);

replaceOnce(
`const RADII = [
  { label: "500 ม.", value: 500 },
  { label: "1 กม.", value: 1000 },
  { label: "2 กม.", value: 2000 },
  { label: "3 กม.", value: 3000 },
  { label: "5 กม.", value: 5000 },
];`,
`const RADII = [
  { label: "500 ม.", value: 500 },
  { label: "1 กม.", value: 1000 },
  { label: "2 กม.", value: 2000 },
  { label: "3 กม.", value: 3000 },
  { label: "5 กม.", value: 5000 },
  { label: "10 กม.", value: 10000 },
];`,
"radius 10 km",
);

replaceOnce(
`  japanese: "#a78bfa",
  cafe: "#c084fc",`,
`  japanese: "#a78bfa",
  korean_food: "#f472b6",
  vietnamese_food: "#fb923c",
  hotpot: "#f97316",
  bbq: "#ef4444",
  chinese_food: "#f59e0b",
  night_food: "#6366f1",
  cafe: "#c084fc",`,
"marker food colors",
);

replaceOnce(
`  pharmacy: "#38bdf8",
  laundry: "#22d3ee",`,
`  pharmacy: "#38bdf8",
  clinic: "#0ea5e9",
  hospital: "#0284c7",
  laundry: "#22d3ee",`,
"marker health colors",
);

replaceOnce(
`  parking: "#2dd4bf",
  other: "#94a3b8",`,
`  parking: "#2dd4bf",
  monthly_parking: "#14b8a6",
  gas_station: "#f59e0b",
  ev_charger: "#22c55e",
  atm: "#64748b",
  bank: "#64748b",
  parcel: "#8b5cf6",
  other: "#94a3b8",`,
"marker daily-life colors",
);

replaceOnce(
`  { id: "local", label: "ร้าน Local" },
  { id: "late", label: "เปิดดึก" },`,
`  { id: "local", label: "ร้าน Local" },
  { id: "localScore", label: "Local Score" },
  { id: "late", label: "เปิดดึก" },`,
"local score sort option",
);

replaceOnce(
`const SMART_COLLECTIONS = [
  ["🍚", "กินง่ายทุกวัน", "local"],
  ["☕", "คาเฟ่น่านั่ง", "cafe"],
  ["🌙", "ของกินดึก", "late"],
  ["💸", "ร้านประหยัด", "cheap"],
  ["⭐", "ร้านคะแนนดี", "rating"],
  ["📍", "ใกล้หอที่สุด", "near"],
  ["🧑‍🎓", "เหมาะกับนักศึกษา", "student"],
  ["💻", "นั่งทำงานได้", "work"],
  ["🛒", "ซื้อของเข้าห้อง", "shopping"],
  ["💊", "สุขภาพและยา", "pharmacy"],
  ["🧺", "ซักผ้า", "laundry"],
  ["🏋️", "Fitness", "fitness"],
  ["🚗", "ที่จอดรถ", "parking"],
] as const;`,
`const SMART_COLLECTIONS = [
  ["🟢", "เปิดอยู่ตอนนี้", "open"],
  ["💸", "≤100 บาท", "cheap"],
  ["🚶", "เดิน ≤10 นาที", "walk"],
  ["🌙", "หิวตอนดึก", "late"],
  ["🍚", "Local", "local"],
  ["☕", "คาเฟ่", "cafe"],
  ["🍜", "อยากกินเส้น", "noodle"],
  ["🥩", "ปิ้งย่าง", "bbq"],
  ["🔵", "24 ชั่วโมง", "24h"],
  ["📦", "Delivery", "delivery"],
  ["🚗", "มีที่จอด", "hasParking"],
  ["⭐", "Local Pick", "localScore"],
  ["📍", "ใกล้หอที่สุด", "near"],
  ["💻", "นั่งทำงานได้", "work"],
  ["🛒", "ซื้อของเข้าห้อง", "shopping"],
  ["💊", "สุขภาพและยา", "pharmacy"],
  ["🧺", "ซักผ้า", "laundry"],
  ["🏋️", "Fitness", "fitness"],
  ["🅿️", "ที่จอดรายเดือน", "monthlyParking"],
] as const;`,
"smart collections",
);

replaceOnce(
`function activeFilterCount(filters: FilterState) {
  return (
    Object.entries(filters).filter(([key, value]) => key !== "priceLevels" && value === true).length +
    (filters.priceLevels.length ? 1 : 0)
  );
}`,
`function activeFilterCount(filters: FilterState) {
  const booleans = Object.entries(filters).filter(([, value]) => value === true).length;
  return booleans
    + (filters.priceLevels.length ? 1 : 0)
    + (filters.maxPrice != null ? 1 : 0)
    + (filters.maxWalkingMinutes != null ? 1 : 0)
    + (filters.area ? 1 : 0);
}`,
"active filter count",
);

replaceOnce(
`function passesFilters(place: Place, filters: FilterState) {
  const status = getOpenStatus(place);
  if (filters.onlyOpen && status.isOpen !== true) return false;
  if (filters.only24Hours && !place.is24Hours) return false;
  if (filters.openLate && place.openLate !== true) return false;
  if (filters.parking && place.parking.available !== true) return false;
  if (filters.wifi && place.wifi !== true) return false;
  if (filters.powerOutlet && place.powerOutlet !== true) return false;
  if (filters.airConditioned && place.airConditioned !== true) return false;
  if (filters.delivery && place.delivery !== true) return false;
  if (filters.takeaway && place.takeaway !== true) return false;
  if (filters.goodForWorking && place.goodForWorking !== true) return false;
  if (filters.studentFriendly && place.studentFriendly !== true) return false;
  if (filters.verifiedOnly && !place.verified) return false;
  if (filters.priceLevels.length && (place.priceLevel == null || !filters.priceLevels.includes(place.priceLevel))) return false;
  return true;
}`,
`function passesFilters(place: Place, filters: FilterState) {
  const status = getOpenStatus(place);
  if (filters.onlyOpen && status.isOpen !== true) return false;
  if (filters.only24Hours && !place.is24Hours) return false;
  if (filters.openLate && place.openLate !== true && !place.is24Hours) return false;
  if (filters.parking && place.parking.available !== true && !place.parkingDetails) return false;
  if (filters.wifi && place.wifi !== true) return false;
  if (filters.powerOutlet && place.powerOutlet !== true) return false;
  if (filters.airConditioned && place.airConditioned !== true) return false;
  if (filters.delivery && place.delivery !== true && !place.deliveryPlatforms?.length) return false;
  if (filters.takeaway && place.takeaway !== true) return false;
  if (filters.goodForWorking && place.goodForWorking !== true) return false;
  if (filters.studentFriendly && place.studentFriendly !== true) return false;
  if (filters.verifiedOnly && !place.verified) return false;
  if (filters.localOnly && !(place.placeType === "local" || place.placeType === "independent" || place.localFavorite)) return false;
  if (filters.area && !normalizeText(place.area).includes(normalizeText(filters.area))) return false;
  if (filters.maxPrice != null) {
    const price = getPlacePriceMax(place);
    if (price == null || price > filters.maxPrice) return false;
  }
  if (filters.maxWalkingMinutes != null && (place.walkingMinutes == null || place.walkingMinutes > filters.maxWalkingMinutes)) return false;
  if (filters.priceLevels.length && (place.priceLevel == null || !filters.priceLevels.includes(place.priceLevel))) return false;
  return true;
}`,
"multi-filter engine",
);

replaceOnce(
`    if (mode === "local") return Number(b.localFavorite) - Number(a.localFavorite);
    if (mode === "late") return Number(b.openLate === true) - Number(a.openLate === true);`,
`    if (mode === "local") return Number(b.placeType === "local" || b.placeType === "independent" || b.localFavorite) - Number(a.placeType === "local" || a.placeType === "independent" || a.localFavorite);
    if (mode === "localScore") return (calculateLocalScore(b) ?? -1) - (calculateLocalScore(a) ?? -1);
    if (mode === "late") return Number(b.openLate === true || b.is24Hours) - Number(a.openLate === true || a.is24Hours);`,
"sort local score",
);

replaceOnce(
`  function applyCollection(key: (typeof SMART_COLLECTIONS)[number][2]) {
    setFilters(EMPTY_FILTERS);
    setQuery("");
    setSortMode("recommended");
    if (key === "local") setCategory("local_food");
    if (key === "cafe") setCategory("cafe");
    if (key === "late") setFilters({ ...EMPTY_FILTERS, openLate: true });
    if (key === "cheap") setFilters({ ...EMPTY_FILTERS, priceLevels: [1] });
    if (key === "rating") setSortMode("rating");
    if (key === "near") setSortMode("distanceAsc");
    if (key === "student") setFilters({ ...EMPTY_FILTERS, studentFriendly: true });
    if (key === "work") setFilters({ ...EMPTY_FILTERS, goodForWorking: true });
    if (key === "shopping") setCategory("supermarket");
    if (key === "pharmacy") setCategory("pharmacy");
    if (key === "laundry") setCategory("laundry");
    if (key === "fitness") setCategory("fitness");
    if (key === "parking") setCategory("parking");
    changeTab("explore");
  }`,
`  function applyCollection(key: (typeof SMART_COLLECTIONS)[number][2]) {
    setFilters(EMPTY_FILTERS);
    setQuery("");
    setCategory("all");
    setSortMode("recommended");
    if (key === "open") setFilters({ ...EMPTY_FILTERS, onlyOpen: true });
    if (key === "cheap") setFilters({ ...EMPTY_FILTERS, maxPrice: 100 });
    if (key === "walk") setFilters({ ...EMPTY_FILTERS, maxWalkingMinutes: 10 });
    if (key === "local") setFilters({ ...EMPTY_FILTERS, localOnly: true });
    if (key === "cafe") setCategory("cafe");
    if (key === "noodle") setCategory("noodle");
    if (key === "bbq") setCategory("bbq");
    if (key === "late") setFilters({ ...EMPTY_FILTERS, onlyOpen: true, openLate: true });
    if (key === "24h") setFilters({ ...EMPTY_FILTERS, only24Hours: true });
    if (key === "delivery") setFilters({ ...EMPTY_FILTERS, delivery: true });
    if (key === "hasParking") setFilters({ ...EMPTY_FILTERS, parking: true });
    if (key === "localScore") setSortMode("localScore");
    if (key === "near") setSortMode("distanceAsc");
    if (key === "work") setFilters({ ...EMPTY_FILTERS, goodForWorking: true });
    if (key === "shopping") setCategory("supermarket");
    if (key === "pharmacy") setCategory("pharmacy");
    if (key === "laundry") setCategory("laundry");
    if (key === "fitness") setCategory("fitness");
    if (key === "monthlyParking") setCategory("monthly_parking");
    changeTab("explore");
  }`,
"smart collection actions",
);

replaceOnce(
`placeholder="ค้นหาชื่อร้าน หมวด เมนู Tag ซอย พื้นที่..."`,
`placeholder="ลองค้นหา ‘ข้าวไม่เกิน 70’ ‘ร้านเปิดตี 2’ ‘คาเฟ่นั่งทำงาน’..."`,
"natural search placeholder",
);

replaceOnce(
`<p className="text-[9px] font-black uppercase tracking-[0.18em] text-pink-300">SMART COLLECTIONS</p><h2 className="mt-1 text-lg font-black">เลือกตามชีวิตรอบหอ</h2>`,
`<p className="text-[9px] font-black uppercase tracking-[0.18em] text-pink-300">QUICK DISCOVERY</p><h2 className="mt-1 text-lg font-black">กินอะไรดีตอนนี้</h2>`,
"home discovery title",
);

replaceOnce(
`<p className="mt-1 text-[10px] text-white/38">ลองเพิ่มรัศมี เปลี่ยนหมวด หรือล้าง Filter</p>`,
`<p className="mt-1 text-[10px] text-white/38">ลองขยายรัศมี เปลี่ยนหมวด หรือล้าง Filter</p><div className="mt-4 flex justify-center gap-2"><button type="button" onClick={() => setRadiusMeters(5000)} className="min-h-11 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.08] px-3 text-[10px] font-black text-cyan-100">ขยายเป็น 5 กม.</button><button type="button" onClick={() => setFilters(EMPTY_FILTERS)} className="min-h-11 rounded-2xl border border-white/10 bg-white/[0.05] px-3 text-[10px] font-black">ล้างตัวกรอง</button></div>`,
"empty state actions",
);

fs.writeFileSync(path, source);
console.log("AroundMyDormApp.tsx product upgrade patch applied");

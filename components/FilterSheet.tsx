"use client";

import { RotateCcw, X } from "lucide-react";

export type FilterState = {
  onlyOpen: boolean;
  only24Hours: boolean;
  openLate: boolean;
  parking: boolean;
  wifi: boolean;
  powerOutlet: boolean;
  airConditioned: boolean;
  delivery: boolean;
  takeaway: boolean;
  goodForWorking: boolean;
  studentFriendly: boolean;
  verifiedOnly: boolean;
  localOnly: boolean;
  priceLevels: number[];
  maxPrice: number | null;
  maxWalkingMinutes: number | null;
  area: string;
};

export const EMPTY_FILTERS: FilterState = {
  onlyOpen: false,
  only24Hours: false,
  openLate: false,
  parking: false,
  wifi: false,
  powerOutlet: false,
  airConditioned: false,
  delivery: false,
  takeaway: false,
  goodForWorking: false,
  studentFriendly: false,
  verifiedOnly: false,
  localOnly: false,
  priceLevels: [],
  maxPrice: null,
  maxWalkingMinutes: null,
  area: "",
};

const AREAS = [
  "",
  "ลาดพร้าว 35",
  "ลาดพร้าว 41",
  "ภาวนา",
  "รัชดา 36",
  "หลังจันทรเกษม",
  "ลาดพร้าววังหิน",
  "โชคชัย 4",
  "นาคนิวาส",
  "ลาดพร้าว 71",
  "เสนานิคม",
];

function Toggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-11 rounded-2xl border px-3 py-2.5 text-[10px] font-bold transition ${active ? "border-cyan-300/30 bg-cyan-300/[0.12] text-cyan-100" : "border-white/[0.08] bg-white/[0.04] text-white/55"}`}
    >
      {label}
    </button>
  );
}

export function FilterSheet({
  value,
  onChange,
  onClose,
}: {
  value: FilterState;
  onChange: (next: FilterState) => void;
  onClose: () => void;
}) {
  const toggle = (key: keyof Pick<FilterState, "onlyOpen" | "only24Hours" | "openLate" | "parking" | "wifi" | "powerOutlet" | "airConditioned" | "delivery" | "takeaway" | "goodForWorking" | "studentFriendly" | "verifiedOnly" | "localOnly">) =>
    onChange({ ...value, [key]: !value[key] });

  const togglePrice = (level: number) =>
    onChange({
      ...value,
      priceLevels: value.priceLevels.includes(level)
        ? value.priceLevels.filter((x) => x !== level)
        : [...value.priceLevels, level],
    });

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/65 backdrop-blur-sm">
      <button type="button" aria-label="ปิดตัวกรอง" onClick={onClose} className="absolute inset-0" />
      <section className="relative max-h-[88dvh] w-full max-w-[520px] overflow-y-auto rounded-t-[34px] border border-white/10 bg-[#09121f]/98 px-4 pb-[calc(22px+env(safe-area-inset-bottom))] pt-3 shadow-2xl">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/15" />
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">SMART FILTER</p>
            <h3 className="mt-1 text-xl font-black">กรองร้าน</h3>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => onChange(EMPTY_FILTERS)} className="grid h-11 w-11 place-items-center rounded-full bg-white/[0.055]" aria-label="ล้างตัวกรอง"><RotateCcw className="h-4 w-4" /></button>
            <button type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-full bg-white/[0.055]" aria-label="ปิด"><X className="h-4 w-4" /></button>
          </div>
        </div>

        <div className="mt-5">
          <p className="mb-2 text-[10px] font-bold text-white/40">สถานะร้าน</p>
          <div className="grid grid-cols-3 gap-2">
            <Toggle label="เปิดอยู่ตอนนี้" active={value.onlyOpen} onClick={() => toggle("onlyOpen")} />
            <Toggle label="เปิด 24 ชม." active={value.only24Hours} onClick={() => toggle("only24Hours")} />
            <Toggle label="เปิดดึก" active={value.openLate} onClick={() => toggle("openLate")} />
          </div>
        </div>

        <div className="mt-5">
          <p className="mb-2 text-[10px] font-bold text-white/40">งบประมาณจริง</p>
          <div className="grid grid-cols-3 gap-2">
            {[70, 100, 200].map((price) => (
              <Toggle key={price} label={`≤ ${price} บาท`} active={value.maxPrice === price} onClick={() => onChange({ ...value, maxPrice: value.maxPrice === price ? null : price })} />
            ))}
          </div>
          <p className="mt-2 text-[9px] leading-4 text-white/30">ร้านที่ไม่มีข้อมูลราคาจะไม่ผ่านตัวกรองงบ เพื่อไม่เดาราคา</p>
        </div>

        <div className="mt-5">
          <p className="mb-2 text-[10px] font-bold text-white/40">ระยะเดิน</p>
          <div className="grid grid-cols-3 gap-2">
            {[5, 10, 15].map((minutes) => (
              <Toggle key={minutes} label={`เดิน ≤${minutes} นาที`} active={value.maxWalkingMinutes === minutes} onClick={() => onChange({ ...value, maxWalkingMinutes: value.maxWalkingMinutes === minutes ? null : minutes })} />
            ))}
          </div>
          <p className="mt-2 text-[9px] leading-4 text-white/30">ใช้เฉพาะเวลาเดินที่มีข้อมูล route จริง/ข้อมูลที่ยืนยัน ไม่สร้างเวลาจากระยะเส้นตรง</p>
        </div>

        <div className="mt-5">
          <p className="mb-2 text-[10px] font-bold text-white/40">ย่าน</p>
          <select
            aria-label="กรองตามย่าน"
            value={value.area}
            onChange={(event) => onChange({ ...value, area: event.target.value })}
            className="h-12 w-full rounded-2xl border border-white/[0.08] bg-[#0d1724] px-3 text-[11px] font-bold text-white/75 outline-none"
          >
            {AREAS.map((area) => <option key={area || "all"} value={area}>{area || "ทั้งหมด"}</option>)}
          </select>
        </div>

        <div className="mt-5">
          <p className="mb-2 text-[10px] font-bold text-white/40">ช่วงราคาเดิม</p>
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((level) => (
              <Toggle key={level} label={"฿".repeat(level)} active={value.priceLevels.includes(level)} onClick={() => togglePrice(level)} />
            ))}
          </div>
        </div>

        <div className="mt-5">
          <p className="mb-2 text-[10px] font-bold text-white/40">ประเภท / สิ่งอำนวยความสะดวก</p>
          <div className="grid grid-cols-2 gap-2">
            <Toggle label="Local" active={value.localOnly} onClick={() => toggle("localOnly")} />
            <Toggle label="มีที่จอดรถ" active={value.parking} onClick={() => toggle("parking")} />
            <Toggle label="มี Wi-Fi" active={value.wifi} onClick={() => toggle("wifi")} />
            <Toggle label="มีปลั๊ก" active={value.powerOutlet} onClick={() => toggle("powerOutlet")} />
            <Toggle label="มีแอร์" active={value.airConditioned} onClick={() => toggle("airConditioned")} />
            <Toggle label="Delivery" active={value.delivery} onClick={() => toggle("delivery")} />
            <Toggle label="Takeaway" active={value.takeaway} onClick={() => toggle("takeaway")} />
            <Toggle label="เหมาะนั่งทำงาน" active={value.goodForWorking} onClick={() => toggle("goodForWorking")} />
            <Toggle label="เหมาะนักศึกษา" active={value.studentFriendly} onClick={() => toggle("studentFriendly")} />
          </div>
        </div>

        <div className="mt-5">
          <p className="mb-2 text-[10px] font-bold text-white/40">คุณภาพข้อมูล</p>
          <Toggle label="เฉพาะข้อมูลที่ยืนยันแล้ว" active={value.verifiedOnly} onClick={() => toggle("verifiedOnly")} />
        </div>

        <button type="button" onClick={onClose} className="mt-6 h-12 w-full rounded-2xl bg-cyan-300 text-[11px] font-black text-[#031018]">
          ใช้ตัวกรอง
        </button>
      </section>
    </div>
  );
}

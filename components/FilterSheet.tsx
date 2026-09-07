"use client";

import { RotateCcw, SlidersHorizontal, X } from "lucide-react";

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

function Toggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`amd-chip px-3 py-2 text-[10px] font-semibold ${active ? "amd-chip-active" : ""}`}
    >
      {label}
    </button>
  );
}

function countActiveFilters(value: FilterState) {
  const booleanCount = [
    value.onlyOpen,
    value.only24Hours,
    value.openLate,
    value.parking,
    value.wifi,
    value.powerOutlet,
    value.airConditioned,
    value.delivery,
    value.takeaway,
    value.goodForWorking,
    value.studentFriendly,
    value.verifiedOnly,
    value.localOnly,
  ].filter(Boolean).length;
  return booleanCount + Number(value.priceLevels.length > 0) + Number(value.maxPrice != null) + Number(value.maxWalkingMinutes != null) + Number(Boolean(value.area));
}

export function FilterSheet({
  value,
  onChange,
  onClose,
  resultCount,
}: {
  value: FilterState;
  onChange: (next: FilterState) => void;
  onClose: () => void;
  resultCount?: number;
}) {
  const activeCount = countActiveFilters(value);
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
    <div className="amd-sheet-backdrop">
      <button type="button" aria-label="ปิดตัวกรอง" onClick={onClose} className="absolute inset-0" />
      <section role="dialog" aria-modal="true" aria-label="ตัวกรองร้าน" className="amd-sheet amd-glass-strong relative max-h-[90dvh] w-full max-w-[520px] overflow-y-auto rounded-t-[30px] border-b-0 px-4 pb-[calc(92px+env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/15" />
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-[#00D9FF]" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#00D9FF]">Smart Filter</p>
              {activeCount > 0 && <span className="rounded-full border border-[rgba(0,140,255,.3)] bg-[rgba(0,122,255,.12)] px-2 py-1 text-[9px] font-bold text-[#8ecbff]">{activeCount} ตัวกรอง</span>}
            </div>
            <h3 className="mt-1 text-[22px] font-bold tracking-[-0.025em]">กรองร้าน</h3>
          </div>
          <button type="button" onClick={onClose} className="amd-chip grid h-11 w-11 min-h-0 place-items-center p-0" aria-label="ปิด"><X className="h-4 w-4" /></button>
        </div>

        <div className="mt-5">
          <p className="mb-2 text-[10px] font-semibold text-[var(--amd-text-3)]">สถานะร้าน</p>
          <div className="grid grid-cols-3 gap-2">
            <Toggle label="เปิดอยู่ตอนนี้" active={value.onlyOpen} onClick={() => toggle("onlyOpen")} />
            <Toggle label="เปิด 24 ชม." active={value.only24Hours} onClick={() => toggle("only24Hours")} />
            <Toggle label="เปิดดึก" active={value.openLate} onClick={() => toggle("openLate")} />
          </div>
        </div>

        <div className="mt-5">
          <p className="mb-2 text-[10px] font-semibold text-[var(--amd-text-3)]">งบประมาณจริง</p>
          <div className="grid grid-cols-3 gap-2">
            {[70, 100, 200].map((price) => <Toggle key={price} label={`≤ ${price} บาท`} active={value.maxPrice === price} onClick={() => onChange({ ...value, maxPrice: value.maxPrice === price ? null : price })} />)}
          </div>
          <p className="mt-2 text-[9px] leading-4 text-[var(--amd-text-3)]">ร้านที่ไม่มีข้อมูลราคาจะไม่ผ่านตัวกรองงบ เพื่อไม่เดาราคา</p>
        </div>

        <div className="mt-5">
          <p className="mb-2 text-[10px] font-semibold text-[var(--amd-text-3)]">ระยะเดิน</p>
          <div className="grid grid-cols-3 gap-2">
            {[5, 10, 15].map((minutes) => <Toggle key={minutes} label={`เดิน ≤${minutes} นาที`} active={value.maxWalkingMinutes === minutes} onClick={() => onChange({ ...value, maxWalkingMinutes: value.maxWalkingMinutes === minutes ? null : minutes })} />)}
          </div>
          <p className="mt-2 text-[9px] leading-4 text-[var(--amd-text-3)]">ใช้เฉพาะเวลาเดินที่มีข้อมูล route จริง ไม่สร้างเวลาเดินจากระยะเส้นตรง</p>
        </div>

        <div className="mt-5">
          <p className="mb-2 text-[10px] font-semibold text-[var(--amd-text-3)]">ย่าน</p>
          <select aria-label="กรองตามย่าน" value={value.area} onChange={(event) => onChange({ ...value, area: event.target.value })} className="amd-input h-12 min-h-0 w-full px-3 text-[11px] font-semibold text-[var(--amd-text)] outline-none">
            {AREAS.map((area) => <option key={area || "all"} value={area}>{area || "ทั้งหมด"}</option>)}
          </select>
        </div>

        <div className="mt-5">
          <p className="mb-2 text-[10px] font-semibold text-[var(--amd-text-3)]">ช่วงราคา</p>
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((level) => <Toggle key={level} label={"฿".repeat(level)} active={value.priceLevels.includes(level)} onClick={() => togglePrice(level)} />)}
          </div>
        </div>

        <div className="mt-5">
          <p className="mb-2 text-[10px] font-semibold text-[var(--amd-text-3)]">ประเภท / สิ่งอำนวยความสะดวก</p>
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
          <p className="mb-2 text-[10px] font-semibold text-[var(--amd-text-3)]">คุณภาพข้อมูล</p>
          <Toggle label="เฉพาะข้อมูลที่ยืนยันแล้ว" active={value.verifiedOnly} onClick={() => toggle("verifiedOnly")} />
        </div>

        <div className="sticky bottom-0 -mx-4 mt-6 grid grid-cols-[.85fr_1.6fr] gap-3 border-t border-[rgba(120,160,210,.12)] bg-[rgba(6,15,29,.92)] px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 backdrop-blur-2xl">
          <button type="button" onClick={() => onChange(EMPTY_FILTERS)} className="amd-btn flex h-12 items-center justify-center gap-2 rounded-[15px] border border-[rgba(120,160,210,.18)] text-[11px] font-semibold text-[var(--amd-text-2)]"><RotateCcw className="h-4 w-4" />ล้างทั้งหมด</button>
          <button type="button" onClick={onClose} className="amd-btn amd-btn-primary h-12 rounded-[15px] text-[11px] font-bold">{typeof resultCount === "number" ? `ดูผลลัพธ์ ${resultCount} ร้าน` : "ใช้ตัวกรอง"}</button>
        </div>
      </section>
    </div>
  );
}

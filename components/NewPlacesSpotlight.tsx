"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, ChevronDown, ChevronUp, MapPin, Sparkles } from "lucide-react";
import { PLACES } from "@/data/places";
import { CATEGORY_MAP } from "@/data/categories";

export function NewPlacesSpotlight() {
  const [expanded, setExpanded] = useState(false);

  const newPlaces = useMemo(
    () => PLACES.filter((place) => !place.id.startsWith("existing-")),
    [],
  );

  const visible = expanded ? newPlaces : newPlaces.slice(0, 10);

  const areaCounts = useMemo(() => {
    const groups = new Map<string, number>();
    for (const place of newPlaces) {
      const area = place.area.includes("ลาดพร้าว 41")
        ? "ลาดพร้าว 41 / ภาวนา"
        : place.area.includes("รัชดา 36") || place.area.includes("จันทรเกษม")
          ? "รัชดา 36 / หลังจันทรเกษม"
          : "ลาดพร้าว 35 / ใกล้บ้านสุภา";
      groups.set(area, (groups.get(area) || 0) + 1);
    }
    return Array.from(groups.entries());
  }, [newPlaces]);

  return (
    <section className="relative z-10 mx-auto w-full max-w-[1180px] px-4 pt-[max(18px,env(safe-area-inset-top))] sm:px-6 lg:px-8">
      <div className="overflow-hidden rounded-[28px] border border-cyan-300/15 bg-gradient-to-br from-cyan-300/[0.09] via-white/[0.04] to-pink-400/[0.05] p-4 shadow-[0_20px_80px_rgba(0,0,0,.28)] backdrop-blur-2xl sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.18em] text-cyan-300">
              <Sparkles className="h-3.5 w-3.5" />
              NEW DATASET
            </div>
            <h2 className="mt-1 text-[21px] font-black tracking-[-0.03em] sm:text-2xl">
              เพิ่มล่าสุดจากรายการของคุณ
            </h2>
            <p className="mt-1 text-[10px] leading-5 text-white/45 sm:text-[11px]">
              {newPlaces.length} ร้าน/สถานที่ใหม่ • ข้อมูลที่ยังไม่ยืนยันจะไม่เดาราคา เวลา Rating เบอร์ หรือพิกัด
            </p>
          </div>
          <div className="shrink-0 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-center">
            <p className="text-[8px] font-black uppercase tracking-wider text-cyan-200/70">ADDED</p>
            <p className="text-xl font-black text-cyan-200">{newPlaces.length}</p>
          </div>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {areaCounts.map(([area, count]) => (
            <div key={area} className="shrink-0 rounded-2xl border border-white/[0.08] bg-black/15 px-3 py-2">
              <p className="text-[9px] font-bold text-white/50">{area}</p>
              <p className="mt-0.5 text-[11px] font-black text-white/90">{count} ร้าน</p>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((place) => {
            const category = CATEGORY_MAP[place.category];
            return (
              <article
                key={place.id}
                className="flex min-h-[86px] items-center gap-3 rounded-[20px] border border-white/[0.07] bg-[#07101b]/55 p-3"
              >
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.05] text-xl">
                  {category?.icon || "📍"}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[12px] font-black text-white">{place.name}</h3>
                  <p className="mt-1 truncate text-[9px] font-semibold text-cyan-200/70">
                    {category?.name || "สถานที่"} • {place.area}
                  </p>
                  <p className="mt-1 truncate text-[9px] text-white/34">
                    {place.verified ? "ยืนยันข้อมูลแล้ว" : "ข้อมูลบางส่วนรอตรวจสอบ"}
                  </p>
                </div>
                {place.googleMapsUrl ? (
                  <a
                    href={place.googleMapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`เปิด ${place.name} ใน Google Maps`}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-white/55"
                  >
                    <ArrowUpRight className="h-4 w-4" />
                  </a>
                ) : (
                  <div className="grid h-11 w-11 shrink-0 place-items-center text-white/20">
                    <MapPin className="h-4 w-4" />
                  </div>
                )}
              </article>
            );
          })}
        </div>

        {newPlaces.length > 10 && (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.07] px-4 text-[10px] font-black text-cyan-100"
          >
            {expanded ? (
              <><ChevronUp className="h-4 w-4" /> ย่อรายการ</>
            ) : (
              <><ChevronDown className="h-4 w-4" /> ดูร้านใหม่ทั้งหมด {newPlaces.length} รายการ</>
            )}
          </button>
        )}
      </div>
    </section>
  );
}

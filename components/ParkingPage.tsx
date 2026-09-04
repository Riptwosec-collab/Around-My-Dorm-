"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Car, Clock3, MapPin, Navigation, Phone, ShieldCheck } from "lucide-react";
import { PLACES } from "@/data/places";
import {
  DORM_CENTER,
  formatDistance,
  formatPrice,
  getParkingStatus,
  googleMapsDirectionsUrl,
  withDistance,
} from "@/lib/place-utils";

export function ParkingPage() {
  const [monthlyOnly, setMonthlyOnly] = useState(true);
  const [only24h, setOnly24h] = useState(false);
  const [maxMonthly, setMaxMonthly] = useState<number | null>(null);

  const places = useMemo(() => {
    return PLACES
      .filter((place) => place.category === "parking" || place.categories.includes("parking") || place.categories.includes("monthly_parking"))
      .map((place) => withDistance(place, DORM_CENTER))
      .filter((place) => {
        const details = place.parkingDetails;
        if (monthlyOnly && details?.parkingType !== "monthly" && details?.parkingType !== "mixed" && !/รายเดือน/.test(place.parking.type || "")) return false;
        if (only24h && details?.access24Hours !== true && !place.is24Hours) return false;
        if (maxMonthly != null && (details?.monthlyPrice == null || details.monthlyPrice > maxMonthly)) return false;
        return true;
      })
      .sort((a, b) => (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY));
  }, [monthlyOnly, only24h, maxMonthly]);

  return (
    <main className="min-h-[100dvh] bg-[#050812] text-white">
      <div className="mx-auto min-h-[100dvh] w-full max-w-[900px] px-4 pb-[calc(32px+env(safe-area-inset-bottom))] pt-[max(18px,env(safe-area-inset-top))] sm:px-6">
        <header className="flex items-center gap-3">
          <a aria-label="กลับหน้าแรก" href="/" className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/[0.05]"><ArrowLeft className="h-4 w-4" /></a>
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan-300">PARKING AROUND DORM</p>
            <h1 className="text-[26px] font-black tracking-[-0.04em]">หาที่จอดรถ</h1>
            <p className="text-[10px] text-white/40">สถานะพื้นที่ว่างไม่ถูก Hardcode และจะแสดงความสดของข้อมูล</p>
          </div>
        </header>

        <section className="mt-5 rounded-[24px] border border-white/[0.08] bg-white/[0.04] p-3 backdrop-blur-2xl">
          <p className="px-1 text-[9px] font-black uppercase tracking-[0.15em] text-white/35">FILTER</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => setMonthlyOnly((value) => !value)} className={`min-h-11 rounded-2xl border px-3 text-[10px] font-black ${monthlyOnly ? "border-cyan-300/25 bg-cyan-300/[0.11] text-cyan-100" : "border-white/10 bg-white/[0.04] text-white/55"}`}>รายเดือน</button>
            <button type="button" onClick={() => setOnly24h((value) => !value)} className={`min-h-11 rounded-2xl border px-3 text-[10px] font-black ${only24h ? "border-cyan-300/25 bg-cyan-300/[0.11] text-cyan-100" : "border-white/10 bg-white/[0.04] text-white/55"}`}>24 ชั่วโมง</button>
            {[1000, 1500, 2000].map((price) => <button key={price} type="button" onClick={() => setMaxMonthly(maxMonthly === price ? null : price)} className={`min-h-11 rounded-2xl border px-3 text-[10px] font-black ${maxMonthly === price ? "border-cyan-300/25 bg-cyan-300/[0.11] text-cyan-100" : "border-white/10 bg-white/[0.04] text-white/55"}`}>≤ {price.toLocaleString()} /เดือน</button>)}
          </div>
        </section>

        <div className="mb-3 mt-6 flex items-end justify-between">
          <div><p className="text-[9px] font-black text-pink-300">RESULTS</p><h2 className="mt-1 text-lg font-black">ที่จอดรถรอบบ้านสุภา</h2></div>
          <span className="text-[10px] text-white/35">{places.length} รายการ</span>
        </div>

        <section className="grid gap-3 md:grid-cols-2">
          {places.map((place) => {
            const status = getParkingStatus(place);
            const details = place.parkingDetails;
            return (
              <article key={place.id} className="rounded-[24px] border border-white/[0.08] bg-white/[0.04] p-4 shadow-[0_18px_65px_rgba(0,0,0,.24)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="text-[9px] font-bold text-cyan-200/70">🚗 PARKING • {place.area}</p><h3 className="mt-1 truncate text-[16px] font-black">{place.name}</h3></div>
                  <Car className="h-5 w-5 shrink-0 text-cyan-300" />
                </div>

                <div className="mt-4 grid gap-2 text-[10px] text-white/58">
                  <p className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-cyan-300" /><b className="text-white/80">{formatDistance(place.distanceKm)}</b> จากบ้านสุภา</p>
                  <p className="flex items-center gap-2"><span>💰</span><b className="text-white/80">{formatPrice(place)}</b></p>
                  <p className="flex items-center gap-2"><Clock3 className="h-3.5 w-3.5" />{details?.access24Hours === true || place.is24Hours ? "เข้าออก 24 ชม." : details?.accessHours || "เวลาเข้าออกยังไม่ยืนยัน"}</p>
                  <p className="flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5" />{status.label}</p>
                  <p className="text-[9px] text-white/32">ตรวจสอบล่าสุด: {details?.availabilityVerifiedAt || place.parkingVerifiedAt || "ยังไม่ยืนยัน"}</p>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  {place.phone ? <a href={`tel:${place.phone}`} className="flex min-h-11 items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.05] text-[10px] font-black"><Phone className="h-3.5 w-3.5" />โทรสอบถาม</a> : <button disabled className="min-h-11 rounded-2xl border border-white/[0.06] bg-white/[0.02] text-[10px] font-black text-white/25">ไม่มีเบอร์ยืนยัน</button>}
                  <a href={googleMapsDirectionsUrl(place)} target="_blank" rel="noreferrer" className="flex min-h-11 items-center justify-center gap-1.5 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.08] text-[10px] font-black text-cyan-100"><Navigation className="h-3.5 w-3.5" />นำทาง</a>
                </div>
              </article>
            );
          })}
        </section>

        {!places.length && <div className="mt-8 rounded-[24px] border border-dashed border-white/10 p-7 text-center text-sm font-bold text-white/55">ไม่พบที่จอดที่ตรงเงื่อนไข ลองล้างตัวกรองราคา/24 ชั่วโมง</div>}
      </div>
    </main>
  );
}

"use client";

import { Accessibility, Bike, Car, MapPin, Route, WalletCards } from "lucide-react";
import { GoogleTransientPhotoPanel } from "@/components/GoogleTransientPhotoPanel";
import { googleMapsPlaceUrl } from "@/lib/google-maps-links";
import type { Place } from "@/types/place";

function yesNoUnknown(value: boolean | null | undefined, language: "th" | "en") {
  if (value === true) return language === "en" ? "Yes" : "มี";
  if (value === false) return language === "en" ? "No" : "ไม่มี";
  return language === "en" ? "No data" : "ไม่มีข้อมูล";
}

function minutes(value: number | null | undefined, language: "th" | "en") {
  return value == null ? (language === "en" ? "No route data" : "ไม่มีข้อมูลเส้นทาง") : `${value} ${language === "en" ? "min" : "นาที"}`;
}

function routeDistance(value: number | null | undefined, language: "th" | "en") {
  if (value == null) return language === "en" ? "No data" : "ไม่มีข้อมูล";
  return value < 1000 ? `${Math.round(value)} ${language === "en" ? "m" : "ม."}` : `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)} ${language === "en" ? "km" : "กม."}`;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex items-start justify-between gap-4 border-b border-white/[0.05] py-2.5 last:border-0"><span className="text-[9px] text-white/38">{label}</span><span className="max-w-[65%] text-right text-[9px] font-semibold text-white/72">{value}</span></div>;
}

export function PlaceGoogleDataPanel({ place, language }: { place: Place; language: "th" | "en" }) {
  const g = place.googleDetails;
  const d = place.distance;
  const noData = language === "en" ? "No data" : "ไม่มีข้อมูล";
  const googleId = place.googlePlaceId || place.googleMaps?.placeId || null;
  const types = g?.types?.length ? g.types.join(", ") : noData;
  const parkingOptions = g?.parkingOptions ? Object.entries(g.parkingOptions).filter(([, value]) => value === true).map(([key]) => key).join(", ") : "";
  const paymentOptions = g?.paymentOptions ? Object.entries(g.paymentOptions).filter(([, value]) => value === true).map(([key]) => key).join(", ") : "";

  return (
    <>
      <section className="mt-4 rounded-[24px] border border-white/[0.07] bg-white/[0.035] p-4" data-testid="google-route-detail-panel">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">GOOGLE / ROUTES</p><p className="mt-1 text-[9px] leading-5 text-white/45">{language === "en" ? "Cloud-cached fields only. Opening this detail does not send Google requests." : "แสดงข้อมูลที่มีใน Cloud เท่านั้น • เปิดรายละเอียดร้านไม่ยิง Google API"}</p></div>
          <Route className="h-4 w-4 text-[#8ecbff]" />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-2xl border border-white/[0.06] bg-black/10 p-3"><div className="flex items-center gap-1.5 text-[8px] text-white/38"><Accessibility className="h-3.5 w-3.5"/>{language === "en" ? "Walk" : "เดิน"}</div><p className="mt-1 text-[12px] font-bold">{minutes(d?.walkingMinutes ?? place.walkingMinutes, language)}</p><p className="mt-1 text-[8px] text-white/35">{routeDistance(d?.walkingDistanceMeters, language)}</p></div>
          <div className="rounded-2xl border border-white/[0.06] bg-black/10 p-3"><div className="flex items-center gap-1.5 text-[8px] text-white/38"><Bike className="h-3.5 w-3.5"/>{language === "en" ? "Two-wheel" : "มอเตอร์ไซค์"}</div><p className="mt-1 text-[12px] font-bold">{minutes(d?.motorcycleMinutes, language)}</p><p className="mt-1 text-[8px] text-white/35">{routeDistance(d?.motorcycleDistanceMeters, language)}</p></div>
          <div className="rounded-2xl border border-white/[0.06] bg-black/10 p-3"><div className="flex items-center gap-1.5 text-[8px] text-white/38"><Car className="h-3.5 w-3.5"/>{language === "en" ? "Drive" : "รถยนต์"}</div><p className="mt-1 text-[12px] font-bold">{minutes(d?.drivingMinutes ?? place.drivingMinutes, language)}</p><p className="mt-1 text-[8px] text-white/35">{routeDistance(d?.drivingDistanceMeters, language)}</p></div>
        </div>
        <p className="mt-2 text-[8px] leading-4 text-amber-100/70">{language === "en" ? "Walking and two-wheel routes can be unavailable or unsuitable; verify conditions before travel." : "เส้นทางเดินและสองล้ออาจไม่มีข้อมูลหรือไม่เหมาะกับสภาพจริง • ควรตรวจสภาพเส้นทางก่อนเดินทาง"}</p>

        <div className="mt-3 rounded-2xl border border-white/[0.06] bg-black/10 px-3">
          <Field label="Google Place ID" value={googleId || noData} />
          <Field label={language === "en" ? "Primary type" : "ประเภท Google"} value={g?.primaryType || noData} />
          <Field label={language === "en" ? "Types" : "หมวด Google"} value={types} />
          <Field label={language === "en" ? "International phone" : "เบอร์สากล"} value={g?.internationalPhone || noData} />
          <Field label={language === "en" ? "Business status" : "สถานะกิจการ"} value={g?.businessStatus || noData} />
          <Field label="Delivery" value={yesNoUnknown(place.delivery, language)} />
          <Field label="Dine-in" value={yesNoUnknown(place.dineIn, language)} />
          <Field label="Takeaway" value={yesNoUnknown(place.takeaway, language)} />
          <Field label={language === "en" ? "Reservation" : "จองโต๊ะ"} value={yesNoUnknown(g?.reservable, language)} />
          <Field label={language === "en" ? "Curbside pickup" : "รับของหน้าร้าน"} value={yesNoUnknown(g?.curbsidePickup, language)} />
          <Field label={language === "en" ? "Wheelchair entrance" : "ทางเข้าสำหรับรถเข็น"} value={yesNoUnknown(g?.accessibility?.wheelchairAccessibleEntrance ?? place.wheelchairAccessible, language)} />
          <Field label={language === "en" ? "Parking options" : "ข้อมูลที่จอดรถ Google"} value={parkingOptions || noData} />
          <Field label={language === "en" ? "Payment options" : "การชำระเงิน Google"} value={paymentOptions || (place.paymentMethods.length ? place.paymentMethods.join(", ") : noData)} />
        </div>

        <a href={googleMapsPlaceUrl(place)} target="_blank" rel="noreferrer" className="amd-btn mt-3 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 px-4 text-[9px] font-bold"><MapPin className="h-4 w-4" />{language === "en" ? "Open place in Google Maps" : "เปิดร้านใน Google Maps"}</a>
      </section>

      <GoogleTransientPhotoPanel place={place} language={language} />
    </>
  );
}

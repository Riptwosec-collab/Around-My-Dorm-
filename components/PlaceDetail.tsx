"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Heart,
  MapPin,
  Navigation,
  Phone,
  Share2,
  ShieldCheck,
  Star,
  X,
} from "lucide-react";
import { CATEGORY_MAP } from "@/data/categories";
import { ReportPlaceSheet } from "@/components/ReportPlaceSheet";
import {
  calculateLocalScore,
  formatDistance,
  formatPrice,
  getDataFreshness,
  getParkingStatus,
  getPlaceOpenStatus,
  googleMapsDirectionsUrl,
} from "@/lib/place-utils";
import type { OpeningHours, Place } from "@/types/place";

const DAYS: { key: keyof OpeningHours; label: string }[] = [
  { key: "monday", label: "จันทร์" },
  { key: "tuesday", label: "อังคาร" },
  { key: "wednesday", label: "พุธ" },
  { key: "thursday", label: "พฤหัสบดี" },
  { key: "friday", label: "ศุกร์" },
  { key: "saturday", label: "เสาร์" },
  { key: "sunday", label: "อาทิตย์" },
];

function ValueRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-5 border-b border-white/[0.055] py-3 last:border-0">
      <span className="text-[11px] text-white/40">{label}</span>
      <div className="max-w-[65%] text-right text-[11px] font-semibold text-white/82">{value}</div>
    </div>
  );
}

export function PlaceDetail({
  place,
  saved,
  onClose,
  onSave,
  onMap,
}: {
  place: Place;
  saved: boolean;
  onClose: () => void;
  onSave: () => void;
  onMap: () => void;
}) {
  const [reportOpen, setReportOpen] = useState(false);
  const category = CATEGORY_MAP[place.category];
  const status = getPlaceOpenStatus(place);
  const localScore = place.localScore ?? calculateLocalScore(place);
  const isLocal = place.placeType === "local" || place.placeType === "independent" || place.localFavorite;
  const hasHours = place.is24Hours || Boolean(place.openingHoursText) || DAYS.some(({ key }) => Boolean(place.openingHours[key]));
  const openingFreshness = getDataFreshness(place.openingHoursVerifiedAt, 90);
  const parkingStatus = getParkingStatus(place);

  async function share() {
    const url = place.googleMapsUrl || googleMapsDirectionsUrl(place);
    try {
      if (navigator.share) {
        await navigator.share({ title: place.name, text: place.shortDescription, url });
      } else {
        await navigator.clipboard.writeText(url);
      }
    } catch {}
  }

  const amenities = [
    ["Wi-Fi", place.wifi],
    ["ปลั๊กไฟ", place.powerOutlet],
    ["แอร์", place.airConditioned],
    ["ห้องน้ำ", place.toilet],
    ["Pet Friendly", place.petFriendly],
    ["Wheelchair", place.wheelchairAccessible],
    ["Delivery", place.delivery],
    ["Takeaway", place.takeaway],
    ["นั่งทำงาน", place.goodForWorking],
    ["เหมาะนักศึกษา", place.studentFriendly],
  ].filter(([, value]) => value === true);

  const menuItems = place.menuItems || [];
  const gallery = place.galleryImages?.length ? place.galleryImages : place.images;

  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/65 backdrop-blur-sm">
        <button type="button" aria-label="ปิดรายละเอียด" onClick={onClose} className="absolute inset-0" />
        <section className="relative max-h-[92dvh] w-full max-w-[520px] overflow-y-auto rounded-t-[34px] border border-white/10 bg-[#08111d]/98 shadow-2xl">
          <div className="sticky top-0 z-20 flex items-center justify-between border-b border-white/[0.06] bg-[#08111d]/90 px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur-2xl">
            <div className="h-1.5 w-12 rounded-full bg-white/15" />
            <button type="button" aria-label="ปิดรายละเอียด" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-full bg-white/[0.06]">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="relative h-[220px] bg-gradient-to-br from-[#10233a] to-[#07101b]">
            {place.coverImage || place.image ? (
              <img src={place.coverImage || place.image || ""} alt={place.name} loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full place-items-center"><div className="text-center"><span className="text-6xl">{category?.icon || "📍"}</span><p className="mt-2 text-[10px] text-white/30">ยังไม่มีรูปจริงที่ยืนยัน</p></div></div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#08111d] via-transparent to-transparent" />
          </div>

          <div className="relative -mt-9 px-4 pb-[calc(28px+env(safe-area-inset-bottom))]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">{category?.name || "สถานที่"}</p>
                <h2 className="mt-1 text-[25px] font-black tracking-[-0.035em]">{place.name}</h2>
                {place.nameEn && <p className="mt-1 text-xs text-white/42">{place.nameEn}</p>}
              </div>
              <button type="button" aria-label={saved ? "นำออกจากรายการโปรด" : "เพิ่มรายการโปรด"} onClick={onSave} className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.06]">
                <Heart className={`h-5 w-5 ${saved ? "fill-pink-400 text-pink-300" : "text-white/75"}`} />
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {isLocal && <span className="rounded-xl border border-pink-300/15 bg-pink-300/[0.08] px-2.5 py-2 text-[10px] font-black text-pink-100">LOCAL</span>}
              {place.placeType === "chain" && <span className="rounded-xl border border-white/10 bg-white/[0.05] px-2.5 py-2 text-[10px] font-black text-white/60">CHAIN</span>}
              {isLocal && localScore != null && localScore >= 78 && <span className="rounded-xl border border-amber-300/15 bg-amber-300/[0.08] px-2.5 py-2 text-[10px] font-black text-amber-100">🔥 Local Pick {localScore}</span>}
              {place.rating != null && (
                <span className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.05] px-2.5 py-2 text-[10px] font-bold">
                  <Star className="h-3.5 w-3.5 fill-cyan-300 text-cyan-300" /> {place.rating.toFixed(1)}
                  {place.reviewCount != null ? ` • ${place.reviewCount.toLocaleString()} รีวิว` : ""}
                </span>
              )}
              <span className="rounded-xl border border-white/10 bg-white/[0.05] px-2.5 py-2 text-[10px] font-bold">{formatPrice(place)}</span>
              <span className={`rounded-xl border px-2.5 py-2 text-[10px] font-bold ${status.tone === "green" ? "border-emerald-300/15 bg-emerald-300/[0.08] text-emerald-200" : status.tone === "red" ? "border-rose-300/15 bg-rose-300/[0.08] text-rose-200" : status.tone === "cyan" ? "border-cyan-300/15 bg-cyan-300/[0.08] text-cyan-200" : status.tone === "amber" ? "border-amber-300/15 bg-amber-300/[0.08] text-amber-100" : "border-white/10 bg-white/[0.04] text-white/50"}`}>{status.label}{status.secondaryText ? ` · ${status.secondaryText}` : ""}</span>
            </div>

            <div className="mt-4 grid grid-cols-4 gap-2">
              <button type="button" onClick={onMap} className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.08] text-[9px] font-bold text-cyan-200"><MapPin className="h-4 w-4" />แผนที่</button>
              <a href={googleMapsDirectionsUrl(place)} target="_blank" rel="noreferrer" className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl border border-white/10 bg-white/[0.05] text-[9px] font-bold"><Navigation className="h-4 w-4" />นำทาง</a>
              {place.phone ? (
                <a href={`tel:${place.phone}`} className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl border border-white/10 bg-white/[0.05] text-[9px] font-bold"><Phone className="h-4 w-4" />โทร</a>
              ) : (
                <button type="button" disabled className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl border border-white/[0.06] bg-white/[0.025] text-[9px] font-bold text-white/25"><Phone className="h-4 w-4" />ไม่มีเบอร์</button>
              )}
              <button type="button" onClick={share} className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl border border-white/10 bg-white/[0.05] text-[9px] font-bold"><Share2 className="h-4 w-4" />แชร์</button>
            </div>

            <div className="mt-5 rounded-[24px] border border-white/[0.07] bg-white/[0.035] p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">เกี่ยวกับร้าน</p>
              <p className="mt-2 text-[12px] leading-6 text-white/68">{place.description}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">{place.tags.map((tag) => <span key={tag} className="rounded-lg bg-white/[0.055] px-2 py-1 text-[9px] text-white/55">{tag}</span>)}</div>
            </div>

            <div className="mt-4 rounded-[24px] border border-white/[0.07] bg-white/[0.035] px-4">
              <ValueRow label="พื้นที่" value={place.area} />
              <ValueRow label="ที่อยู่" value={place.address || "ยังไม่มีข้อมูลยืนยัน"} />
              <ValueRow label="ระยะทาง" value={formatDistance(place.distanceKm)} />
              <ValueRow label="เวลาเดิน" value={place.walkingMinutes != null ? `${place.walkingMinutes} นาที` : "ยังไม่มีข้อมูล Route"} />
              <ValueRow label="มอเตอร์ไซค์" value={place.distance?.motorcycleMinutes != null ? `${place.distance.motorcycleMinutes} นาที` : "ยังไม่มีข้อมูล Route"} />
              <ValueRow label="รถยนต์" value={place.drivingMinutes != null ? `${place.drivingMinutes} นาที` : "ยังไม่มีข้อมูล Route"} />
              <ValueRow label="ราคา" value={formatPrice(place)} />
              <ValueRow label="เบอร์โทร" value={place.phone || "ยังไม่มีข้อมูลยืนยัน"} />
              <ValueRow label="ที่จอดรถ" value={place.parkingDetails ? parkingStatus.label : place.parking.available === true ? place.parking.note || "มี" : place.parking.available === false ? "ไม่มี" : "ยังไม่มีข้อมูลยืนยัน"} />
            </div>

            {(menuItems.length > 0 || place.popularMenus.length > 0 || place.recommendedItems.length > 0) && (
              <div className="mt-4 rounded-[24px] border border-white/[0.07] bg-white/[0.035] p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">เมนูเด่น</p>
                {menuItems.length > 0 ? <div className="mt-3 grid grid-cols-2 gap-2">{menuItems.map((item) => <div key={item.id} className="rounded-2xl border border-white/[0.07] bg-black/10 p-3"><p className="text-[11px] font-black">{item.name}</p><p className="mt-1 text-[9px] text-white/40">{item.price != null ? `${item.price.toLocaleString()} บาท` : "ยังไม่มีราคายืนยัน"}</p>{item.isPopular && <span className="mt-2 inline-block rounded-lg bg-cyan-300/[0.08] px-2 py-1 text-[8px] font-bold text-cyan-100">ขายดี</span>}</div>)}</div> : <div className="mt-3 space-y-2">{[...place.popularMenus, ...place.recommendedItems].map((item) => <div key={item} className="flex items-center gap-2 text-[11px] text-white/70"><CheckCircle2 className="h-3.5 w-3.5 text-cyan-300" />{item}</div>)}</div>}
              </div>
            )}

            {place.deliveryPlatforms?.length ? (
              <div className="mt-4 rounded-[24px] border border-white/[0.07] bg-white/[0.035] p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">สั่ง Delivery</p>
                <div className="mt-3 flex flex-wrap gap-2">{place.deliveryPlatforms.map((platform) => <a key={`${platform.provider}-${platform.url}`} href={platform.url} target="_blank" rel="noreferrer" className="min-h-11 rounded-2xl border border-cyan-300/12 bg-cyan-300/[0.07] px-4 py-3 text-[10px] font-black text-cyan-100">{platform.provider}</a>)}</div>
              </div>
            ) : null}

            {amenities.length > 0 && (
              <div className="mt-4 rounded-[24px] border border-white/[0.07] bg-white/[0.035] p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">สิ่งอำนวยความสะดวก</p>
                <div className="mt-3 flex flex-wrap gap-2">{amenities.map(([label]) => <span key={String(label)} className="rounded-xl border border-cyan-300/10 bg-cyan-300/[0.06] px-2.5 py-2 text-[10px] text-cyan-100">{String(label)}</span>)}</div>
              </div>
            )}

            {gallery.length > 0 && (
              <div className="mt-4 rounded-[24px] border border-white/[0.07] bg-white/[0.035] p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">รูปภาพ</p>
                <div className="mt-3 grid grid-cols-2 gap-2">{gallery.slice(0, 6).map((image) => <img key={image} src={image} alt={`${place.name} gallery`} loading="lazy" className="aspect-[4/3] w-full rounded-2xl object-cover" />)}</div>
              </div>
            )}

            {hasHours && (
              <div className="mt-4 rounded-[24px] border border-white/[0.07] bg-white/[0.035] px-4 py-2">
                <p className="py-3 text-[10px] font-black uppercase tracking-[0.16em] text-white/35">เวลาเปิด</p>
                {place.is24Hours ? <ValueRow label="ทุกวัน" value="เปิด 24 ชั่วโมง" /> : place.openingHoursText && !DAYS.some(({ key }) => Boolean(place.openingHours[key])) ? <ValueRow label="เวลาที่มีข้อมูล" value={place.openingHoursText} /> : DAYS.map(({ key, label }) => <ValueRow key={key} label={label} value={place.openingHours[key] || "ยังไม่มีข้อมูล"} />)}
                {openingFreshness.stale && place.openingHoursVerifiedAt && <div className="mb-3 flex items-start gap-2 rounded-xl bg-amber-300/[0.06] p-2.5 text-[9px] leading-4 text-amber-100/70"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />เวลาเปิดอาจมีการเปลี่ยนแปลง กรุณาตรวจสอบก่อนเดินทาง</div>}
              </div>
            )}

            <div className={`mt-4 rounded-[24px] border p-4 ${place.verified ? "border-emerald-300/15 bg-emerald-300/[0.055]" : "border-amber-300/15 bg-amber-300/[0.05]"}`}>
              <div className="flex items-center gap-2">
                <ShieldCheck className={`h-4 w-4 ${place.verified ? "text-emerald-300" : "text-amber-200"}`} />
                <p className="text-[11px] font-black">{place.verified ? "ข้อมูลผ่านการตรวจสอบ" : "ข้อมูลบางส่วนยังไม่ได้ยืนยัน"}</p>
              </div>
              <p className="mt-2 text-[10px] leading-5 text-white/48">Last verified: {place.lastVerified || "ยังไม่มี"}</p>
              <p className="text-[10px] leading-5 text-white/48">Source: {place.source.length ? place.source.join(" • ") : "ยังไม่มี"}</p>
              {place.notes && <p className="mt-1 text-[10px] leading-5 text-white/48">หมายเหตุ: {place.notes}</p>}
            </div>

            <button type="button" onClick={() => setReportOpen(true)} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-amber-300/12 bg-amber-300/[0.045] text-[10px] font-black text-amber-100"><AlertTriangle className="h-4 w-4" />ข้อมูลร้านไม่ถูกต้อง?</button>

            <a href={place.googleMapsUrl || googleMapsDirectionsUrl(place)} target="_blank" rel="noreferrer" className="mt-3 flex h-12 items-center justify-center gap-2 rounded-2xl bg-cyan-300 text-[11px] font-black text-[#031018]">
              เปิด Google Maps <ArrowUpRight className="h-4 w-4" />
            </a>
          </div>
        </section>
      </div>
      {reportOpen && <ReportPlaceSheet place={place} onClose={() => setReportOpen(false)} />}
    </>
  );
}

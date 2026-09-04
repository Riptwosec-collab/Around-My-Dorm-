import type { Place } from "@/types/place";

type Enrichment = Partial<Place>;

/**
 * Safe, additive metadata only. This file never changes an existing place ID and
 * deliberately keeps fast-changing availability as unknown/call-to-confirm.
 */
export const PLACE_ENRICHMENTS: Record<string, Enrichment> = {
  "existing-seven-latphrao35": {
    placeType: "chain",
  },
  "lp41-seven-eleven": {
    placeType: "chain",
  },
  "lp41-lotus-go-fresh": {
    placeType: "chain",
  },
  "lp41-cj-more": {
    placeType: "chain",
  },
  "ep02-foodland-latphrao": {
    placeType: "chain",
  },
  "ep02-the-jas-wanghin": {
    placeType: "community",
  },
  "ep02-the-shelter-parking": {
    placeType: "community",
    categories: ["parking", "monthly_parking"],
    pricing: {
      type: "per_month",
      min: null,
      max: null,
      fixed: 2000,
      unit: "per_month",
      currency: "THB",
      displayText: "2,000 บาท/เดือน",
      verifiedAt: "2026-09-04",
    },
    parking: {
      available: null,
      type: "รายเดือน / Community Mall",
      price: "2,000 บาท/เดือน",
      note: "จำนวนช่องว่างเปลี่ยนแปลงได้ ต้องตรวจสอบก่อนเดินทาง",
    },
    parkingDetails: {
      parkingType: "monthly",
      hourlyPrice: null,
      dailyPrice: null,
      monthlyPrice: 2000,
      deposit: null,
      accessHours: null,
      access24Hours: true,
      coveredParking: null,
      cctv: null,
      securityGuard: null,
      gateAccess: null,
      overnightAllowed: null,
      evCharging: null,
      estimatedCapacity: null,
      availabilityStatus: "call_to_confirm",
      availabilityVerifiedAt: "2026-09-04",
    },
    parkingVerifiedAt: "2026-09-04",
  },
  "ep02-apa-building-parking": {
    categories: ["parking", "monthly_parking"],
    pricing: {
      type: "per_month",
      min: null,
      max: null,
      fixed: 1000,
      unit: "per_month",
      currency: "THB",
      displayText: "1,000 บาท/เดือน",
      verifiedAt: "2026-09-04",
    },
    parking: {
      available: null,
      type: "รายเดือน",
      price: "1,000 บาท/เดือน",
      note: "ต้อง Verify สถานะพื้นที่และเงื่อนไขอีกครั้ง",
    },
    parkingDetails: {
      parkingType: "monthly",
      hourlyPrice: null,
      dailyPrice: null,
      monthlyPrice: 1000,
      deposit: null,
      accessHours: null,
      access24Hours: null,
      coveredParking: null,
      cctv: null,
      securityGuard: null,
      gateAccess: null,
      overnightAllowed: null,
      evCharging: null,
      estimatedCapacity: null,
      availabilityStatus: "unknown",
      availabilityVerifiedAt: null,
    },
  },
  "ep02-lotus-wanghin-parking": {
    categories: ["parking", "monthly_parking"],
    pricing: {
      type: "per_month",
      min: null,
      max: null,
      fixed: 1200,
      unit: "per_month",
      currency: "THB",
      displayText: "1,200 บาท/เดือน",
      verifiedAt: "2026-09-04",
    },
    parking: {
      available: null,
      type: "รายเดือน",
      price: "1,200 บาท/เดือน",
      note: "ต้องตรวจสอบช่องว่าง เวลาเข้าออก เงื่อนไขสมาชิก และการจอดค้างคืน",
    },
    parkingDetails: {
      parkingType: "monthly",
      hourlyPrice: null,
      dailyPrice: null,
      monthlyPrice: 1200,
      deposit: null,
      accessHours: null,
      access24Hours: null,
      coveredParking: null,
      cctv: null,
      securityGuard: null,
      gateAccess: null,
      overnightAllowed: null,
      evCharging: null,
      estimatedCapacity: null,
      availabilityStatus: "unknown",
      availabilityVerifiedAt: null,
    },
  },
};

export function enrichPlace(place: Place): Place {
  const patch = PLACE_ENRICHMENTS[place.id];
  if (!patch) return place;
  return {
    ...place,
    ...patch,
    categories: patch.categories ?? place.categories,
    parking: patch.parking ?? place.parking,
    source: Array.from(new Set([...(place.source || []), "Around My Dorm enrichment layer"])),
  };
}

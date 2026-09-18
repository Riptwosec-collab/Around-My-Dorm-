import type { PlaceReportType } from "@/lib/cloud/place-reports";
import type { ReliabilityField } from "@/lib/reliability/types";

const DOMAIN: Record<PlaceReportType, ReliabilityField | "reportReview"> = {
  closed: "openingHours",
  opening_hours: "openingHours",
  price: "price",
  moved: "location",
  parking: "parking",
  phone: "phone",
  location: "location",
  other: "reportReview",
};

export function mapReportTypeToReliabilityDomain(type: PlaceReportType): ReliabilityField | "reportReview" {
  return DOMAIN[type];
}

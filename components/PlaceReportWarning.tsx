"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  loadPlaceReportWarnings,
  type PlaceReportWarning as PlaceReportWarningItem,
  type PlaceReportType,
} from "@/lib/cloud/place-reports";
import type { Place } from "@/types/place";

const LABELS: Record<PlaceReportType, { th: string; en: string }> = {
  closed: { th: "สถานะร้าน", en: "closure status" },
  opening_hours: { th: "เวลาเปิด", en: "opening hours" },
  price: { th: "ราคา", en: "price" },
  moved: { th: "การย้ายร้าน", en: "location move" },
  parking: { th: "ที่จอดรถ", en: "parking" },
  phone: { th: "เบอร์โทร", en: "phone number" },
  location: { th: "พิกัด/ที่อยู่", en: "location/address" },
  other: { th: "ข้อมูลร้าน", en: "place information" },
};

export function PlaceReportWarning({ place, language }: { place: Place; language: "th" | "en" }) {
  const [warnings, setWarnings] = useState<PlaceReportWarningItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    setWarnings([]);

    void loadPlaceReportWarnings(place.id)
      .then((items) => {
        if (!cancelled) setWarnings(items.filter((item) => item.reportCount > 0));
      })
      .catch(() => {
        if (!cancelled) setWarnings([]);
      });

    return () => {
      cancelled = true;
    };
  }, [place.id]);

  const summary = useMemo(() => {
    if (warnings.length === 0) return null;
    const labels = warnings.slice(0, 3).map((item) => LABELS[item.reportType][language]);
    const total = warnings.reduce((sum, item) => sum + item.reportCount, 0);
    if (language === "en") {
      return `Information about ${labels.join(", ")} has been reported as possibly incorrect • under review${total > 1 ? ` (${total})` : ""}`;
    }
    return `มีรายงานว่าข้อมูล${labels.join(" / ")}อาจไม่ถูกต้อง • กำลังตรวจสอบ${total > 1 ? ` (${total})` : ""}`;
  }, [warnings, language]);

  if (!summary) return null;

  return (
    <div data-testid="place-report-warning" className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-300/12 bg-amber-300/[0.05] p-3 text-[9px] leading-4 text-amber-100/80">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{summary}</span>
    </div>
  );
}

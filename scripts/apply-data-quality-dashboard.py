from pathlib import Path

ROOT = Path('.')

module = r'''import type { Place } from "@/types/place";

export type DataQualityGrade = "A" | "B" | "C" | "D";
export type PlaceDataQuality = {
  score: number;
  grade: DataQualityGrade;
  completed: number;
  total: number;
  missing: string[];
  dimensions: {
    identity: number;
    location: number;
    operations: number;
    contact: number;
    commercial: number;
    media: number;
    verification: number;
  };
};

function filled(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function openingKnown(place: Place) {
  return place.is24Hours || filled(place.openingHoursText) || Object.values(place.openingHours || {}).some(Boolean);
}

function priceKnown(place: Place) {
  return filled(place.priceText) || place.minPrice != null || place.maxPrice != null || place.averagePricePerPerson != null || filled(place.pricing?.displayText);
}

function photoKnown(place: Place) {
  return filled(place.coverImage) || filled(place.image) || (place.imageMetadata?.some((image) => image.verified && (filled(image.url) || filled(image.photoReference))) ?? false) || place.images.length > 0;
}

function points(checks: Array<[string, boolean, number]>) {
  const max = checks.reduce((sum, [, , weight]) => sum + weight, 0);
  const score = checks.reduce((sum, [, ok, weight]) => sum + (ok ? weight : 0), 0);
  return max ? Math.round((score / max) * 100) : 0;
}

export function scorePlaceDataQuality(place: Place): PlaceDataQuality {
  const checks: Array<[string, boolean, number]> = [
    ["name", filled(place.name), 8],
    ["category", filled(place.category) && place.categories.length > 0, 5],
    ["googlePlaceId", filled(place.googlePlaceId), 5],
    ["coordinates", place.latitude != null && place.longitude != null, 10],
    ["address", filled(place.address), 6],
    ["area", filled(place.area), 3],
    ["openingHours", openingKnown(place), 9],
    ["phone", filled(place.phone), 5],
    ["price", priceKnown(place), 6],
    ["photo", photoKnown(place), 8],
    ["description", filled(place.shortDescription) || filled(place.description), 4],
    ["parking", place.parking.available !== null || Boolean(place.parkingDetails), 4],
    ["verified", place.verified, 9],
    ["freshness", filled(place.lastChecked) || filled(place.lastUpdated) || filled(place.lastVerified), 7],
    ["provenance", Boolean(place.fieldProvenance && Object.keys(place.fieldProvenance).length), 6],
    ["source", place.source.length > 0, 5],
  ];
  const max = checks.reduce((sum, [, , weight]) => sum + weight, 0);
  const earned = checks.reduce((sum, [, ok, weight]) => sum + (ok ? weight : 0), 0);
  const score = Math.round((earned / max) * 100);
  const grade: DataQualityGrade = score >= 85 ? "A" : score >= 70 ? "B" : score >= 50 ? "C" : "D";
  const missing = checks.filter(([, ok]) => !ok).map(([name]) => name);
  return {
    score,
    grade,
    completed: checks.length - missing.length,
    total: checks.length,
    missing,
    dimensions: {
      identity: points(checks.filter(([name]) => ["name", "category", "googlePlaceId"].includes(name))),
      location: points(checks.filter(([name]) => ["coordinates", "address", "area"].includes(name))),
      operations: points(checks.filter(([name]) => ["openingHours", "parking"].includes(name))),
      contact: points(checks.filter(([name]) => ["phone"].includes(name))),
      commercial: points(checks.filter(([name]) => ["price", "description"].includes(name))),
      media: points(checks.filter(([name]) => ["photo"].includes(name))),
      verification: points(checks.filter(([name]) => ["verified", "freshness", "provenance", "source"].includes(name))),
    },
  };
}

export function buildDataCompletenessDashboard(places: Place[]) {
  const scored = places.map((place) => ({ place, quality: scorePlaceDataQuality(place) }));
  const average = scored.length ? Math.round(scored.reduce((sum, item) => sum + item.quality.score, 0) / scored.length) : 0;
  const missingCounts = new Map<string, number>();
  for (const item of scored) for (const field of item.quality.missing) missingCounts.set(field, (missingCounts.get(field) || 0) + 1);
  return {
    average,
    excellent: scored.filter((item) => item.quality.grade === "A").length,
    good: scored.filter((item) => item.quality.grade === "B").length,
    needsWork: scored.filter((item) => item.quality.grade === "C" || item.quality.grade === "D").length,
    missingPlaceId: scored.filter((item) => item.quality.missing.includes("googlePlaceId")).length,
    missingPhoto: scored.filter((item) => item.quality.missing.includes("photo")).length,
    missingHours: scored.filter((item) => item.quality.missing.includes("openingHours")).length,
    missingPhone: scored.filter((item) => item.quality.missing.includes("phone")).length,
    topMissing: [...missingCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
    scored,
  };
}

export function dataAgeDays(place: Place, now = Date.now()) {
  const raw = place.lastChecked || place.lastUpdated || place.lastVerified;
  if (!raw) return null;
  const time = new Date(raw).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.floor((now - time) / 86_400_000));
}

export function dataAgeLabel(place: Place, language: "th" | "en", now = Date.now()) {
  const days = dataAgeDays(place, now);
  if (days == null) return language === "en" ? "Not checked yet" : "ยังไม่เคยตรวจข้อมูล";
  if (days === 0) return language === "en" ? "Updated today" : "อัปเดตวันนี้";
  if (days === 1) return language === "en" ? "Updated yesterday" : "อัปเดตเมื่อวาน";
  return language === "en" ? `Updated ${days} days ago` : `อัปเดต ${days} วันที่แล้ว`;
}
'''
(ROOT / 'lib/data-quality.ts').write_text(module, encoding='utf-8')

component = r'''"use client";

import { useMemo } from "react";
import { BarChart3, CheckCircle2, ImageOff, MapPinned, PhoneOff, TimerOff } from "lucide-react";
import { buildDataCompletenessDashboard } from "@/lib/data-quality";
import type { Place } from "@/types/place";

export function DataQualityDashboard({ places, language }: { places: Place[]; language: "th" | "en" }) {
  const data = useMemo(() => buildDataCompletenessDashboard(places), [places]);
  const tone = data.average >= 85 ? "text-emerald-200" : data.average >= 70 ? "text-cyan-200" : data.average >= 50 ? "text-amber-100" : "text-rose-200";
  const cards = [
    { label: language === "en" ? "Missing Place ID" : "ไม่มี Place ID", value: data.missingPlaceId, icon: MapPinned },
    { label: language === "en" ? "Missing photo" : "ไม่มีรูปจริง", value: data.missingPhoto, icon: ImageOff },
    { label: language === "en" ? "Missing hours" : "ไม่มีเวลาเปิด", value: data.missingHours, icon: TimerOff },
    { label: language === "en" ? "Missing phone" : "ไม่มีเบอร์โทร", value: data.missingPhone, icon: PhoneOff },
  ];
  return <section data-testid="data-quality-dashboard" className="amd-glass amd-card mt-4 p-4">
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3"><BarChart3 className="mt-0.5 h-5 w-5 text-[#00D9FF]" /><div><p className="text-[12px] font-bold">{language === "en" ? "Data Quality & Completeness" : "คุณภาพและความครบถ้วนของข้อมูล"}</p><p className="mt-1 text-[9px] leading-4 text-[var(--amd-text-3)]">{language === "en" ? "Calculated locally. No external API request is used for this score." : "คำนวณจากฐานข้อมูลในเครื่อง ไม่ใช้ External API"}</p></div></div>
      <div className="text-right"><p className={`text-[28px] font-bold leading-none ${tone}`}>{data.average}</p><p className="mt-1 text-[8px] text-[var(--amd-text-3)]">/ 100 average</p></div>
    </div>
    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-gradient-to-r from-[#007AFF] to-[#19E6FF]" style={{ width: `${data.average}%` }} /></div>
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{cards.map((item) => <div key={item.label} className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3"><item.icon className="h-4 w-4 text-white/38" /><p className="mt-2 text-[18px] font-bold">{item.value}</p><p className="mt-1 text-[8px] leading-3 text-white/38">{item.label}</p></div>)}</div>
    <div className="mt-3 flex flex-wrap gap-2 text-[8px]"><span className="flex items-center gap-1 rounded-full border border-emerald-300/10 bg-emerald-300/[0.05] px-2.5 py-1.5 text-emerald-200"><CheckCircle2 className="h-3 w-3" /> A: {data.excellent}</span><span className="rounded-full border border-cyan-300/10 bg-cyan-300/[0.05] px-2.5 py-1.5 text-cyan-100">B: {data.good}</span><span className="rounded-full border border-amber-300/10 bg-amber-300/[0.05] px-2.5 py-1.5 text-amber-100">C/D: {data.needsWork}</span></div>
  </section>;
}
'''
(ROOT / 'components/DataQualityDashboard.tsx').write_text(component, encoding='utf-8')

# Integrate dashboard into Data Management.
p = ROOT / 'components/DataManagement.tsx'
text = p.read_text(encoding='utf-8')
imp_marker = 'import { GooglePlaceIdManager } from "@/components/GooglePlaceIdManager";'
new_imp = 'import { DataQualityDashboard } from "@/components/DataQualityDashboard";'
if new_imp not in text:
    if imp_marker not in text: raise SystemExit('DataManagement import marker missing')
    text = text.replace(imp_marker, imp_marker + '\n' + new_imp, 1)
insert_marker = '''        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">'''
if '<DataQualityDashboard places={places}' not in text:
    if insert_marker not in text: raise SystemExit('DataManagement dashboard marker missing')
    text = text.replace(insert_marker, '        <DataQualityDashboard places={places} language={language} />\n\n' + insert_marker, 1)
p.write_text(text, encoding='utf-8')

# Add a restrained freshness label to PlaceCard without changing card geometry materially.
p = ROOT / 'components/PlaceCard.tsx'
text = p.read_text(encoding='utf-8')
imp_marker = '} from "@/lib/place-utils";'
quality_imp = 'import { dataAgeLabel, scorePlaceDataQuality } from "@/lib/data-quality";'
if quality_imp not in text:
    if imp_marker not in text: raise SystemExit('PlaceCard import marker missing')
    text = text.replace(imp_marker, imp_marker + '\n' + quality_imp, 1)
copy_marker = '  const copy = getCopy(language);'
if 'const dataQuality = scorePlaceDataQuality(place);' not in text:
    text = text.replace(copy_marker, copy_marker + '\n  const dataQuality = scorePlaceDataQuality(place);\n  const ageLabel = dataAgeLabel(place, language);', 1)
rating_marker = '''                  {place.reviewCount != null && <span className="text-[var(--amd-text-3)]">({place.reviewCount.toLocaleString()})</span>}
                </div>'''
if 'data-quality-mini' not in text:
    replacement = '''                  {place.reviewCount != null && <span className="text-[var(--amd-text-3)]">({place.reviewCount.toLocaleString()})</span>}
                </div>'''
    if rating_marker not in text: raise SystemExit('PlaceCard rating marker missing')
    text = text.replace(rating_marker, replacement, 1)
    anchor = '''            <div className="flex shrink-0 gap-2">'''
    mini = '''            <div data-quality-mini className="hidden min-w-0 flex-1 flex-col gap-0.5 sm:flex"><span className="text-[9px] font-semibold text-[var(--amd-text-2)]">Data {dataQuality.score}/100</span><span className="truncate text-[8px] text-[var(--amd-text-3)]">{ageLabel}</span></div>\n\n'''
    if anchor not in text: raise SystemExit('PlaceCard action marker missing')
    text = text.replace(anchor, mini + anchor, 1)
p.write_text(text, encoding='utf-8')

# Add quality badge and freshness visibility to PlaceDetail.
p = ROOT / 'components/PlaceDetail.tsx'
text = p.read_text(encoding='utf-8')
imp_marker = '} from "@/lib/place-utils";'
quality_imp = 'import { dataAgeLabel, scorePlaceDataQuality } from "@/lib/data-quality";'
if quality_imp not in text:
    text = text.replace(imp_marker, imp_marker + '\n' + quality_imp, 1)
state_marker = '  const parkingStatus = getParkingStatus(place);'
if 'const dataQuality = scorePlaceDataQuality(place);' not in text:
    text = text.replace(state_marker, state_marker + '\n  const dataQuality = scorePlaceDataQuality(place);\n  const dataFreshnessLabel = dataAgeLabel(place, language);', 1)
badge_marker = '''              <span className="rounded-xl border border-white/10 bg-white/[0.05] px-2.5 py-2 text-[10px] font-bold">{formatPrice(place)}</span>'''
if 'Data {dataQuality.score}' not in text:
    if badge_marker not in text: raise SystemExit('PlaceDetail badge marker missing')
    text = text.replace(badge_marker, badge_marker + '\n              <span className="rounded-xl border border-cyan-300/10 bg-cyan-300/[0.05] px-2.5 py-2 text-[10px] font-bold text-cyan-100">Data {dataQuality.score}/100</span>', 1)
row_marker = '''              <ValueRow label={copy.phoneNumber} value={place.phone || copy.unknownData} />'''
if 'dataFreshnessLabel' in text and 'label={language === "en" ? "Data freshness"' not in text:
    text = text.replace(row_marker, row_marker + '\n              <ValueRow label={language === "en" ? "Data freshness" : "อัปเดตข้อมูล"} value={dataFreshnessLabel} />', 1)
p.write_text(text, encoding='utf-8')

tests = r'''import { describe, expect, it } from "vitest";
import { buildDataCompletenessDashboard, dataAgeLabel, scorePlaceDataQuality } from "@/lib/data-quality";
import type { Place } from "@/types/place";

function p(overrides: Partial<Place> = {}) {
  return {
    id: "p", name: "Shop", category: "cafe", categories: ["cafe"], googlePlaceId: null,
    latitude: 13.8, longitude: 100.5, address: "Bangkok", area: "Chatuchak",
    openingHours: { monday: "08:00-18:00", tuesday: null, wednesday: null, thursday: null, friday: null, saturday: null, sunday: null },
    is24Hours: false, phone: "021234567", priceText: "60–120 บาท", minPrice: 60, maxPrice: 120,
    averagePricePerPerson: 90, image: null, images: [], coverImage: null, imageMetadata: [],
    shortDescription: "Cafe", description: "Cafe", parking: { available: null, type: null, price: null, note: null },
    verified: true, lastVerified: "2026-09-01T00:00:00.000Z", lastChecked: "2026-09-01T00:00:00.000Z",
    source: ["seed"], fieldProvenance: {},
    ...overrides,
  } as Place;
}

describe("data quality", () => {
  it("penalizes missing identity/media/provenance fields without external requests", () => {
    const score = scorePlaceDataQuality(p());
    expect(score.score).toBeLessThan(100);
    expect(score.missing).toContain("googlePlaceId");
    expect(score.missing).toContain("photo");
  });
  it("improves when verified photo, Place ID and provenance are present", () => {
    const base = scorePlaceDataQuality(p()).score;
    const better = scorePlaceDataQuality(p({ googlePlaceId: "abc", imageMetadata: [{ url: "", source: "google_places", photoReference: "places/abc/photos/1", verified: true }], fieldProvenance: { phone: { source: "seed", checkedAt: "2026-09-01T00:00:00.000Z", confidence: "high" } } })).score;
    expect(better).toBeGreaterThan(base);
  });
  it("summarizes completeness across the dataset", () => {
    const dashboard = buildDataCompletenessDashboard([p(), p({ id: "p2", googlePlaceId: "x" })]);
    expect(dashboard.missingPlaceId).toBe(1);
    expect(dashboard.average).toBeGreaterThan(0);
  });
  it("formats local freshness labels", () => {
    const now = new Date("2026-09-08T00:00:00.000Z").getTime();
    expect(dataAgeLabel(p({ lastChecked: "2026-09-07T00:00:00.000Z" }), "th", now)).toContain("เมื่อวาน");
  });
});
'''
(ROOT / 'tests/data-quality.test.ts').write_text(tests, encoding='utf-8')

print('Data quality, completeness dashboard, and freshness labels staged')

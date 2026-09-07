from pathlib import Path

ROOT = Path('.')

engine = r'''import { freshnessState, recommendedRefreshDays, shouldRefresh } from "@/lib/data-governance";
import type { Place } from "@/types/place";

export type RefreshPriorityLevel = "critical" | "high" | "medium" | "low" | "current";

export type RefreshPriorityFactors = {
  possibleClosure: number;
  dataAge: number;
  missingKeyFields: number;
  engagement: number;
  volatility: number;
  verificationGap: number;
};

export type RefreshQueueItem = {
  place: Place;
  score: number;
  priority: RefreshPriorityLevel;
  ageDays: number | null;
  missingFields: string[];
  factors: RefreshPriorityFactors;
  reasons: string[];
  googleEligible: boolean;
};

export type RefreshQueueSummary = {
  items: RefreshQueueItem[];
  critical: RefreshQueueItem[];
  high: RefreshQueueItem[];
  medium: RefreshQueueItem[];
  low: RefreshQueueItem[];
  current: RefreshQueueItem[];
  recommended: RefreshQueueItem[];
};

const VOLATILE_CATEGORIES = new Set([
  "food", "local_food", "noodle", "thai_food", "isan_food", "japanese", "korean_food", "vietnamese_food",
  "cafe", "bar", "night_food", "mookata", "hotpot", "bbq", "chinese_food", "parking", "monthly_parking",
]);

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function placeDataAgeDays(place: Place, now = Date.now()) {
  const raw = place.lastChecked || place.lastUpdated || place.lastVerified;
  if (!raw) return null;
  const time = new Date(raw).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.floor((now - time) / 86_400_000));
}

function hasOpeningHours(place: Place) {
  if (place.is24Hours) return true;
  if (place.openingHoursText?.trim()) return true;
  return Object.values(place.openingHours || {}).some(Boolean);
}

function hasPrice(place: Place) {
  return Boolean(place.priceText?.trim()) || place.minPrice != null || place.maxPrice != null || place.averagePricePerPerson != null || Boolean(place.pricing?.displayText);
}

export function refreshMissingKeyFields(place: Place) {
  const missing: string[] = [];
  if (place.latitude == null || place.longitude == null) missing.push("coordinates");
  if (!place.googlePlaceId) missing.push("googlePlaceId");
  if (!place.address?.trim()) missing.push("address");
  if (!hasOpeningHours(place)) missing.push("openingHours");
  if (!place.phone?.trim()) missing.push("phone");
  if (!hasPrice(place)) missing.push("price");
  return missing;
}

function ageFactor(place: Place, ageDays: number | null) {
  if (ageDays == null) return 1;
  if (ageDays > 120) return 1;
  if (ageDays > 90) return 0.9;
  if (ageDays > 60) return 0.7;
  if (ageDays > 30) return 0.45;
  const recommended = recommendedRefreshDays(place);
  if (ageDays >= recommended) return 0.35;
  return clamp01(ageDays / Math.max(60, recommended * 2)) * 0.25;
}

function engagementFactor(place: Place) {
  let score = 0;
  if (place.localFavorite) score += 0.55;
  if (place.recommended) score += 0.35;
  if ((place.reviewCount || 0) >= 100) score += 0.1;
  return clamp01(score);
}

function volatilityFactor(place: Place) {
  return place.categories.some((category) => VOLATILE_CATEGORIES.has(category)) ? 1 : 0.35;
}

function verificationGapFactor(place: Place, ageDays: number | null) {
  if (!place.verified) return 1;
  if (!place.lastVerified) return 0.7;
  if (ageDays == null) return 0.65;
  if (ageDays > 90) return 0.65;
  if (ageDays > 60) return 0.45;
  if (ageDays > 30) return 0.25;
  return 0;
}

export function scoreRefreshPriority(place: Place, now = Date.now()): RefreshQueueItem {
  const ageDays = placeDataAgeDays(place, now);
  const missingFields = refreshMissingKeyFields(place);
  const possibleClosure = place.temporaryClosed ? 1 : place.permanentlyClosed ? 0.35 : 0;
  const dataAge = ageFactor(place, ageDays);
  const missingKeyFields = clamp01(missingFields.length / 6);
  const engagement = engagementFactor(place);
  const volatility = volatilityFactor(place);
  const verificationGap = verificationGapFactor(place, ageDays);

  const score = Math.round(
    possibleClosure * 30 +
    dataAge * 25 +
    missingKeyFields * 15 +
    engagement * 10 +
    volatility * 10 +
    verificationGap * 10,
  );

  let priority: RefreshPriorityLevel = "current";
  if (place.temporaryClosed || score >= 75) priority = "critical";
  else if ((ageDays != null && ageDays > 90) || score >= 60) priority = "high";
  else if ((ageDays != null && ageDays > 60) || score >= 42) priority = "medium";
  else if ((ageDays != null && ageDays > 30) || shouldRefresh(place, now) || score >= 28) priority = "low";

  const reasons: string[] = [];
  if (place.temporaryClosed) reasons.push("possible closure");
  if (ageDays == null) reasons.push("never checked");
  else if (ageDays > 90) reasons.push(`checked ${ageDays} days ago`);
  else if (ageDays > 60) reasons.push(`checked ${ageDays} days ago`);
  else if (ageDays > 30) reasons.push(`checked ${ageDays} days ago`);
  if (missingFields.length) reasons.push(`missing ${missingFields.length} key field${missingFields.length === 1 ? "" : "s"}`);
  if (!place.verified) reasons.push("not verified");
  if (place.categories.some((category) => VOLATILE_CATEGORIES.has(category))) reasons.push("volatile category");
  if (place.localFavorite || place.recommended) reasons.push("high local relevance");
  if (!reasons.length && freshnessState(place, now) === "fresh") reasons.push("recently checked");

  return {
    place,
    score,
    priority,
    ageDays,
    missingFields,
    factors: { possibleClosure, dataAge, missingKeyFields, engagement, volatility, verificationGap },
    reasons,
    googleEligible: Boolean(place.googlePlaceId),
  };
}

const PRIORITY_ORDER: Record<RefreshPriorityLevel, number> = { critical: 4, high: 3, medium: 2, low: 1, current: 0 };

export function buildRefreshQueue(places: Place[], now = Date.now()): RefreshQueueSummary {
  const items = places.map((place) => scoreRefreshPriority(place, now)).sort((a, b) => {
    const priorityDelta = PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority];
    if (priorityDelta) return priorityDelta;
    if (b.score !== a.score) return b.score - a.score;
    const ageA = a.ageDays ?? Number.MAX_SAFE_INTEGER;
    const ageB = b.ageDays ?? Number.MAX_SAFE_INTEGER;
    if (ageB !== ageA) return ageB - ageA;
    return a.place.name.localeCompare(b.place.name);
  });
  const by = (priority: RefreshPriorityLevel) => items.filter((item) => item.priority === priority);
  const critical = by("critical");
  const high = by("high");
  const medium = by("medium");
  const low = by("low");
  const current = by("current");
  const recommended = items.filter((item) => item.priority !== "current" && item.googleEligible && !item.place.permanentlyClosed);
  return { items, critical, high, medium, low, current, recommended };
}

export function recommendedRefreshPlaces(places: Place[], maxItems = 50, now = Date.now()) {
  return buildRefreshQueue(places, now).recommended.slice(0, Math.max(0, maxItems)).map((item) => item.place);
}
'''
(ROOT / 'lib/refresh-priority.ts').write_text(engine, encoding='utf-8')

panel = ROOT / 'components/GoogleMaintenancePanel.tsx'
text = panel.read_text(encoding='utf-8')
import_marker = 'import { getGoogleApiControlSettings, requestUsageWarning, saveGoogleApiControlSettings } from "@/lib/google-api-control";'
refresh_import = 'import { buildRefreshQueue, recommendedRefreshPlaces } from "@/lib/refresh-priority";'
if refresh_import not in text:
    if import_marker not in text: raise SystemExit('API control import marker not found')
    text = text.replace(import_marker, import_marker + '\n' + refresh_import, 1)
text = text.replace('type RequestScope = "all" | "older30"', 'type RequestScope = "recommended" | "all" | "older30"', 1)
state_marker = '  const [scope, setScope] = useState<RequestScope>("older90");'
if state_marker not in text: raise SystemExit('scope state marker not found')
# Insert queue memo before requestPlaces to keep hook order deterministic.
request_marker = '  const requestPlaces = useMemo(() => {'
queue_memo = '''  const refreshQueue = useMemo(() => buildRefreshQueue(places), [places]);
  const recommendedPlaces = useMemo(() => recommendedRefreshPlaces(places, safetyLimit), [places, safetyLimit]);

  const requestPlaces = useMemo(() => {'''
if 'const refreshQueue = useMemo' not in text:
    if request_marker not in text: raise SystemExit('requestPlaces marker not found')
    text = text.replace(request_marker, queue_memo, 1)
request_start = '  const requestPlaces = useMemo(() => {\n    if (scope === "all") return places;'
request_new = '  const requestPlaces = useMemo(() => {\n    if (scope === "recommended") return recommendedPlaces;\n    if (scope === "all") return places;'
if 'if (scope === "recommended")' not in text:
    if request_start not in text: raise SystemExit('scope switch marker not found')
    text = text.replace(request_start, request_new, 1)
text = text.replace('  }, [places, scope, scopeCategory, scopeArea, selectedIds]);', '  }, [places, scope, scopeCategory, scopeArea, selectedIds, recommendedPlaces]);', 1)
estimate_marker = '  const estimate = useMemo(() => estimatePlaceDetailRequests(requestPlaces, safetyLimit), [requestPlaces, safetyLimit, usageVersion]);'
if estimate_marker not in text: raise SystemExit('estimate marker not found')
if 'const recommendedEstimate' not in text:
    text = text.replace(estimate_marker, estimate_marker + '\n  const recommendedEstimate = useMemo(() => estimatePlaceDetailRequests(recommendedPlaces, safetyLimit), [recommendedPlaces, safetyLimit, usageVersion]);', 1)
exec_marker = '  const executableCount = Math.min(estimate.batchRequests, remainingDaily);'
if 'recommendedExecutableCount' not in text:
    text = text.replace(exec_marker, exec_marker + '\n  const recommendedExecutableCount = Math.min(recommendedEstimate.batchRequests, remainingDaily);', 1)
function_marker = '  function requestRun() {\n    if (executableCount <= 0) return;'
function_new = '''  function requestRecommendedRun() {
    if (apiControl.locked || recommendedExecutableCount <= 0) return;
    setScope("recommended");
    setConfirmOpen(true);
  }

  function previewRecommended() {
    setScope("recommended");
    setPreviewOpen(true);
  }

  function requestRun() {
    if (executableCount <= 0) return;'''
if 'function requestRecommendedRun()' not in text:
    if function_marker not in text: raise SystemExit('requestRun marker not found')
    text = text.replace(function_marker, function_new, 1)

policy_close = '      {!apiKey && <p className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.06] px-3 py-2 text-[9px] text-amber-100">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not configured.</p>}\n\n      <div className="mt-4">'
queue_ui = r'''      {!apiKey && <p className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.06] px-3 py-2 text-[9px] text-amber-100">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not configured.</p>}

      <div data-testid="data-refresh-queue" className="mt-4 rounded-2xl border border-white/[0.07] bg-black/10 p-4">
        <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold">DATA REFRESH QUEUE</p><p className="mt-1 text-[8px] leading-4 text-white/34">{language === "en" ? "Priority is calculated locally from closure risk, age, missing fields, local relevance, category volatility and verification state." : "จัดลำดับในเครื่องจากความเสี่ยงปิดร้าน อายุข้อมูล ฟิลด์ที่ขาด ความสำคัญในระบบ ความผันผวนของหมวด และสถานะการยืนยัน"}</p></div><span className="rounded-full border border-cyan-300/15 bg-cyan-300/[0.05] px-2 py-1 text-[7px] font-bold text-cyan-200">0 API CALLS</span></div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{[
          ["CRITICAL", refreshQueue.critical.length, "text-rose-200"],
          ["HIGH", refreshQueue.high.length, "text-amber-100"],
          ["MEDIUM", refreshQueue.medium.length, "text-[#8ecbff]"],
          ["LOW", refreshQueue.low.length, "text-white/58"],
        ].map(([label, value, tone]) => <div key={String(label)} className="rounded-xl border border-white/[0.05] bg-white/[0.025] p-3"><p className={`text-[8px] font-bold ${tone}`}>{label}</p><p className="mt-1 text-[18px] font-bold">{value}</p></div>)}</div>
        <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.025] p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-[9px] font-bold">RECOMMENDED UPDATE BATCH</p><p className="mt-1 text-[8px] text-white/32">Highest-priority Google-linked records first. Missing Place IDs stay in Place ID Manager.</p></div><div className="text-right"><p className="text-[18px] font-bold text-[#19E6FF]">{recommendedPlaces.length}</p><p className="text-[7px] text-white/28">places</p></div></div><div className="mt-2 flex items-center justify-between text-[8px] text-white/38"><span>Estimated new requests</span><strong className="text-white/78">{recommendedEstimate.newRequests}</strong></div><div className="mt-3 flex gap-2"><button data-testid="refresh-queue-preview" type="button" disabled={!recommendedPlaces.length || Boolean(progress)} onClick={previewRecommended} className="amd-chip min-h-11 flex-1 px-3 text-[8px] font-bold disabled:opacity-35">Preview {recommendedEstimate.newRequests}</button><button data-testid="refresh-queue-run" type="button" disabled={!apiKey || apiControl.locked || recommendedExecutableCount <= 0 || Boolean(progress)} onClick={requestRecommendedRun} className="amd-btn amd-btn-primary min-h-11 flex-1 rounded-xl px-3 text-[8px] font-bold disabled:opacity-35">Run {recommendedExecutableCount} Requests</button></div><p className="mt-2 text-[7px] leading-4 text-white/26">Recommendation never auto-runs. Required flow: recommend → preview/confirm → explicit manual execute.</p></div>
        <details className="mt-3 rounded-xl border border-white/[0.05] bg-white/[0.02] p-3"><summary className="cursor-pointer text-[8px] font-semibold text-white/58">Top priority details</summary><div className="mt-2 space-y-2">{refreshQueue.items.filter((item) => item.priority !== "current").slice(0, 12).map((item) => <div key={item.place.id} className="flex items-start justify-between gap-3 border-b border-white/[0.04] pb-2 last:border-0"><div className="min-w-0"><p className="truncate text-[8px] font-semibold">{item.place.name}</p><p className="mt-1 truncate text-[7px] text-white/30">{item.reasons.join(" • ")}</p></div><div className="shrink-0 text-right"><p className="text-[8px] font-bold">{item.priority.toUpperCase()} · {item.score}</p><p className="mt-1 text-[7px] text-white/25">{item.googleEligible ? "Google ID ✓" : "No Place ID"}</p></div></div>)}</div></details>
      </div>

      <div className="mt-4">'''
if 'data-testid="data-refresh-queue"' not in text:
    if policy_close not in text: raise SystemExit('queue insertion marker not found')
    text = text.replace(policy_close, queue_ui, 1)
text = text.replace('          <option value="all">All Places</option>', '          <option value="recommended">Recommended Update Batch</option>\n          <option value="all">All Places</option>', 1)
panel.write_text(text, encoding='utf-8')

tests = r'''import { describe, expect, it } from "vitest";
import { buildRefreshQueue, recommendedRefreshPlaces, scoreRefreshPriority } from "@/lib/refresh-priority";
import type { Place } from "@/types/place";

const DAY = 86_400_000;
const NOW = new Date("2026-09-08T00:00:00.000Z").getTime();

function makePlace(overrides: Partial<Place> = {}): Place {
  return {
    id: "p1", googlePlaceId: "g1", name: "Refresh Test", nameEn: null, slug: "refresh-test", category: "cafe", categories: ["cafe"], subcategory: null,
    shortDescription: "", description: "", address: "Lat Phrao Bangkok", area: "Lat Phrao", soi: null, latitude: 13.82, longitude: 100.58,
    distanceKm: null, walkingMinutes: null, drivingMinutes: null, openingHours: { monday: "08:00-20:00", tuesday: "08:00-20:00", wednesday: "08:00-20:00", thursday: "08:00-20:00", friday: "08:00-20:00", saturday: "08:00-20:00", sunday: "08:00-20:00" }, is24Hours: false,
    priceLevel: 1, priceText: "60-100 THB", averagePricePerPerson: 80, minPrice: 60, maxPrice: 100, popularMenus: [], recommendedItems: [], tags: [], rating: 4.5, reviewCount: 120,
    phone: "021234567", line: null, facebook: null, instagram: null, website: "https://example.com", googleMapsUrl: null, image: null, images: [], paymentMethods: [], delivery: null, deliveryApps: [], dineIn: null, takeaway: null,
    parking: { available: null, type: null, price: null, note: null }, airConditioned: null, wifi: null, powerOutlet: null, toilet: null, petFriendly: null, wheelchairAccessible: null, openLate: null,
    studentFriendly: null, goodForWorking: null, recommended: false, localFavorite: false, verified: true, lastVerified: new Date(NOW - 10 * DAY).toISOString(), lastChecked: new Date(NOW - 10 * DAY).toISOString(), source: ["seed"], notes: null,
    ...overrides,
  };
}

describe("Smart Refresh Queue", () => {
  it("puts a temporary closure in CRITICAL", () => {
    const item = scoreRefreshPriority(makePlace({ temporaryClosed: true }), NOW);
    expect(item.priority).toBe("critical");
    expect(item.factors.possibleClosure).toBe(1);
  });

  it("orders older records ahead of younger records when otherwise equal", () => {
    const older90 = makePlace({ id: "old", lastChecked: new Date(NOW - 100 * DAY).toISOString(), lastVerified: new Date(NOW - 100 * DAY).toISOString() });
    const older60 = makePlace({ id: "mid", lastChecked: new Date(NOW - 70 * DAY).toISOString(), lastVerified: new Date(NOW - 70 * DAY).toISOString() });
    const older30 = makePlace({ id: "young", lastChecked: new Date(NOW - 40 * DAY).toISOString(), lastVerified: new Date(NOW - 40 * DAY).toISOString() });
    const queue = buildRefreshQueue([older30, older60, older90], NOW);
    expect(queue.items.map((item) => item.place.id)).toEqual(["old", "mid", "young"]);
    expect(queue.items[0].score).toBeGreaterThan(queue.items[2].score);
  });

  it("raises priority score when key data is missing", () => {
    const complete = scoreRefreshPriority(makePlace(), NOW);
    const incomplete = scoreRefreshPriority(makePlace({ address: null, phone: null, priceText: null, minPrice: null, maxPrice: null, averagePricePerPerson: null }), NOW);
    expect(incomplete.score).toBeGreaterThan(complete.score);
    expect(incomplete.missingFields).toContain("address");
    expect(incomplete.missingFields).toContain("price");
  });

  it("keeps missing Place IDs in the local queue but out of Google Place Details recommendations", () => {
    const missing = makePlace({ id: "missing", googlePlaceId: null, lastChecked: new Date(NOW - 120 * DAY).toISOString() });
    const linked = makePlace({ id: "linked", googlePlaceId: "g-linked", lastChecked: new Date(NOW - 120 * DAY).toISOString() });
    const queue = buildRefreshQueue([missing, linked], NOW);
    expect(queue.items.some((item) => item.place.id === "missing")).toBe(true);
    expect(recommendedRefreshPlaces([missing, linked], 50, NOW).map((place) => place.id)).toEqual(["linked"]);
  });

  it("is deterministic for identical inputs", () => {
    const a = makePlace({ id: "a", name: "Alpha", lastChecked: new Date(NOW - 100 * DAY).toISOString() });
    const b = makePlace({ id: "b", name: "Beta", lastChecked: new Date(NOW - 100 * DAY).toISOString() });
    expect(buildRefreshQueue([b, a], NOW).items.map((item) => item.id)).toEqual(buildRefreshQueue([b, a], NOW).items.map((item) => item.id));
  });
});
'''
# Fix deterministic test type property immediately by using place.id.
tests = tests.replace('.items.map((item) => item.id)', '.items.map((item) => item.place.id)')
(ROOT / 'tests/refresh-priority.test.ts').write_text(tests, encoding='utf-8')

e2e = r'''import { expect, test } from "@playwright/test";

test("Smart Refresh Queue preview is mobile safe and makes zero Google Places requests", async ({ page }) => {
  let googlePlacesRequests = 0;
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("places.googleapis.com") || url.includes("/maps/api/place") || url.includes("maps.googleapis.com/maps/api/place")) googlePlacesRequests += 1;
  });
  await page.goto("/settings");
  await page.getByRole("button", { name: "จัดการ", exact: true }).click();
  const queue = page.getByTestId("data-refresh-queue");
  await expect(queue).toBeVisible();
  const preview = queue.getByTestId("refresh-queue-preview");
  if (await preview.isEnabled()) {
    await preview.click();
    await expect(page.getByText("REQUEST PREVIEW")).toBeVisible();
    await page.getByRole("button", { name: "Close" }).last().click().catch(() => {});
  }
  await page.waitForTimeout(250);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(googlePlacesRequests).toBe(0);
});
'''
(ROOT / 'e2e/p0-smart-refresh-queue.spec.ts').write_text(e2e, encoding='utf-8')

print('P0 Smart Refresh Queue staged')

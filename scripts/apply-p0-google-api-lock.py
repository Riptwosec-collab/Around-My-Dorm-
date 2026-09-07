from pathlib import Path

ROOT = Path('.')

control = ROOT / 'lib/google-api-control.ts'
text = control.read_text(encoding='utf-8')
text = text.replace('export type GoogleApiControlSettings = {\n  batchLimit:', 'export type GoogleApiControlSettings = {\n  locked: boolean;\n  batchLimit:', 1)
text = text.replace('export const DEFAULT_GOOGLE_API_CONTROL: GoogleApiControlSettings = {\n  batchLimit: 50,', 'export const DEFAULT_GOOGLE_API_CONTROL: GoogleApiControlSettings = {\n  locked: false,\n  batchLimit: 50,', 1)
text = text.replace('  return {\n    batchLimit: allowedBatch(record.batchLimit),', '  return {\n    locked: record.locked === true,\n    batchLimit: allowedBatch(record.batchLimit),', 1)
old_save = '''  if (typeof localStorage !== "undefined") {
    try { localStorage.setItem(GOOGLE_API_CONTROL_KEY, JSON.stringify(next)); } catch {}
  }
  return next;
}'''
new_save = '''  if (typeof localStorage !== "undefined") {
    try { localStorage.setItem(GOOGLE_API_CONTROL_KEY, JSON.stringify(next)); } catch {}
  }
  if (typeof window !== "undefined") {
    try { window.dispatchEvent(new CustomEvent("amd-google-api-control-change", { detail: next })); } catch {}
  }
  return next;
}

export function googleApiRequestsLocked() {
  return getGoogleApiControlSettings().locked;
}

export function assertGoogleNetworkRequestsUnlocked() {
  if (googleApiRequestsLocked()) throw new Error("Google API requests are locked by the local safety control");
}'''
if old_save not in text and 'assertGoogleNetworkRequestsUnlocked' not in text:
    raise SystemExit('google-api-control save marker not found')
text = text.replace(old_save, new_save, 1)
control.write_text(text, encoding='utf-8')

manager = ROOT / 'lib/google-request-manager.ts'
text = manager.read_text(encoding='utf-8')
import_marker = 'import type { Place } from "@/types/place";'
lock_import = 'import { assertGoogleNetworkRequestsUnlocked } from "@/lib/google-api-control";'
if lock_import not in text:
    if import_marker not in text: raise SystemExit('manager import marker not found')
    text = text.replace(import_marker, import_marker + '\n' + lock_import, 1)
queue_marker = '  const logicalRequests = queue.length;\n  const details:'
if 'if (logicalRequests > 0) assertGoogleNetworkRequestsUnlocked();' not in text:
    if queue_marker not in text: raise SystemExit('batch logicalRequests marker not found')
    text = text.replace(queue_marker, '  const logicalRequests = queue.length;\n  if (logicalRequests > 0) assertGoogleNetworkRequestsUnlocked();\n  const details:', 1)
retry_marker = '  const queue = input.failures.slice(0, Math.min(safetyLimit, remainingDaily));\n  const details:'
if 'if (queue.length > 0) assertGoogleNetworkRequestsUnlocked();' not in text:
    if retry_marker not in text: raise SystemExit('retry queue marker not found')
    text = text.replace(retry_marker, '  const queue = input.failures.slice(0, Math.min(safetyLimit, remainingDaily));\n  if (queue.length > 0) assertGoogleNetworkRequestsUnlocked();\n  const details:', 1)
search_marker = '  if (!fromCache && usage.today >= dailyLimit) throw new Error("Daily manual Google request limit reached");\n  const started = nowMs();'
if 'if (!fromCache) assertGoogleNetworkRequestsUnlocked();' not in text:
    if search_marker not in text: raise SystemExit('text search limit marker not found')
    text = text.replace(search_marker, '  if (!fromCache && usage.today >= dailyLimit) throw new Error("Daily manual Google request limit reached");\n  if (!fromCache) assertGoogleNetworkRequestsUnlocked();\n  const started = nowMs();', 1)
manager.write_text(text, encoding='utf-8')

panel = ROOT / 'components/GoogleMaintenancePanel.tsx'
text = panel.read_text(encoding='utf-8')
policy_marker = '      <div className="mt-3 rounded-xl border border-white/[0.07] bg-black/10 p-3 text-[8px] leading-4 text-white/38">Policy: <strong className="text-white/70">GOOGLE_REQUEST_MODE = {GOOGLE_REQUEST_MODE}</strong> • Google Maps rendering is separate from Google Places discovery/detail requests.</div>'
lock_ui = r'''      <div className="mt-3 rounded-xl border border-white/[0.07] bg-black/10 p-3 text-[8px] leading-4 text-white/38">Policy: <strong className="text-white/70">GOOGLE_REQUEST_MODE = {GOOGLE_REQUEST_MODE}</strong> • Google Maps rendering is separate from Google Places discovery/detail requests.</div>

      <div data-testid="google-api-request-lock" className={`mt-3 rounded-2xl border p-4 ${apiControl.locked ? "border-rose-300/20 bg-rose-300/[0.055]" : "border-emerald-300/15 bg-emerald-300/[0.04]"}`}>
        <div className="flex items-center justify-between gap-3"><div><p className="text-[9px] font-bold">GOOGLE API REQUEST LOCK</p><p className={`mt-1 text-[13px] font-extrabold ${apiControl.locked ? "text-rose-200" : "text-emerald-200"}`}>{apiControl.locked ? "LOCKED" : "UNLOCKED"}</p></div><ShieldCheck className={`h-5 w-5 ${apiControl.locked ? "text-rose-200" : "text-emerald-200"}`} /></div>
        <p className="mt-2 text-[8px] leading-4 text-white/38">{apiControl.locked ? (language === "en" ? "All Google Places network requests are blocked. Google Map rendering remains available." : "Google Places network request ทุกชนิดถูกบล็อก แต่ Google Map ยังแสดงผลได้") : (language === "en" ? "Manual Google requests are permitted only after explicit Run actions." : "อนุญาตเฉพาะ Google Request ที่ผู้ดูแลกด Run เอง")}</p>
        <button data-testid="google-api-lock-toggle" type="button" disabled={Boolean(progress)} onClick={() => updateApiControl({ locked: !apiControl.locked })} className={`mt-3 min-h-11 w-full rounded-xl border px-4 text-[9px] font-extrabold ${apiControl.locked ? "border-white/10 bg-white/[0.05] text-white/78" : "border-rose-300/20 bg-rose-300/[0.07] text-rose-100"}`}>{apiControl.locked ? (language === "en" ? "UNLOCK REQUESTS" : "UNLOCK REQUESTS") : (language === "en" ? "LOCK GOOGLE REQUESTS" : "LOCK GOOGLE REQUESTS")}</button>
      </div>'''
if 'data-testid="google-api-request-lock"' not in text:
    if policy_marker not in text: raise SystemExit('panel policy marker not found')
    text = text.replace(policy_marker, lock_ui, 1)
text = text.replace('disabled={!apiKey || executableCount <= 0 || Boolean(progress)} onClick={requestRun}', 'disabled={!apiKey || apiControl.locked || executableCount <= 0 || Boolean(progress)} onClick={requestRun}', 1)
text = text.replace('disabled={Boolean(progress)} onClick={() => void runFailedRetry()}', 'disabled={apiControl.locked || Boolean(progress)} onClick={() => void runFailedRetry()}', 1)
text = text.replace('<button type="button" onClick={() => { const place = singlePlace; setSinglePlace(null); void executeBatch([place]); }} className="amd-btn amd-btn-primary flex-1 rounded-xl text-[9px] font-bold">Run 1 Request</button>', '<button type="button" disabled={apiControl.locked} onClick={() => { const place = singlePlace; setSinglePlace(null); void executeBatch([place]); }} className="amd-btn amd-btn-primary flex-1 rounded-xl text-[9px] font-bold disabled:opacity-35">{apiControl.locked ? "Requests Locked" : "Run 1 Request"}</button>', 1)
panel.write_text(text, encoding='utf-8')

place_manager = ROOT / 'components/GooglePlaceIdManager.tsx'
text = place_manager.read_text(encoding='utf-8')
text = text.replace('import { useMemo, useState } from "react";', 'import { useEffect, useMemo, useState } from "react";', 1)
import_marker = 'import type { Place } from "@/types/place";'
lock_import = 'import { getGoogleApiControlSettings } from "@/lib/google-api-control";'
if lock_import not in text:
    if import_marker not in text: raise SystemExit('PlaceIdManager import marker not found')
    text = text.replace(import_marker, import_marker + '\n' + lock_import, 1)
state_marker = '  const [threshold, setThreshold] = useState(() => loadMatchConfidenceThreshold(DEFAULT_MATCH_CONFIDENCE_THRESHOLD));'
state_new = '''  const [threshold, setThreshold] = useState(() => loadMatchConfidenceThreshold(DEFAULT_MATCH_CONFIDENCE_THRESHOLD));
  const [apiLocked, setApiLocked] = useState(() => getGoogleApiControlSettings().locked);

  useEffect(() => {
    const syncLock = () => setApiLocked(getGoogleApiControlSettings().locked);
    window.addEventListener("amd-google-api-control-change", syncLock);
    return () => window.removeEventListener("amd-google-api-control-change", syncLock);
  }, []);'''
if 'const [apiLocked, setApiLocked]' not in text:
    if state_marker not in text: raise SystemExit('PlaceIdManager threshold marker not found')
    text = text.replace(state_marker, state_new, 1)
text = text.replace('disabled={!apiKey || !matchCenter || searching} onClick={() => void runMatchSearch()}', 'disabled={!apiKey || apiLocked || !matchCenter || searching} onClick={() => void runMatchSearch()}', 1)
button_label = 'searching ? (language === "en" ? "Searching…" : "กำลังค้นหา…") : estimate?.newRequests === 0 && estimate?.cacheHits ?'
if 'apiLocked ? (language === "en" ? "Google Requests Locked"' not in text:
    text = text.replace(button_label, 'apiLocked ? (language === "en" ? "Google Requests Locked" : "Google Requests Locked") : ' + button_label, 1)
place_manager.write_text(text, encoding='utf-8')

tests = r'''import { beforeEach, describe, expect, it, vi } from "vitest";
import { getGoogleApiControlSettings, saveGoogleApiControlSettings } from "@/lib/google-api-control";
import { runGoogleRequestBatch, runGoogleTextSearchRequest } from "@/lib/google-request-manager";
import type { Place } from "@/types/place";

function linkedPlace(): Place {
  return {
    id: "lock-test", googlePlaceId: "g-lock", name: "Lock Test", nameEn: null, slug: "lock-test", category: "cafe", categories: ["cafe"], subcategory: null,
    shortDescription: "", description: "", address: "Bangkok", area: "Bangkok", soi: null, latitude: 13.8, longitude: 100.5, distanceKm: null, walkingMinutes: null, drivingMinutes: null,
    openingHours: { monday: null, tuesday: null, wednesday: null, thursday: null, friday: null, saturday: null, sunday: null }, is24Hours: false, priceLevel: null, priceText: null,
    averagePricePerPerson: null, minPrice: null, maxPrice: null, popularMenus: [], recommendedItems: [], tags: [], rating: null, reviewCount: null, phone: null, line: null, facebook: null,
    instagram: null, website: null, googleMapsUrl: null, image: null, images: [], paymentMethods: [], delivery: null, deliveryApps: [], dineIn: null, takeaway: null, parking: { available: null, type: null, price: null, note: null },
    airConditioned: null, wifi: null, powerOutlet: null, toilet: null, petFriendly: null, wheelchairAccessible: null, openLate: null, studentFriendly: null, goodForWorking: null,
    recommended: false, localFavorite: false, verified: false, lastVerified: null, source: ["test"], notes: null,
  };
}

describe("Google API hard request lock", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("persists locked state", () => {
    saveGoogleApiControlSettings({ locked: true });
    expect(getGoogleApiControlSettings().locked).toBe(true);
  });

  it("blocks Place Details before any network call", async () => {
    saveGoogleApiControlSettings({ locked: true });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(runGoogleRequestBatch({ apiKey: "test", places: [linkedPlace()], safetyLimit: 1 })).rejects.toThrow(/locked/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("blocks Text Search before any network call", async () => {
    saveGoogleApiControlSettings({ locked: true });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(runGoogleTextSearchRequest({ apiKey: "test", query: "cafe", center: { lat: 13.8, lng: 100.5 }, radiusMeters: 1000 })).rejects.toThrow(/locked/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
'''
(ROOT / 'tests/google-api-lock.test.ts').write_text(tests, encoding='utf-8')

static_test = r'''import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

describe("Google request architecture guard", () => {
  it("keeps low-level Google Places network functions behind the request manager", () => {
    const candidates = [...walk("components"), ...walk("lib")].filter((file) => /\.(ts|tsx)$/.test(file));
    const allowed = new Set([path.normalize("lib/google-live.ts"), path.normalize("lib/google-request-manager.ts")]);
    for (const file of candidates) {
      if (allowed.has(path.normalize(file))) continue;
      const source = fs.readFileSync(file, "utf8");
      expect(source, `${file} bypasses Google request manager`).not.toMatch(/\b(discoverGooglePlaces|fetchGoogleLiveDetails)\s*\(/);
    }
  });
});
'''
(ROOT / 'tests/google-request-architecture.test.ts').write_text(static_test, encoding='utf-8')

e2e = r'''import { expect, test } from "@playwright/test";

test("Google request emergency lock persists and toggling it makes zero Places calls", async ({ page }) => {
  let googlePlacesRequests = 0;
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("places.googleapis.com") || url.includes("/maps/api/place") || url.includes("maps.googleapis.com/maps/api/place")) googlePlacesRequests += 1;
  });
  await page.goto("/settings");
  await page.getByRole("button", { name: "จัดการ", exact: true }).click();
  const lock = page.getByTestId("google-api-request-lock");
  await expect(lock).toBeVisible();
  const toggle = page.getByTestId("google-api-lock-toggle");
  await toggle.click();
  await expect(lock.getByText("LOCKED", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "จัดการ", exact: true }).click();
  await expect(page.getByTestId("google-api-request-lock").getByText("LOCKED", { exact: true })).toBeVisible();
  await page.getByTestId("google-api-lock-toggle").click();
  await expect(page.getByTestId("google-api-request-lock").getByText("UNLOCKED", { exact: true })).toBeVisible();
  await page.waitForTimeout(200);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(googlePlacesRequests).toBe(0);
});
'''
(ROOT / 'e2e/p0-google-api-lock.spec.ts').write_text(e2e, encoding='utf-8')

print('P0 hard Google API lock staged')

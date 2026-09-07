from pathlib import Path

ROOT = Path('.')

control_lib = r'''export type GoogleApiControlSettings = {
  batchLimit: 10 | 25 | 50 | 100;
  dailyWarningLimit: number;
  monthlyWarningLimit: number;
};

export type UsageWarningLevel = 0 | 75 | 90 | 100;

export const GOOGLE_API_CONTROL_KEY = "around-dorm-google-api-control-v1";
export const GOOGLE_API_BATCH_OPTIONS = [10, 25, 50, 100] as const;
export const DEFAULT_GOOGLE_API_CONTROL: GoogleApiControlSettings = {
  batchLimit: 50,
  dailyWarningLimit: 200,
  monthlyWarningLimit: 2000,
};

function allowedBatch(value: unknown): GoogleApiControlSettings["batchLimit"] {
  const parsed = Number(value);
  return (GOOGLE_API_BATCH_OPTIONS as readonly number[]).includes(parsed) ? parsed as GoogleApiControlSettings["batchLimit"] : DEFAULT_GOOGLE_API_CONTROL.batchLimit;
}

function positiveInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) && parsed >= min ? Math.min(parsed, max) : fallback;
}

export function sanitizeGoogleApiControlSettings(value: unknown): GoogleApiControlSettings {
  const record = value && typeof value === "object" ? value as Partial<GoogleApiControlSettings> : {};
  return {
    batchLimit: allowedBatch(record.batchLimit),
    dailyWarningLimit: positiveInteger(record.dailyWarningLimit, DEFAULT_GOOGLE_API_CONTROL.dailyWarningLimit, 1, 100000),
    monthlyWarningLimit: positiveInteger(record.monthlyWarningLimit, DEFAULT_GOOGLE_API_CONTROL.monthlyWarningLimit, 1, 1000000),
  };
}

export function getGoogleApiControlSettings(): GoogleApiControlSettings {
  if (typeof localStorage === "undefined") return DEFAULT_GOOGLE_API_CONTROL;
  try {
    return sanitizeGoogleApiControlSettings(JSON.parse(localStorage.getItem(GOOGLE_API_CONTROL_KEY) || "null"));
  } catch {
    return DEFAULT_GOOGLE_API_CONTROL;
  }
}

export function saveGoogleApiControlSettings(patch: Partial<GoogleApiControlSettings>) {
  const next = sanitizeGoogleApiControlSettings({ ...getGoogleApiControlSettings(), ...patch });
  if (typeof localStorage !== "undefined") {
    try { localStorage.setItem(GOOGLE_API_CONTROL_KEY, JSON.stringify(next)); } catch {}
  }
  return next;
}

export function requestUsageWarning(used: number, limit: number) {
  const safeLimit = Math.max(1, limit);
  const percent = Math.max(0, Math.round((Math.max(0, used) / safeLimit) * 100));
  const level: UsageWarningLevel = percent >= 100 ? 100 : percent >= 90 ? 90 : percent >= 75 ? 75 : 0;
  return { used: Math.max(0, used), limit: safeLimit, percent, level };
}
'''

(ROOT / 'lib/google-api-control.ts').write_text(control_lib, encoding='utf-8')

manager = ROOT / 'lib/google-request-manager.ts'
text = manager.read_text(encoding='utf-8')
usage_type_old = '''export type GoogleRequestUsage = {
  session: number;
  today: number;
  month: number;
  placeDetails: number;
  textSearch: number;
  other: number;
};'''
usage_type_new = '''export type GoogleRequestUsage = {
  session: number;
  today: number;
  month: number;
  placeDetails: number;
  textSearch: number;
  other: number;
  failedRequests: number;
  retries: number;
  networkAttempts: number;
};'''
if usage_type_old not in text and usage_type_new not in text:
    raise SystemExit('GoogleRequestUsage type marker not found')
text = text.replace(usage_type_old, usage_type_new, 1)
return_old = '''  return {
    session,
    today: attempts(logs.filter((item) => item.timestamp.startsWith(today))),
    month: attempts(logs.filter((item) => item.timestamp.startsWith(month))),
    placeDetails: byType("place_details"),
    textSearch: byType("text_search"),
    other: byType("other"),
  };'''
return_new = '''  return {
    session,
    today: attempts(logs.filter((item) => item.timestamp.startsWith(today))),
    month: attempts(logs.filter((item) => item.timestamp.startsWith(month))),
    placeDetails: byType("place_details"),
    textSearch: byType("text_search"),
    other: byType("other"),
    failedRequests: logs.filter((item) => item.status === "failed").length,
    retries: logs.reduce((sum, item) => sum + (item.retryCount || 0), 0),
    networkAttempts: attempts(logs),
  };'''
if return_old not in text and return_new not in text:
    raise SystemExit('GoogleRequestUsage return marker not found')
text = text.replace(return_old, return_new, 1)
manager.write_text(text, encoding='utf-8')

panel = ROOT / 'components/GoogleMaintenancePanel.tsx'
text = panel.read_text(encoding='utf-8')
text = text.replace('  DEFAULT_GOOGLE_MONTHLY_WARNING,\n', '', 1)
text = text.replace('  DEFAULT_GOOGLE_BATCH_LIMIT,\n', '', 1)
import_marker = 'import { CATEGORIES } from "@/data/categories";'
control_import = 'import { getGoogleApiControlSettings, requestUsageWarning, saveGoogleApiControlSettings } from "@/lib/google-api-control";'
if control_import not in text:
    if import_marker not in text: raise SystemExit('CATEGORIES import marker not found')
    text = text.replace(import_marker, import_marker + '\n' + control_import, 1)
state_old = '  const [safetyLimit, setSafetyLimit] = useState(DEFAULT_GOOGLE_BATCH_LIMIT);'
state_new = '  const [apiControl, setApiControl] = useState(() => getGoogleApiControlSettings());\n  const safetyLimit = apiControl.batchLimit;'
if state_old not in text and state_new not in text: raise SystemExit('safetyLimit state marker not found')
text = text.replace(state_old, state_new, 1)
large_marker = '  const strongWarning = estimate.newRequests >= 100;'
large_new = '''  const strongWarning = estimate.newRequests >= 100;
  const dailyWarning = useMemo(() => requestUsageWarning(usage.today, apiControl.dailyWarningLimit), [usage.today, apiControl.dailyWarningLimit]);
  const monthlyWarning = useMemo(() => requestUsageWarning(usage.month, apiControl.monthlyWarningLimit), [usage.month, apiControl.monthlyWarningLimit]);

  function updateApiControl(patch: Partial<typeof apiControl>) {
    setApiControl(saveGoogleApiControlSettings(patch));
  }'''
if large_marker not in text and 'const dailyWarning = useMemo' not in text: raise SystemExit('strong warning marker not found')
text = text.replace(large_marker, large_new, 1)
text = text.replace('<section className="amd-glass amd-card mt-4 p-4">\n      <div className="flex items-start justify-between gap-3">', '<section data-testid="google-api-control-center" className="amd-glass amd-card mt-4 p-4">\n      <div className="flex items-start justify-between gap-3">', 1)
text = text.replace('GOOGLE API REQUEST CONTROL', 'GOOGLE API CONTROL CENTER', 1)
text = text.replace('onChange={(event) => setSafetyLimit(Number(event.target.value))}', 'data-testid="google-api-batch-limit" onChange={(event) => updateApiControl({ batchLimit: Number(event.target.value) as typeof apiControl.batchLimit })}', 1)

usage_start = text.find('      <div className="mt-4 rounded-2xl border border-white/[0.07] bg-black/10 p-3">\n        <p className="text-[9px] font-bold">Google API Usage')
usage_end = text.find('\n\n      {progress &&', usage_start)
if usage_start < 0 or usage_end < 0:
    raise SystemExit('Google API Usage block not found')
usage_block = r'''      <div className="mt-4 rounded-2xl border border-white/[0.07] bg-black/10 p-3">
        <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold">GOOGLE API USAGE</p><p className="mt-1 text-[8px] text-white/30">Local request tracking • not official Google Billing usage</p></div><span className="rounded-full border border-cyan-300/15 bg-cyan-300/[0.05] px-2 py-1 text-[7px] font-bold text-cyan-200">LOCAL COUNTERS</span></div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{[
          ["Today", usage.today], ["This Month", usage.month], ["Place Details", usage.placeDetails], ["Text Search", usage.textSearch], ["Failed Requests", usage.failedRequests], ["Retries", usage.retries], ["Network Attempts", usage.networkAttempts], ["This Session", usage.session],
        ].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-white/[0.035] p-2"><p className="text-[7px] text-white/28">{label}</p><p className="mt-1 text-[15px] font-bold">{value}</p></div>)}</div>

        <div className="mt-4 border-t border-white/[0.06] pt-3">
          <p className="text-[9px] font-bold">REQUEST SAFETY LIMITS</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <label className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-2"><span className="text-[7px] text-white/30">Maximum per batch</span><select data-testid="api-control-batch-setting" value={apiControl.batchLimit} disabled={Boolean(progress)} onChange={(event) => updateApiControl({ batchLimit: Number(event.target.value) as typeof apiControl.batchLimit })} className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-[#07111f] px-2 text-[9px]">{GOOGLE_BATCH_LIMIT_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-2"><span className="text-[7px] text-white/30">Daily warning limit</span><input data-testid="api-control-daily-warning" type="number" min={1} value={apiControl.dailyWarningLimit} onChange={(event) => updateApiControl({ dailyWarningLimit: Number(event.target.value) })} className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-[#07111f] px-2 text-[9px]" /></label>
            <label className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-2"><span className="text-[7px] text-white/30">Monthly warning limit</span><input data-testid="api-control-monthly-warning" type="number" min={1} value={apiControl.monthlyWarningLimit} onChange={(event) => updateApiControl({ monthlyWarningLimit: Number(event.target.value) })} className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-[#07111f] px-2 text-[9px]" /></label>
          </div>
          <p className="mt-2 text-[8px] leading-4 text-white/28">Default batch size is 50. Limits are never increased automatically. Existing execution ceiling remains {DEFAULT_GOOGLE_DAILY_LIMIT} requests/day.</p>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">{[["Daily request warning", dailyWarning], ["Monthly request warning", monthlyWarning]].map(([label, warning]) => { const item = warning as typeof dailyWarning; const warnClass = item.level >= 100 ? "border-rose-300/15 bg-rose-300/[0.05] text-rose-100" : item.level >= 90 ? "border-amber-300/20 bg-amber-300/[0.06] text-amber-100" : item.level >= 75 ? "border-amber-300/10 bg-amber-300/[0.035] text-amber-100" : "border-white/[0.06] bg-white/[0.025] text-white/55"; return <div key={String(label)} className={`rounded-xl border p-3 ${warnClass}`}><div className="flex items-center justify-between gap-2"><p className="text-[8px] font-semibold">{String(label)}</p><strong className="text-[11px]">{item.percent}%</strong></div><p className="mt-1 text-[8px]">{item.used.toLocaleString()} / {item.limit.toLocaleString()}</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-current opacity-70" style={{ width: `${Math.min(100, item.percent)}%` }} /></div>{item.level >= 90 && <p className="mt-2 text-[8px] leading-4">{language === "en" ? "Google API usage is approaching your configured safety threshold." : "การใช้งาน Google API กำลังเข้าใกล้ Safety Threshold ที่กำหนด"}</p>}</div>; })}</div>
      </div>'''
text = text[:usage_start] + usage_block + text[usage_end:]
panel.write_text(text, encoding='utf-8')

tests = r'''import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_GOOGLE_API_CONTROL, getGoogleApiControlSettings, requestUsageWarning, saveGoogleApiControlSettings, sanitizeGoogleApiControlSettings } from "@/lib/google-api-control";
import { getGoogleRequestUsage } from "@/lib/google-request-manager";

describe("Google API Control Center policy", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("defaults to bounded request controls", () => {
    expect(getGoogleApiControlSettings()).toEqual(DEFAULT_GOOGLE_API_CONTROL);
    expect(DEFAULT_GOOGLE_API_CONTROL.batchLimit).toBe(50);
    expect(DEFAULT_GOOGLE_API_CONTROL.dailyWarningLimit).toBe(200);
    expect(DEFAULT_GOOGLE_API_CONTROL.monthlyWarningLimit).toBe(2000);
  });

  it("accepts only supported batch sizes and persists controls", () => {
    expect(sanitizeGoogleApiControlSettings({ batchLimit: 999 }).batchLimit).toBe(50);
    saveGoogleApiControlSettings({ batchLimit: 25, dailyWarningLimit: 150, monthlyWarningLimit: 1500 });
    expect(getGoogleApiControlSettings()).toEqual({ batchLimit: 25, dailyWarningLimit: 150, monthlyWarningLimit: 1500 });
  });

  it("reports 75, 90 and 100 percent warning bands", () => {
    expect(requestUsageWarning(74, 100).level).toBe(0);
    expect(requestUsageWarning(75, 100).level).toBe(75);
    expect(requestUsageWarning(90, 100).level).toBe(90);
    expect(requestUsageWarning(100, 100).level).toBe(100);
  });

  it("derives failed, retry and network counters from local logs", () => {
    const now = new Date().toISOString();
    localStorage.setItem("around-dorm-google-request-log-v1", JSON.stringify([
      { id: "a", timestamp: now, requestType: "place_details", status: "success", attempted: 1, retryCount: 0 },
      { id: "b", timestamp: now, requestType: "text_search", status: "failed", attempted: 1, retryCount: 0 },
      { id: "c", timestamp: now, requestType: "place_details", status: "failed", attempted: 1, retryCount: 1 },
    ]));
    const usage = getGoogleRequestUsage();
    expect(usage.failedRequests).toBe(2);
    expect(usage.retries).toBe(1);
    expect(usage.networkAttempts).toBe(3);
    expect(usage.placeDetails).toBe(2);
    expect(usage.textSearch).toBe(1);
  });
});
'''
(ROOT / 'tests/google-api-control.test.ts').write_text(tests, encoding='utf-8')

e2e = r'''import { expect, test } from "@playwright/test";

test("API Control Center settings are mobile safe and local-only", async ({ page }) => {
  let googlePlacesRequests = 0;
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("places.googleapis.com") || url.includes("/maps/api/place") || url.includes("maps.googleapis.com/maps/api/place")) googlePlacesRequests += 1;
  });
  await page.goto("/settings");
  await page.getByRole("button", { name: "จัดการ", exact: true }).click();
  const control = page.getByTestId("google-api-control-center");
  await expect(control).toBeVisible();
  await control.getByTestId("api-control-batch-setting").selectOption("25");
  await control.getByTestId("api-control-daily-warning").fill("180");
  await control.getByTestId("api-control-monthly-warning").fill("1800");
  await page.waitForTimeout(250);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(googlePlacesRequests).toBe(0);
});
'''
(ROOT / 'e2e/p0-api-control-center.spec.ts').write_text(e2e, encoding='utf-8')

print('P0 Google API Control Center staged')

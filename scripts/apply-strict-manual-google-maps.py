from pathlib import Path
import re

ROOT = Path('.')

def write(path: str, content: str):
    p = ROOT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding='utf-8')

def replace_once(path: str, old: str, new: str):
    p = ROOT / path
    text = p.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'Pattern not found in {path}: {old[:180]!r}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')

def replace_regex(path: str, pattern: str, replacement: str):
    p = ROOT / path
    text = p.read_text(encoding='utf-8')
    next_text, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f'Regex did not match exactly once in {path}: {pattern[:160]!r} -> {count}')
    p.write_text(next_text, encoding='utf-8')

write('lib/google-map-cost-control.ts', r'''export const GOOGLE_DYNAMIC_MAP_MONTHLY_TARGET = 10_000;
export const GOOGLE_DYNAMIC_MAP_WARNING = 8_000;
export const GOOGLE_DYNAMIC_MAP_HIGH = 9_000;
export const GOOGLE_DYNAMIC_MAP_CRITICAL = 9_500;
export const DEFAULT_GOOGLE_MAPS_MONTHLY_SOFT_LIMIT = 9_500;

export type GoogleDynamicMapSafetyLevel = "safe" | "warning" | "high" | "critical" | "reached";

export function googleMapsMonthlySoftLimit(raw = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MONTHLY_SOFT_LIMIT) {
  const parsed = Math.round(Number(raw));
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_GOOGLE_MAPS_MONTHLY_SOFT_LIMIT;
  return Math.min(parsed, GOOGLE_DYNAMIC_MAP_MONTHLY_TARGET);
}

export function googleDynamicMapSafetyState(monthlyLoads: number, softLimit = googleMapsMonthlySoftLimit()) {
  const used = Math.max(0, Math.round(Number(monthlyLoads) || 0));
  const target = GOOGLE_DYNAMIC_MAP_MONTHLY_TARGET;
  const percent = Math.min(100, Math.round((used / target) * 100));
  const level: GoogleDynamicMapSafetyLevel = used >= target ? "reached" : used >= GOOGLE_DYNAMIC_MAP_CRITICAL ? "critical" : used >= GOOGLE_DYNAMIC_MAP_HIGH ? "high" : used >= GOOGLE_DYNAMIC_MAP_WARNING ? "warning" : "safe";
  const blockedBySoftLimit = used >= Math.max(1, softLimit);
  const requiresConfirmation = used >= GOOGLE_DYNAMIC_MAP_CRITICAL || used >= softLimit;
  const message = level === "reached"
    ? "MONTHLY FREE CAP TARGET REACHED"
    : level === "critical"
      ? "CRITICAL — approximately 95% of the monthly target is used."
      : level === "high"
        ? "HIGH — approximately 90% of the monthly target is used."
        : level === "warning"
          ? "WARNING — approximately 80% of the monthly Dynamic Maps free usage target is used."
          : "SAFE";
  return { used, target, percent, level, message, softLimit, blockedBySoftLimit, requiresConfirmation };
}

export function googleExternalMapsUrl(input: { lat: number; lng: number; label?: string }) {
  const query = input.label?.trim() || `${input.lat},${input.lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
''')

write('components/GoogleMapsUsageDashboard.tsx', r'''"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Gauge, ShieldCheck } from "lucide-react";
import { googleDynamicMapSafetyState, googleMapsMonthlySoftLimit } from "@/lib/google-map-cost-control";
import { getGoogleRequestUsage, hydrateGoogleRequestLogs } from "@/lib/google-request-manager";

function formatWhen(value: string | null, language: "th" | "en") {
  if (!value) return language === "en" ? "Never" : "ยังไม่เคย";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(language === "en" ? "en-GB" : "th-TH", { dateStyle: "medium", timeStyle: "short" });
}

export function GoogleMapsUsageDashboard({ language }: { language: "th" | "en" }) {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    void hydrateGoogleRequestLogs().finally(() => { if (active) setVersion((value) => value + 1); });
    const sync = () => setVersion((value) => value + 1);
    window.addEventListener("amd-google-usage-change", sync);
    return () => { active = false; window.removeEventListener("amd-google-usage-change", sync); };
  }, []);
  const usage = useMemo(() => getGoogleRequestUsage(), [version]);
  const safety = useMemo(() => googleDynamicMapSafetyState(usage.dynamicMapMonth, googleMapsMonthlySoftLimit()), [usage.dynamicMapMonth]);
  const tone = safety.level === "safe" ? "text-emerald-200" : safety.level === "warning" ? "text-amber-100" : safety.level === "high" ? "text-orange-200" : "text-rose-200";

  return (
    <section data-testid="google-maps-usage-dashboard" className="amd-glass amd-card mt-4 p-4">
      <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Gauge className="h-5 w-5 text-[#00D9FF]" /><p className="text-[11px] font-bold">GOOGLE MAPS USAGE</p></div><p className="mt-1 text-[8px] leading-4 text-white/38">{language === "en" ? "Application-side estimated counter — not the official Google billing counter." : "ตัวนับโดยประมาณฝั่งแอป — ไม่ใช่ตัวเลข Billing อย่างเป็นทางการของ Google"}</p></div><ShieldCheck className="h-5 w-5 text-[#00E5C3]" /></div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-2xl border border-white/[0.06] bg-black/10 p-3"><p className="text-[8px] text-white/35">Dynamic Map Loads — Today</p><p className="mt-1 text-[20px] font-bold">{usage.dynamicMapToday}</p></div>
        <div className="rounded-2xl border border-white/[0.06] bg-black/10 p-3"><p className="text-[8px] text-white/35">Dynamic Map Loads — Month</p><p className="mt-1 text-[20px] font-bold">{usage.dynamicMapMonth}</p></div>
        <div className="rounded-2xl border border-white/[0.06] bg-black/10 p-3"><p className="text-[8px] text-white/35">Manual Google Requests — Today</p><p className="mt-1 text-[20px] font-bold">{usage.manualToday}</p></div>
        <div className="rounded-2xl border border-white/[0.06] bg-black/10 p-3"><p className="text-[8px] text-white/35">Manual Google Requests — Month</p><p className="mt-1 text-[20px] font-bold">{usage.manualMonth}</p></div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 text-[8px]">
        {[['Places Search', usage.textSearch], ['Place Details', usage.placeDetails], ['Geocoding', usage.geocoding], ['Routes', usage.routes]].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-white/[0.035] p-2"><span className="text-white/35">{label}</span><strong className="float-right text-white/78">{value}</strong></div>)}
      </div>
      <div className="mt-3 rounded-2xl border border-white/[0.06] bg-black/10 p-3"><div className="flex items-center justify-between gap-3"><div><p className={`text-[10px] font-extrabold ${tone}`}>{safety.level.toUpperCase()}</p><p className="mt-1 text-[8px] leading-4 text-white/42">{safety.message}</p></div><div className="text-right"><p className="text-[16px] font-bold">{safety.used.toLocaleString()} / {safety.target.toLocaleString()}</p><p className="text-[7px] text-white/28">soft limit {safety.softLimit.toLocaleString()}</p></div></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full bg-white/50 transition-[width]" style={{ width: `${Math.min(100, safety.percent)}%` }} /></div></div>
      <div className="mt-3 grid gap-2 text-[8px] sm:grid-cols-2"><div className="rounded-xl bg-white/[0.025] p-2"><span className="text-white/35">Last Google API Request</span><p className="mt-1 font-semibold text-white/70">{formatWhen(usage.lastGoogleRequest, language)}</p></div><div className="rounded-xl bg-white/[0.025] p-2"><span className="text-white/35">Last Manual Data Update</span><p className="mt-1 font-semibold text-white/70">{formatWhen(usage.lastManualDataUpdate, language)}</p></div></div>
      <a href="https://console.cloud.google.com/google/maps-apis/metrics" target="_blank" rel="noreferrer" className="amd-chip mt-3 flex min-h-11 w-full items-center justify-center gap-2 px-4 text-[9px] font-bold text-[#8ecbff]">Open Google Cloud Usage <ExternalLink className="h-3.5 w-3.5" /></a>
    </section>
  );
}
''')

write('components/ManualGoogleMap.tsx', r'''"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ExternalLink, LoaderCircle, Map as MapIcon, ShieldCheck } from "lucide-react";
import { GoogleMapsMap } from "@/components/GoogleMapsMap";
import { GOOGLE_DYNAMIC_MAP_MONTHLY_TARGET, googleDynamicMapSafetyState, googleExternalMapsUrl, googleMapsMonthlySoftLimit } from "@/lib/google-map-cost-control";
import { getGoogleRequestUsage, hydrateGoogleRequestLogs, recordDynamicMapLoad } from "@/lib/google-request-manager";
import type { Place } from "@/types/place";

type Point = { lat: number; lng: number };
type MapState = "idle" | "loading" | "ready" | "error" | "missing";

export function ManualGoogleMap({ apiKey, mapId, active, places, origin, radiusMeters, selectedPlace, center, onSelectPlace, onMoveEnd, onStateChange, language }: {
  apiKey: string;
  mapId: string;
  active: boolean;
  places: Place[];
  origin: Point;
  radiusMeters: number;
  selectedPlace: Place | null;
  center: Point;
  onSelectPlace: (place: Place) => void;
  onMoveEnd: (center: Point) => void;
  onStateChange?: (state: MapState) => void;
  language: "th" | "en";
}) {
  const [loadRequested, setLoadRequested] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [version, setVersion] = useState(0);
  const initializedLoggedRef = useRef(false);
  const usage = useMemo(() => getGoogleRequestUsage(), [version]);
  const softLimit = googleMapsMonthlySoftLimit();
  const safety = useMemo(() => googleDynamicMapSafetyState(usage.dynamicMapMonth, softLimit), [usage.dynamicMapMonth, softLimit]);
  const externalUrl = useMemo(() => googleExternalMapsUrl({ ...origin, label: "บ้านสุภาอพาร์ทเม้นต์" }), [origin]);

  useEffect(() => {
    let mounted = true;
    void hydrateGoogleRequestLogs().finally(() => { if (mounted) setVersion((value) => value + 1); });
    const sync = () => setVersion((value) => value + 1);
    window.addEventListener("amd-google-usage-change", sync);
    return () => { mounted = false; window.removeEventListener("amd-google-usage-change", sync); };
  }, []);

  function startLoad(adminOverride = false) {
    if (!apiKey) { onStateChange?.("missing"); return; }
    if (safety.blockedBySoftLimit && !adminOverride) { setOverrideOpen(true); return; }
    if (safety.requiresConfirmation && !adminOverride) { setConfirmOpen(true); return; }
    onStateChange?.("loading");
    setLoadRequested(true);
  }

  function onInitialized() {
    onStateChange?.("ready");
    if (initializedLoggedRef.current) return;
    initializedLoggedRef.current = true;
    recordDynamicMapLoad();
    setVersion((value) => value + 1);
  }

  if (!loadRequested) {
    const blocked = safety.blockedBySoftLimit;
    return <div data-testid="google-map-placeholder" className="amd-hero-map absolute inset-0 rounded-none border-0 p-5">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_32%,rgba(0,122,255,.18),transparent_34%),linear-gradient(145deg,#07111f,#02060d_65%)]" />
      <div className="relative z-10 flex h-full flex-col items-center justify-center text-center">
        <div className="grid h-16 w-16 place-items-center rounded-[22px] border border-[#00D9FF]/25 bg-[#007AFF]/10 shadow-[0_0_38px_rgba(0,122,255,.16)]"><MapIcon className="h-7 w-7 text-[#00D9FF]" /></div>
        <p className="mt-4 text-[9px] font-extrabold tracking-[0.22em] text-[#00D9FF]">GOOGLE MAPS</p>
        <h3 className="mt-2 text-[18px] font-bold">{language === "en" ? "Interactive map not loaded" : "ยังไม่ได้โหลดแผนที่แบบ Interactive"}</h3>
        <p className="mt-2 max-w-[310px] text-[9px] leading-5 text-white/42">{language === "en" ? "Google Maps Status: NOT LOADED. Loading the interactive map may count as one Dynamic Maps load." : "Google Maps Status: NOT LOADED • การโหลดแผนที่ Interactive อาจนับเป็น 1 Dynamic Maps load"}</p>
        <div className="mt-3 rounded-full border border-white/[0.08] bg-black/15 px-3 py-1.5 text-[8px] text-white/48">{language === "en" ? "Preventing unnecessary API usage" : "ป้องกันการใช้ API โดยไม่จำเป็น"}</div>
        <p className={`mt-3 text-[9px] font-bold ${safety.level === "safe" ? "text-emerald-200" : safety.level === "warning" ? "text-amber-100" : "text-rose-200"}`}>{safety.message}</p>
        <p className="mt-1 text-[8px] text-white/38">Monthly estimate: {safety.used.toLocaleString()} / {GOOGLE_DYNAMIC_MAP_MONTHLY_TARGET.toLocaleString()} • soft limit {softLimit.toLocaleString()}</p>
        {!apiKey && <p className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.06] px-3 py-2 text-[9px] text-amber-100">{language === "en" ? "Google Maps is not configured." : "ยังไม่ได้ตั้งค่า Google Maps"}</p>}
        {blocked ? <div className="mt-4 w-full max-w-[330px]"><div className="rounded-2xl border border-rose-300/15 bg-rose-300/[0.055] p-3"><AlertTriangle className="mx-auto h-5 w-5 text-rose-200" /><p className="mt-2 text-[10px] font-bold text-rose-100">Monthly Google Maps safety limit reached.</p><p className="mt-1 text-[8px] leading-4 text-white/38">No embedded map will load unless an admin explicitly overrides this local soft limit.</p></div><div className="mt-2 grid grid-cols-2 gap-2"><a href={externalUrl} target="_blank" rel="noreferrer" className="amd-chip flex min-h-11 items-center justify-center gap-1 text-[8px] font-bold">Use External Google Maps <ExternalLink className="h-3 w-3" /></a><button data-testid="google-map-admin-override" type="button" disabled={!apiKey} onClick={() => setOverrideOpen(true)} className="amd-chip min-h-11 text-[8px] font-bold text-rose-100 disabled:opacity-35">Admin Override</button></div></div> : <button data-testid="load-google-map" type="button" disabled={!apiKey} onClick={() => startLoad(false)} className="amd-btn amd-btn-primary mt-4 min-h-12 rounded-2xl px-6 text-[10px] font-extrabold disabled:opacity-35">Load Google Map</button>}
        {!blocked && <a href={externalUrl} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-1 text-[8px] font-semibold text-[#8ecbff]">Open in Google Maps <ExternalLink className="h-3 w-3" /></a>}
      </div>
      {confirmOpen && <div className="amd-sheet-backdrop z-[160]"><button type="button" aria-label="Close" className="absolute inset-0" onClick={() => setConfirmOpen(false)} /><section className="amd-sheet amd-glass-strong relative w-full max-w-[460px] rounded-t-[30px] p-5"><AlertTriangle className="h-6 w-6 text-amber-200" /><h3 className="mt-3 text-[18px] font-bold">Confirm Dynamic Map Load</h3><p className="mt-2 text-[9px] leading-5 text-white/48">Loading Google Maps JavaScript API and initializing one Dynamic Map may consume Google Maps Platform quota. Estimated month usage: {safety.used} / {safety.target}.</p><div className="mt-4 flex gap-2"><button type="button" onClick={() => setConfirmOpen(false)} className="amd-chip min-h-11 flex-1 text-[9px]">Cancel</button><button type="button" onClick={() => { setConfirmOpen(false); startLoad(true); }} className="amd-btn amd-btn-primary flex-1 rounded-xl text-[9px] font-bold">Load Google Map</button></div></section></div>}
      {overrideOpen && <div className="amd-sheet-backdrop z-[165]"><button type="button" aria-label="Close" className="absolute inset-0" onClick={() => setOverrideOpen(false)} /><section className="amd-sheet amd-glass-strong relative w-full max-w-[460px] rounded-t-[30px] p-5"><ShieldCheck className="h-6 w-6 text-rose-200" /><h3 className="mt-3 text-[18px] font-bold">Admin Override Required</h3><p className="mt-2 text-[9px] leading-5 text-white/48">The local monthly soft limit is {softLimit.toLocaleString()} loads. Continue only if you have verified official Google Cloud usage and intentionally want one more embedded Dynamic Map load.</p><div className="mt-4 flex gap-2"><button type="button" onClick={() => setOverrideOpen(false)} className="amd-chip min-h-11 flex-1 text-[9px]">Cancel</button><button type="button" onClick={() => { setOverrideOpen(false); startLoad(true); }} className="amd-btn flex-1 rounded-xl border border-rose-300/20 bg-rose-300/[0.08] text-[9px] font-bold text-rose-100">Admin Override & Load</button></div></section></div>}
    </div>;
  }

  return <>
    <GoogleMapsMap apiKey={apiKey} mapId={mapId} active={active} manualLoadConfirmed places={places} origin={origin} radiusMeters={radiusMeters} selectedPlace={selectedPlace} center={center} onSelectPlace={onSelectPlace} onMoveEnd={onMoveEnd} onStateChange={onStateChange} onInitialized={onInitialized} />
    <div className="pointer-events-none absolute left-3 top-3 z-[15] rounded-xl border border-white/[0.08] bg-[#02060D]/70 px-3 py-2 text-[8px] text-white/58 backdrop-blur-md"><span className="font-bold text-[#8ecbff]">Dynamic Map</span> • monthly estimate {usage.dynamicMapMonth.toLocaleString()} / {GOOGLE_DYNAMIC_MAP_MONTHLY_TARGET.toLocaleString()}</div>
    <a href={externalUrl} target="_blank" rel="noreferrer" className="amd-map-control amd-chip absolute bottom-4 left-4 z-20 flex min-h-10 items-center gap-1 px-3 text-[8px] font-bold">Open Google Maps <ExternalLink className="h-3 w-3" /></a>
    {onStateChange && null}
  </>;
}
''')

# Strengthen the low-level loader: explicit intent is required and script injection remains singleton.
p = ROOT / 'lib/google-maps.ts'
text = p.read_text(encoding='utf-8')
text = text.replace('export function loadGoogleMaps(apiKey: string) {', 'export type GoogleMapsLoadIntent = "embedded_map_user_click" | "manual_places_request";\n\nexport function loadGoogleMaps(apiKey: string, intent: GoogleMapsLoadIntent) {\n  if (intent !== "embedded_map_user_click" && intent !== "manual_places_request") return Promise.reject(new Error("Explicit Google Maps load intent is required"));')
text = text.replace('    const script = document.createElement("script");\n    script.async = true;', '    const existing = document.querySelector<HTMLScriptElement>(\'script[data-amd-google-maps-loader="true"]\');\n    if (existing) {\n      existing.addEventListener("load", () => window.google?.maps ? resolve() : reject(new Error("Google Maps script loaded without maps library")), { once: true });\n      existing.addEventListener("error", () => reject(new Error("Google Maps load failed")), { once: true });\n      return;\n    }\n    const script = document.createElement("script");\n    script.dataset.amdGoogleMapsLoader = "true";\n    script.async = true;')
p.write_text(text, encoding='utf-8')

replace_once('lib/google-live.ts', '  await loadGoogleMaps(apiKey);', '  await loadGoogleMaps(apiKey, "manual_places_request");')

# Expand application-side usage accounting while preserving existing manual request limits.
p = ROOT / 'lib/google-request-manager.ts'
text = p.read_text(encoding='utf-8')
text = text.replace('export type GoogleRequestType = "place_details" | "text_search" | "other";', 'export type GoogleRequestType = "dynamic_map" | "place_details" | "text_search" | "geocoding" | "routes" | "street_view" | "other";')
text = text.replace('export type GoogleRequestUsage = {\n  session: number;\n  today: number;\n  month: number;\n  placeDetails: number;\n  textSearch: number;\n  other: number;\n  failedRequests: number;\n  retries: number;\n  networkAttempts: number;\n};', '''export type GoogleRequestUsage = {\n  session: number;\n  today: number;\n  month: number;\n  manualToday: number;\n  manualMonth: number;\n  dynamicMapToday: number;\n  dynamicMapMonth: number;\n  placeDetails: number;\n  textSearch: number;\n  geocoding: number;\n  routes: number;\n  streetView: number;\n  other: number;\n  failedRequests: number;\n  retries: number;\n  networkAttempts: number;\n  lastGoogleRequest: string | null;\n  lastManualDataUpdate: string | null;\n};''')
text = text.replace('  const log: GoogleRequestLog = { ...entry, id: `greq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, timestamp: new Date().toISOString() };\n  writeLogs([...requestLogs, log]); incrementSessionAttempts(log.attempted);', '''  const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : "00000000-0000-4000-8000-" + Math.random().toString(16).slice(2).padEnd(12, "0").slice(0, 12);\n  const log: GoogleRequestLog = { ...entry, id, timestamp: new Date().toISOString() };\n  writeLogs([...requestLogs, log]);\n  if (log.requestType !== "dynamic_map") incrementSessionAttempts(log.attempted);''')
text = text.replace('  })().catch(() => undefined);\n  return log;\n}', '  })().catch(() => undefined);\n  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("amd-google-usage-change", { detail: log }));\n  return log;\n}', 1)
start = text.index('export function getGoogleRequestUsage(): GoogleRequestUsage {')
end = text.index('function readCacheEntry<T>', start)
usage_block = r'''export function getGoogleRequestUsage(): GoogleRequestUsage {
  const logs = safeReadLogs(); const now = new Date(); const today = dateKey(now); const month = monthKey(now);
  const attempts = (items: GoogleRequestLog[]) => items.reduce((sum, item) => sum + (item.attempted || 0), 0);
  const byType = (type: GoogleRequestType) => attempts(logs.filter((item) => item.requestType === type));
  const dynamicLogs = logs.filter((item) => item.requestType === "dynamic_map");
  const manualLogs = logs.filter((item) => item.requestType !== "dynamic_map");
  const manualToday = attempts(manualLogs.filter((item) => item.timestamp.startsWith(today)));
  const manualMonth = attempts(manualLogs.filter((item) => item.timestamp.startsWith(month)));
  const lastGoogleRequest = [...logs].sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0]?.timestamp || null;
  const lastManualDataUpdate = [...logs].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).find((item) => item.requestType === "place_details" || item.requestType === "text_search")?.timestamp || null;
  return {
    session: sessionAttempts,
    today: manualToday,
    month: manualMonth,
    manualToday,
    manualMonth,
    dynamicMapToday: attempts(dynamicLogs.filter((item) => item.timestamp.startsWith(today))),
    dynamicMapMonth: attempts(dynamicLogs.filter((item) => item.timestamp.startsWith(month))),
    placeDetails: byType("place_details"),
    textSearch: byType("text_search"),
    geocoding: byType("geocoding"),
    routes: byType("routes"),
    streetView: byType("street_view"),
    other: byType("other"),
    failedRequests: manualLogs.filter((item) => item.status === "failed").length,
    retries: manualLogs.reduce((sum, item) => sum + (item.retryCount || 0), 0),
    networkAttempts: attempts(manualLogs),
    lastGoogleRequest,
    lastManualDataUpdate,
  };
}

export function recordDynamicMapLoad() {
  return logGoogleRequest({ requestType: "dynamic_map", status: "success", attempted: 1, retryCount: 0 });
}

'''
text = text[:start] + usage_block + text[end:]
p.write_text(text, encoding='utf-8')

# Map component can only initialize after the gate passes an explicit confirmation prop.
p = ROOT / 'components/GoogleMapsMap.tsx'
text = p.read_text(encoding='utf-8')
text = text.replace('  apiKey: string;\n  mapId: string;', '  apiKey: string;\n  mapId: string;\n  active: boolean;\n  manualLoadConfirmed: boolean;')
text = text.replace('  onStateChange?: (state: "loading" | "ready" | "error") => void;\n};', '  onStateChange?: (state: "loading" | "ready" | "error" | "idle" | "missing") => void;\n  onInitialized?: () => void;\n};')
text = text.replace('  apiKey,\n  mapId,\n  places,', '  apiKey,\n  mapId,\n  active,\n  manualLoadConfirmed,\n  places,')
text = text.replace('  onMoveEnd,\n  onStateChange,\n}: Props) {', '  onMoveEnd,\n  onStateChange,\n  onInitialized,\n}: Props) {')
text = text.replace('    if (!apiKey || !containerRef.current) return;', '    if (!apiKey || !containerRef.current || !manualLoadConfirmed) return;')
text = text.replace('    void loadGoogleMaps(apiKey)', '    void loadGoogleMaps(apiKey, "embedded_map_user_click")')
text = text.replace('        onStateChange?.("ready");', '        onStateChange?.("ready");\n        onInitialized?.();')
text = text.replace('  }, [apiKey, mapId]);', '  }, [apiKey, mapId, manualLoadConfirmed]);')
insert_before = '  return <div ref={containerRef} className="amd-google-map-canvas absolute inset-0 bg-[#02060D]" aria-label="Around My Dorm Google map" />;'
active_effect = r'''  useEffect(() => {
    const map = mapRef.current;
    if (!active || !map || !readyRef.current || !window.google?.maps) return;
    const frame = window.requestAnimationFrame(() => {
      try { window.google.maps.event?.trigger?.(map, "resize"); } catch {}
      if (!selectedRef.current) map.panTo?.(center);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [active, center]);

'''
if insert_before not in text: raise SystemExit('GoogleMapsMap return marker not found')
text = text.replace(insert_before, active_effect + insert_before, 1)
p.write_text(text, encoding='utf-8')

# AroundMyDorm: remove background warm-up, switch to manual gate, and keep map screen mounted so one instance is reused across bottom tabs.
p = ROOT / 'components/AroundMyDormApp.tsx'
text = p.read_text(encoding='utf-8')
text = text.replace('import { GoogleMapsMap } from "@/components/GoogleMapsMap";', 'import { ManualGoogleMap } from "@/components/ManualGoogleMap";')
text = text.replace('import { loadGoogleMaps } from "@/lib/google-maps";\n', '')
warm_start = text.index('  // Warm the Maps JavaScript bundle after first paint')
warm_end = text.index('  // Keep bottom-tab navigation inside the mounted app.', warm_start)
text = text[:warm_start] + text[warm_end:]
map_start = text.index('          {tab === "map" && (')
map_end = text.index('          {tab === "favorites" && (', map_start)
segment = text[map_start:map_end]
old_open = '          {tab === "map" && (\n            <div className="amd-page amd-page-enter">'
if old_open not in segment: raise SystemExit('Map tab opener not found')
segment = segment.replace(old_open, '          <div className={`amd-page amd-page-enter ${tab === "map" ? "" : "hidden"}`} aria-hidden={tab !== "map"}>', 1)
if not segment.rstrip().endswith(')}'):
    raise SystemExit('Unexpected map tab closing shape')
last_close = segment.rfind('          )}')
if last_close == -1: raise SystemExit('Map tab closing marker not found')
segment = segment[:last_close] + segment[last_close + len('          )}'):]
render_start = segment.index('                {googleMapsApiKey ? (')
render_end = segment.index('\n\n                <div className="absolute left-1/2 top-4', render_start)
manual_render = r'''                <ManualGoogleMap
                  apiKey={googleMapsApiKey}
                  mapId={googleMapId}
                  active={tab === "map"}
                  places={mapVisiblePlaces}
                  origin={origin}
                  radiusMeters={radiusMeters}
                  selectedPlace={selectedPlace}
                  center={mapSearchCenter}
                  language={settings.language}
                  onSelectPlace={(place) => { addRecent(place); setSelectedPlace(place); }}
                  onMoveEnd={(next) => {
                    const moved = Math.abs(next.lat - mapSearchCenter.lat) > 0.0008 || Math.abs(next.lng - mapSearchCenter.lng) > 0.0008;
                    if (moved) { setPendingMapCenter(next); setShowSearchArea(true); }
                  }}
                  onStateChange={(state) => setMapLoadState(state)}
                />'''
segment = segment[:render_start] + manual_render + segment[render_end:]
segment = segment.replace('className="amd-map-frame relative mt-4', 'data-google-map-state={mapLoadState} className="amd-map-frame relative mt-4', 1)
text = text[:map_start] + segment + text[map_end:]
p.write_text(text, encoding='utf-8')

# Google discovery must show a confirmation before any new external search.
p = ROOT / 'components/GoogleDiscoverySheet.tsx'
text = p.read_text(encoding='utf-8')
text = text.replace('  const [usageVersion, setUsageVersion] = useState(0);', '  const [usageVersion, setUsageVersion] = useState(0);\n  const [confirmOpen, setConfirmOpen] = useState(false);')
text = text.replace('  async function searchGoogle() {\n    if (!query.trim() || !apiKey || loading) return;', '  async function searchGoogle(confirmed = false) {\n    if (!query.trim() || !apiKey || loading) return;\n    if (estimate.newRequests > 0 && !confirmed) { setConfirmOpen(true); return; }')
text = text.replace('onClick={() => void searchGoogle()}', 'onClick={() => void searchGoogle(false)}')
marker = '        {lastSummary && <div className="mt-3 rounded-xl border border-emerald-300/10'
idx = text.index(marker)
confirm_ui = r'''        {confirmOpen && <div className="amd-sheet-backdrop z-[165]"><button type="button" aria-label="Close" className="absolute inset-0" onClick={() => setConfirmOpen(false)} /><section className="amd-sheet amd-glass-strong relative w-full max-w-[460px] rounded-t-[30px] p-5"><p className="text-[9px] font-bold text-[#00D9FF]">MANUAL GOOGLE REQUEST</p><h3 className="mt-2 text-[18px] font-bold">Send 1 Google Places Search?</h3><p className="mt-2 text-[9px] leading-5 text-white/48">Google Places API request will be sent for “{query.trim()}” within approximately {radiusMeters} m. This operation may consume Google Maps Platform quota.</p><div className="mt-4 flex gap-2"><button type="button" onClick={() => setConfirmOpen(false)} className="amd-chip min-h-11 flex-1 text-[9px]">Cancel</button><button data-testid="confirm-google-nearby-search" type="button" onClick={() => { setConfirmOpen(false); void searchGoogle(true); }} className="amd-btn amd-btn-primary flex-1 rounded-xl text-[9px] font-bold">Send Request</button></div></section></div>}
'''
text = text[:idx] + confirm_ui + text[idx:]
p.write_text(text, encoding='utf-8')

# Place ID matching search also requires a dedicated confirmation.
p = ROOT / 'components/GooglePlaceIdManager.tsx'
text = p.read_text(encoding='utf-8')
text = text.replace('  const [apiLocked, setApiLocked] = useState(() => getGoogleApiControlSettings().locked);', '  const [apiLocked, setApiLocked] = useState(() => getGoogleApiControlSettings().locked);\n  const [searchConfirmOpen, setSearchConfirmOpen] = useState(false);')
text = text.replace('  async function runMatchSearch() {\n    if (!matchingPlace || !matchCenter || !matchQuery || !apiKey || searching) return;', '  async function runMatchSearch(confirmed = false) {\n    if (!matchingPlace || !matchCenter || !matchQuery || !apiKey || searching) return;\n    if ((estimate?.newRequests ?? 0) > 0 && !confirmed) { setSearchConfirmOpen(true); return; }')
text = text.replace('onClick={() => void runMatchSearch()}', 'onClick={() => void runMatchSearch(false)}')
marker = '      {pendingLowConfidence && matchingPlace && <div className="amd-sheet-backdrop z-[145]">'
idx = text.index(marker)
confirm_ui = r'''      {searchConfirmOpen && matchingPlace && <div className="amd-sheet-backdrop z-[150]"><button type="button" aria-label="Close" className="absolute inset-0" onClick={() => setSearchConfirmOpen(false)} /><section className="amd-sheet amd-glass-strong relative w-full max-w-[460px] rounded-t-[30px] p-5"><p className="text-[9px] font-bold text-[#00D9FF]">MANUAL GOOGLE REQUEST</p><h3 className="mt-2 text-[18px] font-bold">Search Google Match?</h3><p className="mt-2 text-[9px] leading-5 text-white/48">Google Places Text Search will be sent for “{matchQuery}”. Estimated new requests: {estimate?.newRequests ?? 0}. This may consume Google Maps Platform quota.</p><div className="mt-4 flex gap-2"><button type="button" onClick={() => setSearchConfirmOpen(false)} className="amd-chip min-h-11 flex-1 text-[9px]">Cancel</button><button data-testid="confirm-google-place-id-search" type="button" onClick={() => { setSearchConfirmOpen(false); void runMatchSearch(true); }} className="amd-btn amd-btn-primary flex-1 rounded-xl text-[9px] font-bold">Send Request</button></div></section></div>}
'''
text = text[:idx] + confirm_ui + text[idx:]
p.write_text(text, encoding='utf-8')

# Maintenance: every external request confirms; retries confirm; expose requested manual shortcut controls.
p = ROOT / 'components/GoogleMaintenancePanel.tsx'
text = p.read_text(encoding='utf-8')
text = text.replace('  const [confirmOpen, setConfirmOpen] = useState(false);', '  const [confirmOpen, setConfirmOpen] = useState(false);\n  const [retryConfirmOpen, setRetryConfirmOpen] = useState(false);')
text = text.replace('  function requestRun() {\n    if (executableCount <= 0) return;\n    if (largeBatch || strongWarning) setConfirmOpen(true);\n    else void executeBatch();\n  }', '  function requestRun() {\n    if (executableCount <= 0) return;\n    setConfirmOpen(true);\n  }')
text = text.replace('onClick={() => void runFailedRetry()}', 'onClick={() => setRetryConfirmOpen(true)}')
insert_marker = '      <div className="mt-4">\n        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/38">DATA UPDATE SCOPE</p>'
shortcuts = r'''      <div data-testid="manual-google-request-shortcuts" className="mt-4 rounded-2xl border border-white/[0.07] bg-black/10 p-4">
        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#8ecbff]">MANUAL REQUEST SHORTCUTS</p>
        <p className="mt-1 text-[8px] leading-4 text-white/34">These buttons only select/preview a request scope. No Google request is sent until the separate confirmation dialog and Send Request action.</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <button type="button" onClick={() => { setScope("category"); setScopeCategory("food"); setPreviewOpen(true); }} className="amd-chip min-h-11 px-3 text-[8px] font-bold">Update Restaurant Data</button>
          <button type="button" onClick={() => { setScope("category"); setScopeCategory("cafe"); setPreviewOpen(true); }} className="amd-chip min-h-11 px-3 text-[8px] font-bold">Update Cafe Data</button>
          <button type="button" onClick={() => { setScope("category"); setScopeCategory("parking"); setPreviewOpen(true); }} className="amd-chip min-h-11 px-3 text-[8px] font-bold">Update Parking Data</button>
          <button type="button" onClick={() => setScope("area")} className="amd-chip min-h-11 px-3 text-[8px] font-bold">Update Selected Area</button>
          <button type="button" onClick={() => setScope("selected")} className="amd-chip min-h-11 px-3 text-[8px] font-bold">Refresh Selected Place</button>
        </div>
      </div>

'''
if insert_marker not in text: raise SystemExit('Maintenance scope marker not found')
text = text.replace(insert_marker, shortcuts + insert_marker, 1)
confirm_marker = '      {confirmOpen && <div className="amd-sheet-backdrop z-[130]">'
idx = text.index(confirm_marker)
retry_ui = r'''      {retryConfirmOpen && <div className="amd-sheet-backdrop z-[132]"><button type="button" aria-label="Close" className="absolute inset-0" onClick={() => setRetryConfirmOpen(false)} /><section className="amd-sheet amd-glass-strong relative w-full max-w-[460px] rounded-t-[30px] p-5"><AlertTriangle className="h-6 w-6 text-amber-200" /><h3 className="mt-3 text-[18px] font-bold">Retry Failed Google Requests?</h3><p className="mt-2 text-[9px] leading-5 text-white/45">This will send up to {failedPlaces.length} manual Google Places requests again and may consume quota.</p><div className="mt-4 flex gap-2"><button type="button" onClick={() => setRetryConfirmOpen(false)} className="amd-chip min-h-11 flex-1 text-[9px]">Cancel</button><button type="button" onClick={() => { setRetryConfirmOpen(false); void runFailedRetry(); }} className="amd-btn amd-btn-primary flex-1 rounded-xl text-[9px] font-bold">Send Request</button></div></section></div>}

'''
text = text[:idx] + retry_ui + text[idx:]
text = text.replace('>Confirm {executableCount} Requests</button>', '>Send Request</button>')
p.write_text(text, encoding='utf-8')

# Data Management: dedicated usage dashboard and explicit nearby search entry point.
p = ROOT / 'components/DataManagement.tsx'
text = p.read_text(encoding='utf-8')
text = text.replace('import { GoogleMaintenancePanel } from "@/components/GoogleMaintenancePanel";', 'import { GoogleMaintenancePanel } from "@/components/GoogleMaintenancePanel";\nimport { GoogleMapsUsageDashboard } from "@/components/GoogleMapsUsageDashboard";\nimport { GoogleDiscoverySheet } from "@/components/GoogleDiscoverySheet";\nimport { DORM_CENTER } from "@/lib/place-utils";')
text = text.replace('  const [manualOpen, setManualOpen] = useState(false);', '  const [manualOpen, setManualOpen] = useState(false);\n  const [googleSearchOpen, setGoogleSearchOpen] = useState(false);')
find_button = '<button type="button" onClick={() => setMessage(language === "en" ? "External discovery is maintenance-only. Run an approved provider scan outside normal browsing, then import its normalized JSON here." : "External Discovery เป็น Maintenance-only ให้รัน Approved Provider Scan แล้วนำไฟล์ JSON ที่ Normalize แล้วมาตรวจที่นี่")} className="amd-btn flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-4 text-[10px] font-bold"><Search className="h-4 w-4" />{language === "en" ? "Find New Places" : "ค้นหาร้านใหม่"}</button>'
replacement = find_button + '\n            <button data-testid="search-nearby-places-admin" type="button" onClick={() => setGoogleSearchOpen(true)} className="amd-btn flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-4 text-[10px] font-bold text-[#8ecbff]"><Search className="h-4 w-4" />{language === "en" ? "Search Nearby Places" : "Search Nearby Places"}</button>'
if find_button not in text: raise SystemExit('DataManagement action button marker not found')
text = text.replace(find_button, replacement, 1)
text = text.replace('        <GooglePlaceIdManager places={places} language={language} onReload={onReload} />', '        <GoogleMapsUsageDashboard language={language} />\n\n        <GooglePlaceIdManager places={places} language={language} onReload={onReload} />', 1)
marker = '        {googleCandidate && <section className="amd-glass amd-card mt-4 p-4">'
idx = text.index(marker)
search_sheet = r'''        {googleSearchOpen && <GoogleDiscoverySheet initialQuery="" center={DORM_CENTER} radiusMeters={2000} language={language} onClose={() => setGoogleSearchOpen(false)} onReviewCandidate={(candidate) => { setGoogleCandidate(candidate); setGoogleSearchOpen(false); }} />}

'''
text = text[:idx] + search_sheet + text[idx:]
p.write_text(text, encoding='utf-8')

# Environment and documentation.
p = ROOT / '.env.example'
text = p.read_text(encoding='utf-8')
if 'NEXT_PUBLIC_GOOGLE_MAPS_MONTHLY_SOFT_LIMIT=' not in text:
    text = text.replace('NEXT_PUBLIC_GOOGLE_MAP_ID=\n', 'NEXT_PUBLIC_GOOGLE_MAP_ID=\nNEXT_PUBLIC_GOOGLE_MAPS_MONTHLY_SOFT_LIMIT=9500\n')
text = text.replace('# Google Maps is the runtime map renderer.', '# Google Maps is manual-load only. Opening the site or Map tab must make zero Maps JS initialization calls.')
p.write_text(text, encoding='utf-8')

p = ROOT / 'README.md'
text = p.read_text(encoding='utf-8')
section = r'''

## Strict manual Google Maps / cost control

Around My Dorm does **not** download or initialize Google Maps JavaScript API during application startup, home/explore browsing, tab changes, map-page opening, component mount, PWA resume, scrolling, or state restoration. The Map screen starts at `Google Maps Status: NOT LOADED`; only the explicit **Load Google Map** action may mount the map loader. The map screen remains mounted after the first approved load so bottom-tab changes reuse the same `google.maps.Map` instance instead of creating a new one.

The app-side usage dashboard separates estimated Dynamic Map loads from explicit manual Google requests. These counters are operational estimates stored through the app request log and are **not** Google Cloud billing figures. Official usage must be checked with the **Open Google Cloud Usage** link. The local target is 10,000 Dynamic Map loads/month with warnings at 8,000, 9,000 and 9,500; `NEXT_PUBLIC_GOOGLE_MAPS_MONTHLY_SOFT_LIMIT` defaults to 9,500 and requires an explicit admin override once reached.

Google Places discovery, Place Details, Place ID matching and retries remain manual-only. Every new external Places operation must show its estimated request scope and a Cancel / Send Request confirmation before execution. Normal Home, Explore, Recent, Saved/Favorites, Place Details, filters, categories and map marker interaction use Around My Dorm's stored database and must not trigger Places requests.

Google Cloud configuration should restrict `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` by HTTP referrer to production/preview domains and restrict enabled APIs to the minimum required. Maps JavaScript API is the default required API. Places, Geocoding, Routes or Street View should only be enabled when their corresponding explicitly initiated admin flow is actually needed. Never hard-code browser or server API keys in source control.
'''
if '## Strict manual Google Maps / cost control' not in text:
    text += section
p.write_text(text, encoding='utf-8')

write('tests/google-map-cost-control.test.ts', r'''import { describe, expect, it } from "vitest";
import { googleDynamicMapSafetyState, googleMapsMonthlySoftLimit } from "@/lib/google-map-cost-control";

describe("Google Dynamic Map monthly safety states", () => {
  it("matches the requested thresholds", () => {
    expect(googleDynamicMapSafetyState(0, 9500).level).toBe("safe");
    expect(googleDynamicMapSafetyState(7999, 9500).level).toBe("safe");
    expect(googleDynamicMapSafetyState(8000, 9500).level).toBe("warning");
    expect(googleDynamicMapSafetyState(9000, 9500).level).toBe("high");
    expect(googleDynamicMapSafetyState(9500, 9500).level).toBe("critical");
    expect(googleDynamicMapSafetyState(10000, 9500).level).toBe("reached");
  });
  it("blocks normal embedded loading at the configured soft limit", () => {
    expect(googleDynamicMapSafetyState(9499, 9500).blockedBySoftLimit).toBe(false);
    expect(googleDynamicMapSafetyState(9500, 9500).blockedBySoftLimit).toBe(true);
  });
  it("sanitizes the public soft-limit environment value", () => {
    expect(googleMapsMonthlySoftLimit("9000")).toBe(9000);
    expect(googleMapsMonthlySoftLimit("999999")).toBe(10000);
    expect(googleMapsMonthlySoftLimit("bad")).toBe(9500);
  });
});
''')

write('tests/google-manual-request-architecture.test.ts', r'''import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

function sourceFiles(dir: string): string[] {
  const base = join(root, dir);
  return readdirSync(base).flatMap((name) => {
    const path = join(base, name);
    if (statSync(path).isDirectory()) return sourceFiles(relative(root, path));
    return /\.(ts|tsx|js|jsx)$/.test(name) ? [relative(root, path).replaceAll("\\", "/")] : [];
  });
}

describe("strict manual Google Maps architecture", () => {
  it("has no global or app-start Maps JavaScript loader", () => {
    expect(read("app/layout.tsx")).not.toContain("maps.googleapis.com");
    const app = read("components/AroundMyDormApp.tsx");
    expect(app).not.toContain("loadGoogleMaps(");
    expect(app).not.toContain("Warm the Maps JavaScript bundle");
    expect(app).toContain("<ManualGoogleMap");
    expect(app).not.toContain("<GoogleMapsMap");
  });

  it("keeps raw Google Maps script injection isolated to the singleton loader", () => {
    const offenders = sourceFiles("app").concat(sourceFiles("components"), sourceFiles("lib")).filter((path) => path !== "lib/google-maps.ts" && read(path).includes("maps.googleapis.com/maps/api/js"));
    expect(offenders).toEqual([]);
    const loader = read("lib/google-maps.ts");
    expect(loader).toContain("__aroundDormMapsPromise");
    expect(loader).toContain("GoogleMapsLoadIntent");
    expect(loader).toContain("data-amd-google-maps-loader");
  });

  it("requires an explicit gate before map initialization and manual intent for Places", () => {
    const gate = read("components/ManualGoogleMap.tsx");
    const map = read("components/GoogleMapsMap.tsx");
    const live = read("lib/google-live.ts");
    expect(gate).toContain("loadRequested");
    expect(gate).toContain("Load Google Map");
    expect(map).toContain("manualLoadConfirmed");
    expect(map).toContain('loadGoogleMaps(apiKey, "embedded_map_user_click")');
    expect(live).toContain('loadGoogleMaps(apiKey, "manual_places_request")');
  });

  it("requires UI confirmation for text search and maintenance requests", () => {
    expect(read("components/GoogleDiscoverySheet.tsx")).toContain("confirm-google-nearby-search");
    expect(read("components/GooglePlaceIdManager.tsx")).toContain("confirm-google-place-id-search");
    const maintenance = read("components/GoogleMaintenancePanel.tsx");
    expect(maintenance).toContain("setConfirmOpen(true)");
    expect(maintenance).toContain("retryConfirmOpen");
    expect(maintenance).toContain("Send Request");
  });
});
''')

write('e2e/manual-google-maps.spec.ts', r'''import { expect, test } from "@playwright/test";

test("normal browsing and opening Map initialize zero Google Maps or Places requests", async ({ page }) => {
  let mapsJs = 0;
  let places = 0;
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("maps.googleapis.com/maps/api/js")) mapsJs += 1;
    if (url.includes("places.googleapis.com") || url.includes("/maps/api/place") || url.includes("maps.googleapis.com/maps/api/place")) places += 1;
  });

  await page.goto("/");
  await page.waitForTimeout(1200);
  expect(mapsJs).toBe(0);
  expect(places).toBe(0);

  await page.goto("/map/");
  await expect(page.getByTestId("google-map-placeholder")).toBeVisible();
  await expect(page.getByText(/Interactive map not loaded|ยังไม่ได้โหลดแผนที่แบบ Interactive/)).toBeVisible();
  await page.getByLabel("รัศมีแผนที่").selectOption("2000");
  await page.waitForTimeout(400);
  expect(mapsJs).toBe(0);
  expect(places).toBe(0);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("opening Data Management sends zero Google requests before explicit confirmation", async ({ page }) => {
  let googleRequests = 0;
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("maps.googleapis.com") || url.includes("places.googleapis.com")) googleRequests += 1;
  });
  await page.goto("/settings/");
  await page.getByRole("button", { name: "จัดการ", exact: true }).click();
  await expect(page.getByTestId("google-maps-usage-dashboard")).toBeVisible();
  await expect(page.getByTestId("manual-google-request-shortcuts")).toBeVisible();
  expect(googleRequests).toBe(0);
});
''')

# Keep the existing map test compatible with the new manual placeholder wording.
p = ROOT / 'e2e/map-functional.spec.ts'
text = p.read_text(encoding='utf-8')
text = text.replace('await expect(page.getByText(/ยังไม่ได้ตั้งค่า Google Maps|Google Maps is not configured/)).toBeVisible();', 'await expect(page.getByTestId("google-map-placeholder")).toBeVisible();\n  await expect(page.getByText(/Interactive map not loaded|ยังไม่ได้โหลดแผนที่แบบ Interactive/)).toBeVisible();')
p.write_text(text, encoding='utf-8')

print('Strict manual Google Maps / cost-control migration staged.')

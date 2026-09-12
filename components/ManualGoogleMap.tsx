"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Cloud, ExternalLink, Map as MapIcon, ShieldCheck } from "lucide-react";
import { GoogleMapsMap } from "@/components/GoogleMapsMap";
import { SavedCloudMap } from "@/components/SavedCloudMap";
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
  const [mapProvider, setMapProvider] = useState<"cloud" | "google">("cloud");
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

  if (mapProvider === "cloud") {
    return <>
      <SavedCloudMap
        active={active}
        places={places}
        origin={origin}
        radiusMeters={radiusMeters}
        selectedPlace={selectedPlace}
        center={center}
        language={language}
        onSelectPlace={onSelectPlace}
        onMoveEnd={onMoveEnd}
        onStateChange={onStateChange}
      />
      <div className="absolute right-3 top-3 z-[25] flex rounded-xl border border-white/[0.10] bg-[#02060D]/82 p-1 shadow-lg backdrop-blur-md" data-testid="map-provider-toggle">
        <button type="button" className="rounded-lg bg-emerald-300/[0.12] px-3 py-2 text-[8px] font-bold text-emerald-100" disabled>{language === "en" ? "Saved Cloud" : "Cloud ที่บันทึก"}</button>
        <button type="button" onClick={() => setMapProvider("google")} className="rounded-lg px-3 py-2 text-[8px] font-bold text-white/62 hover:bg-white/[0.06]">Google</button>
      </div>
    </>;
  }

  if (!loadRequested) {
    const blocked = safety.blockedBySoftLimit;
    return <div data-testid="google-map-placeholder" className="amd-hero-map absolute inset-0 rounded-none border-0 p-5">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_32%,rgba(0,122,255,.18),transparent_34%),linear-gradient(145deg,#07111f,#02060d_65%)]" />
      <div className="absolute right-3 top-3 z-[25] flex rounded-xl border border-white/[0.10] bg-[#02060D]/82 p-1 shadow-lg backdrop-blur-md" data-testid="map-provider-toggle">
        <button type="button" onClick={() => setMapProvider("cloud")} className="rounded-lg px-3 py-2 text-[8px] font-bold text-emerald-100 hover:bg-white/[0.06]"><span className="inline-flex items-center gap-1"><Cloud className="h-3 w-3" />{language === "en" ? "Saved Cloud" : "Cloud ที่บันทึก"}</span></button>
        <button type="button" className="rounded-lg bg-[#149CFF]/15 px-3 py-2 text-[8px] font-bold text-[#8ecbff]" disabled>Google</button>
      </div>
      <div className="relative z-10 flex h-full flex-col items-center justify-center text-center">
        <div className="grid h-16 w-16 place-items-center rounded-[22px] border border-[#00D9FF]/25 bg-[#007AFF]/10 shadow-[0_0_38px_rgba(0,122,255,.16)]"><MapIcon className="h-7 w-7 text-[#00D9FF]" /></div>
        <p className="mt-4 text-[9px] font-extrabold tracking-[0.22em] text-[#00D9FF]">GOOGLE MAPS</p>
        <h3 className="mt-2 text-[18px] font-bold">{language === "en" ? "Interactive Google map not loaded" : "ยังไม่ได้โหลด Google Map"}</h3>
        <p className="mt-2 max-w-[310px] text-[9px] leading-5 text-white/42">{language === "en" ? "Saved Cloud Map works without a Google request. Load Google only when you explicitly need it." : "Saved Cloud Map ใช้ได้โดยไม่ยิง Google Request • โหลด Google เฉพาะเมื่อคุณกดเรียกเอง"}</p>
        <div className="mt-3 rounded-full border border-white/[0.08] bg-black/15 px-3 py-1.5 text-[8px] text-white/48">{language === "en" ? "Preventing unnecessary API usage" : "ป้องกันการใช้ API โดยไม่จำเป็น"}</div>
        <p className={`mt-3 text-[9px] font-bold ${safety.level === "safe" ? "text-emerald-200" : safety.level === "warning" ? "text-amber-100" : "text-rose-200"}`}>{safety.message}</p>
        <p className="mt-1 text-[8px] text-white/38">Monthly estimate: {safety.used.toLocaleString()} / {GOOGLE_DYNAMIC_MAP_MONTHLY_TARGET.toLocaleString()} • soft limit {softLimit.toLocaleString()}</p>
        {!apiKey && <p className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.06] px-3 py-2 text-[9px] text-amber-100">{language === "en" ? "Google Maps is not configured. Saved Cloud Map remains available." : "ยังไม่ได้ตั้งค่า Google Maps • Saved Cloud Map ยังใช้งานได้ตามปกติ"}</p>}
        {blocked ? <div className="mt-4 w-full max-w-[330px]"><div className="rounded-2xl border border-rose-300/15 bg-rose-300/[0.055] p-3"><AlertTriangle className="mx-auto h-5 w-5 text-rose-200" /><p className="mt-2 text-[10px] font-bold text-rose-100">Monthly Google Maps safety limit reached.</p><p className="mt-1 text-[8px] leading-4 text-white/38">No embedded Google map will load unless an admin explicitly overrides this local soft limit.</p></div><div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={() => setMapProvider("cloud")} className="amd-chip min-h-11 text-[8px] font-bold text-emerald-100">Saved Cloud Map</button><button data-testid="google-map-admin-override" type="button" disabled={!apiKey} onClick={() => setOverrideOpen(true)} className="amd-chip min-h-11 text-[8px] font-bold text-rose-100 disabled:opacity-35">Admin Override</button></div></div> : <button data-testid="load-google-map" type="button" disabled={!apiKey} onClick={() => startLoad(false)} className="amd-btn amd-btn-primary mt-4 min-h-12 rounded-2xl px-6 text-[10px] font-extrabold disabled:opacity-35">{language === "en" ? "Load Google Map" : "โหลด Google Map"}</button>}
        {!blocked && <a href={externalUrl} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-1 text-[8px] font-semibold text-[#8ecbff]">Open in Google Maps <ExternalLink className="h-3 w-3" /></a>}
      </div>
      {confirmOpen && <div className="amd-sheet-backdrop z-[160]"><button type="button" aria-label="Close" className="absolute inset-0" onClick={() => setConfirmOpen(false)} /><section className="amd-sheet amd-glass-strong relative w-full max-w-[460px] rounded-t-[30px] p-5"><AlertTriangle className="h-6 w-6 text-amber-200" /><h3 className="mt-3 text-[18px] font-bold">Confirm Dynamic Map Load</h3><p className="mt-2 text-[9px] leading-5 text-white/48">Loading Google Maps JavaScript API and initializing one Dynamic Map may consume Google Maps Platform quota. Estimated month usage: {safety.used} / {safety.target}.</p><div className="mt-4 flex gap-2"><button type="button" onClick={() => setConfirmOpen(false)} className="amd-chip min-h-11 flex-1 text-[9px]">Cancel</button><button type="button" onClick={() => { setConfirmOpen(false); startLoad(true); }} className="amd-btn amd-btn-primary flex-1 rounded-xl text-[9px] font-bold">Load Google Map</button></div></section></div>}
      {overrideOpen && <div className="amd-sheet-backdrop z-[165]"><button type="button" aria-label="Close" className="absolute inset-0" onClick={() => setOverrideOpen(false)} /><section className="amd-sheet amd-glass-strong relative w-full max-w-[460px] rounded-t-[30px] p-5"><ShieldCheck className="h-6 w-6 text-rose-200" /><h3 className="mt-3 text-[18px] font-bold">Admin Override Required</h3><p className="mt-2 text-[9px] leading-5 text-white/48">The local monthly soft limit is {softLimit.toLocaleString()} loads. Continue only if you have verified official Google Cloud usage and intentionally want one more embedded Dynamic Map load.</p><div className="mt-4 flex gap-2"><button type="button" onClick={() => setOverrideOpen(false)} className="amd-chip min-h-11 flex-1 text-[9px]">Cancel</button><button type="button" onClick={() => { setOverrideOpen(false); startLoad(true); }} className="amd-btn flex-1 rounded-xl border border-rose-300/20 bg-rose-300/[0.08] text-[9px] font-bold text-rose-100">Admin Override & Load</button></div></section></div>}
    </div>;
  }

  return <>
    <GoogleMapsMap apiKey={apiKey} mapId={mapId} active={active} manualLoadConfirmed places={places} origin={origin} radiusMeters={radiusMeters} selectedPlace={selectedPlace} center={center} onSelectPlace={onSelectPlace} onMoveEnd={onMoveEnd} onStateChange={onStateChange} onInitialized={onInitialized} />
    <div className="absolute right-3 top-3 z-[25] flex rounded-xl border border-white/[0.10] bg-[#02060D]/82 p-1 shadow-lg backdrop-blur-md" data-testid="map-provider-toggle">
      <button type="button" onClick={() => { setMapProvider("cloud"); setLoadRequested(false); }} className="rounded-lg px-3 py-2 text-[8px] font-bold text-emerald-100 hover:bg-white/[0.06]"><span className="inline-flex items-center gap-1"><Cloud className="h-3 w-3" />{language === "en" ? "Saved Cloud" : "Cloud ที่บันทึก"}</span></button>
      <button type="button" className="rounded-lg bg-[#149CFF]/15 px-3 py-2 text-[8px] font-bold text-[#8ecbff]" disabled>Google</button>
    </div>
    <div className="pointer-events-none absolute left-3 top-3 z-[15] rounded-xl border border-white/[0.08] bg-[#02060D]/70 px-3 py-2 text-[8px] text-white/58 backdrop-blur-md"><span className="font-bold text-[#8ecbff]">Dynamic Map</span> • monthly estimate {usage.dynamicMapMonth.toLocaleString()} / {GOOGLE_DYNAMIC_MAP_MONTHLY_TARGET.toLocaleString()}</div>
    <a href={externalUrl} target="_blank" rel="noreferrer" className="amd-map-control amd-chip absolute bottom-4 left-4 z-20 flex min-h-10 items-center gap-1 px-3 text-[8px] font-bold">Open Google Maps <ExternalLink className="h-3 w-3" /></a>
    {onStateChange && null}
  </>;
}

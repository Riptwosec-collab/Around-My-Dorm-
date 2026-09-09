"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BellRing, Car, Check, ChevronRight, Coffee, Compass, Footprints, HeartPulse, MapPin, Navigation, Route, Save, Search, ShieldCheck, Sparkles, Store, Users, Utensils } from "lucide-react";
import type { RecommendationContext } from "@/lib/place-ranking";
import {
  bangkokContextMode,
  comparePlaces,
  dormLifePlaces,
  emergencyPlaces,
  freshnessInsight,
  naturalIntentSummary,
  parkingIntelligence,
  routeOptions,
  smartContextReasons,
  smartNearby,
  tripDistanceKm,
  tripOrder,
} from "@/lib/smart-capabilities";
import { formatDistance, formatPrice, getPlaceOpenStatus } from "@/lib/place-utils";
import { enablePushNotificationsCloud, loadCrowdSignalsCloud, type CrowdSignal } from "@/lib/cloud/capabilities";
import { recordCrowdCheckinCloud, saveNotificationRulesCloud, saveTripPlanCloud } from "@/lib/cloud/store";
import type { Place } from "@/types/place";

type HubMode = "now" | "compare" | "trip" | "dorm" | "emergency";

function crowdLabel(signal: CrowdSignal | undefined, language: "th" | "en") {
  if (!signal || signal.samples < 1) return language === "en" ? "No recent crowd signal" : "ยังไม่มีสัญญาณความหนาแน่นล่าสุด";
  const label = signal.level === "quiet" ? (language === "en" ? "Quiet" : "ค่อนข้างเงียบ") : signal.level === "busy" ? (language === "en" ? "Busy" : "ค่อนข้างแน่น") : (language === "en" ? "Normal" : "ปกติ");
  return `${label} · ${signal.samples} ${language === "en" ? "recent check-ins" : "เช็กอินล่าสุด"}`;
}

function tripMapsUrl(places: Place[]) {
  const usable = places.filter((place) => place.latitude != null && place.longitude != null);
  if (!usable.length) return null;
  const destination = usable[usable.length - 1];
  const waypoints = usable.slice(0, -1).map((place) => `${place.latitude},${place.longitude}`).join("|");
  const base = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${destination.latitude},${destination.longitude}`)}`;
  return waypoints ? `${base}&waypoints=${encodeURIComponent(waypoints)}` : base;
}

function CompactPlace({ place, language, crowd, onOpen, onMap, onCrowd }: {
  place: Place;
  language: "th" | "en";
  crowd?: CrowdSignal;
  onOpen: () => void;
  onMap: () => void;
  onCrowd?: (level: "quiet" | "normal" | "busy") => void;
}) {
  const status = getPlaceOpenStatus(place);
  const freshness = freshnessInsight(place);
  const routes = routeOptions(place);
  return (
    <div className="rounded-[20px] border border-white/[0.07] bg-white/[0.035] p-3.5">
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <p className="truncate text-[13px] font-bold text-[var(--amd-text)]">{place.name}</p>
          <p className="mt-1 text-[9px] text-[var(--amd-text-3)]">{formatDistance(place.distanceKm)} · {formatPrice(place)}</p>
        </button>
        <span className={`shrink-0 rounded-lg px-2 py-1 text-[8px] font-bold ${status.isOpen === true ? "bg-emerald-300/[0.08] text-emerald-200" : status.status === "CLOSING_SOON" ? "bg-amber-300/[0.08] text-amber-100" : "bg-white/[0.05] text-white/45"}`}>{status.label}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {smartContextReasons(place, language).slice(0, 3).map((reason) => <span key={reason} className="rounded-lg bg-cyan-300/[0.06] px-2 py-1 text-[8px] text-cyan-100">{reason}</span>)}
        <span className={`rounded-lg px-2 py-1 text-[8px] ${freshness.state === "stale" ? "bg-amber-300/[0.07] text-amber-100" : "bg-white/[0.045] text-white/45"}`}>{freshness.label}</span>
      </div>
      {crowd && <p className="mt-2 text-[8px] text-white/40"><Users className="mr-1 inline h-3 w-3" />{crowdLabel(crowd, language)}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={onMap} className="amd-btn min-h-9 rounded-xl px-3 text-[9px]"><MapPin className="mr-1 inline h-3.5 w-3.5" />{language === "en" ? "Map" : "แผนที่"}</button>
        {routes.map((route) => <a key={route.mode} href={route.url} target="_blank" rel="noreferrer" className="amd-btn min-h-9 rounded-xl px-3 text-[9px]"><Navigation className="mr-1 inline h-3.5 w-3.5" />{route.label}{route.minutes != null ? ` ${route.minutes}m` : ""}</a>)}
        {onCrowd && <div className="ml-auto flex gap-1"><button type="button" title="Quiet" onClick={() => onCrowd("quiet")} className="rounded-lg bg-white/[0.04] px-2 py-1 text-[8px]">○</button><button type="button" title="Normal" onClick={() => onCrowd("normal")} className="rounded-lg bg-white/[0.04] px-2 py-1 text-[8px]">◐</button><button type="button" title="Busy" onClick={() => onCrowd("busy")} className="rounded-lg bg-white/[0.04] px-2 py-1 text-[8px]">●</button></div>}
      </div>
    </div>
  );
}

export function SmartCapabilityHub({
  places,
  origin,
  language,
  recommendationContext,
  query,
  onQuery,
  onOpenPlace,
  onMapPlace,
}: {
  places: Place[];
  origin: { lat: number; lng: number };
  language: "th" | "en";
  recommendationContext: RecommendationContext;
  query: string;
  onQuery: (value: string) => void;
  onOpenPlace: (place: Place) => void;
  onMapPlace: (place: Place) => void;
}) {
  const [mode, setMode] = useState<HubMode>("now");
  const [budget, setBudget] = useState<number | null>(100);
  const [openOnly, setOpenOnly] = useState(true);
  const [localOnly, setLocalOnly] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [tripIds, setTripIds] = useState<string[]>([]);
  const [cloudMessage, setCloudMessage] = useState<string | null>(null);
  const [crowdSignals, setCrowdSignals] = useState<CrowdSignal[]>([]);
  const [pushState, setPushState] = useState<"idle" | "saving" | "ready" | "error">("idle");
  const contextMode = bangkokContextMode();

  const picks = useMemo(() => smartNearby(places, recommendationContext, { budget, maxDistanceKm: 2, openNow: openOnly, localOnly, limit: 6 }), [places, recommendationContext, budget, openOnly, localOnly]);
  const topCandidates = useMemo(() => smartNearby(places, recommendationContext, { maxDistanceKm: 3, limit: 12 }).map((item) => item.place), [places, recommendationContext]);
  const compared = useMemo(() => comparePlaces(compareIds.map((id) => places.find((place) => place.id === id)).filter((place): place is Place => Boolean(place))), [compareIds, places]);
  const tripPlaces = useMemo(() => tripOrder(tripIds.map((id) => places.find((place) => place.id === id)).filter((place): place is Place => Boolean(place)), origin), [tripIds, places, origin]);
  const dormPlaces = useMemo(() => dormLifePlaces(places).slice(0, 12), [places]);
  const emergency = useMemo(() => emergencyPlaces(places).slice(0, 10), [places]);
  const intent = useMemo(() => naturalIntentSummary(query, language), [query, language]);
  const crowdByPlace = useMemo(() => new Map(crowdSignals.map((signal) => [signal.placeId, signal])), [crowdSignals]);

  useEffect(() => {
    const ids = picks.map((item) => item.place.id);
    if (!ids.length) return;
    void loadCrowdSignalsCloud(ids).then(setCrowdSignals).catch(() => undefined);
  }, [picks]);

  async function checkIn(placeId: string, level: "quiet" | "normal" | "busy") {
    try {
      await recordCrowdCheckinCloud({ placeId, crowdLevel: level });
      const refreshed = await loadCrowdSignalsCloud(picks.map((item) => item.place.id));
      setCrowdSignals(refreshed);
      setCloudMessage(language === "en" ? "Crowd signal saved to cloud" : "บันทึกความหนาแน่นขึ้นคลาวด์แล้ว");
    } catch {
      setCloudMessage(language === "en" ? "Cloud check-in failed" : "เช็กอินขึ้นคลาวด์ไม่สำเร็จ");
    }
  }

  function toggleId(id: string, current: string[], setter: (value: string[]) => void, max: number) {
    if (current.includes(id)) setter(current.filter((item) => item !== id));
    else if (current.length < max) setter([...current, id]);
  }

  async function saveTrip() {
    if (!tripPlaces.length) return;
    try {
      await saveTripPlanCloud({ clientId: `trip-${Date.now()}`, title: language === "en" ? "Dorm mini trip" : "ทริปรอบหอ", placeIds: tripPlaces.map((place) => place.id), mode: "mixed" });
      setCloudMessage(language === "en" ? "Trip saved to cloud" : "บันทึกทริปขึ้นคลาวด์แล้ว");
    } catch {
      setCloudMessage(language === "en" ? "Could not save trip" : "บันทึกทริปไม่สำเร็จ");
    }
  }

  async function enablePush() {
    setPushState("saving");
    try {
      await saveNotificationRulesCloud({ nearby: true, closingSoon: true, favoritesOpening: true, parking: true });
      await enablePushNotificationsCloud(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "");
      setPushState("ready");
      setCloudMessage(language === "en" ? "Push subscription saved to cloud" : "บันทึก Push subscription ขึ้นคลาวด์แล้ว");
    } catch {
      setPushState("error");
      setCloudMessage(language === "en" ? "Push is not configured or permission was denied" : "Push ยังไม่ได้ตั้งค่าหรือไม่ได้รับสิทธิ์แจ้งเตือน");
    }
  }

  const modeItems: Array<{ id: HubMode; label: string; icon: typeof Sparkles }> = [
    { id: "now", label: language === "en" ? "Now" : "ตอนนี้", icon: Sparkles },
    { id: "compare", label: language === "en" ? "Compare" : "เทียบ", icon: Compass },
    { id: "trip", label: language === "en" ? "Trip" : "ทริป", icon: Route },
    { id: "dorm", label: language === "en" ? "Dorm Life" : "ชีวิตรอบหอ", icon: Store },
    { id: "emergency", label: language === "en" ? "Emergency" : "ฉุกเฉิน", icon: HeartPulse },
  ];

  return (
    <section data-testid="smart-capability-hub" className="amd-glass-strong amd-card mt-5 overflow-hidden p-4">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-[9px] font-bold uppercase tracking-[0.18em] text-cyan-200">SMART LOCAL CONCIERGE</p><h2 className="mt-1 text-[18px] font-bold">{language === "en" ? "What should I do around here?" : "ตอนนี้รอบหอทำอะไรดี?"}</h2><p className="mt-1 text-[9px] text-[var(--amd-text-3)]">{language === "en" ? `Context: ${contextMode}` : `โหมดตามเวลา: ${contextMode}`}</p></div>
        <ShieldCheck className="h-5 w-5 shrink-0 text-cyan-300" />
      </div>

      <div className="-mx-4 mt-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"><div className="flex w-max gap-2">{modeItems.map((item) => <button key={item.id} type="button" onClick={() => setMode(item.id)} className={`amd-chip flex items-center gap-1.5 px-3 text-[9px] font-semibold ${mode === item.id ? "amd-chip-active" : ""}`}><item.icon className="h-3.5 w-3.5" />{item.label}</button>)}</div></div>

      {mode === "now" && <div className="mt-4">
        <div className="rounded-[18px] border border-cyan-300/10 bg-cyan-300/[0.035] p-3">
          <div className="flex items-center gap-2"><Search className="h-4 w-4 text-cyan-300" /><p className="text-[10px] font-bold">{language === "en" ? "Thai natural search" : "ค้นหาแบบภาษาคน"}</p></div>
          <div className="mt-2 flex flex-wrap gap-1.5">{[language === "en" ? "food under 100 open now" : "ข้าวไม่เกิน 100 เปิดอยู่", language === "en" ? "cafe within 1 km" : "คาเฟ่ภายใน 1 กม.", language === "en" ? "late local food" : "ร้าน Local เปิดดึก", language === "en" ? "monthly parking" : "ที่จอดรายเดือน"].map((sample) => <button key={sample} type="button" onClick={() => onQuery(sample)} className="rounded-lg bg-white/[0.05] px-2.5 py-1.5 text-[8px] text-white/60">{sample}</button>)}</div>
          {intent.length > 0 && <p className="mt-2 text-[8px] text-cyan-100/70">{language === "en" ? "Understood:" : "เข้าใจว่า:"} {intent.join(" · ")}</p>}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-[9px] text-white/40">Budget</span>{[80,100,150,300].map((value) => <button key={value} type="button" onClick={() => setBudget(budget === value ? null : value)} className={`rounded-lg px-2.5 py-1.5 text-[8px] ${budget === value ? "bg-[#007AFF] text-white" : "bg-white/[0.05] text-white/55"}`}>฿{value}</button>)}<button type="button" onClick={() => setOpenOnly((value) => !value)} className={`rounded-lg px-2.5 py-1.5 text-[8px] ${openOnly ? "bg-emerald-300/[0.12] text-emerald-100" : "bg-white/[0.05] text-white/55"}`}>{language === "en" ? "Open now" : "เปิดอยู่"}</button><button type="button" onClick={() => setLocalOnly((value) => !value)} className={`rounded-lg px-2.5 py-1.5 text-[8px] ${localOnly ? "bg-cyan-300/[0.12] text-cyan-100" : "bg-white/[0.05] text-white/55"}`}>LOCAL</button></div>
        <div className="mt-3 space-y-2">{picks.length ? picks.map(({ place }) => <CompactPlace key={place.id} place={place} language={language} crowd={crowdByPlace.get(place.id)} onOpen={() => onOpenPlace(place)} onMap={() => onMapPlace(place)} onCrowd={(level) => void checkIn(place.id, level)} />) : <p className="py-5 text-center text-[10px] text-white/40">{language === "en" ? "No matching places with verified enough data" : "ยังไม่มีร้านที่ตรงเงื่อนไขและมีข้อมูลเพียงพอ"}</p>}</div>
      </div>}

      {mode === "compare" && <div className="mt-4">
        <p className="text-[9px] text-white/45">{language === "en" ? "Choose up to 4 places" : "เลือกได้สูงสุด 4 ร้าน"}</p>
        <div className="mt-2 flex max-h-44 flex-wrap gap-1.5 overflow-y-auto">{topCandidates.map((place) => <button key={place.id} type="button" onClick={() => toggleId(place.id, compareIds, setCompareIds, 4)} className={`rounded-lg px-2 py-1.5 text-[8px] ${compareIds.includes(place.id) ? "bg-[#007AFF] text-white" : "bg-white/[0.05] text-white/55"}`}>{compareIds.includes(place.id) && <Check className="mr-1 inline h-3 w-3" />}{place.name}</button>)}</div>
        {compared.length > 0 && <div className="mt-3 overflow-x-auto"><table className="min-w-full text-left text-[8px]"><thead className="text-white/35"><tr><th className="p-2">Place</th><th className="p-2">Open</th><th className="p-2">Distance</th><th className="p-2">Price</th><th className="p-2">Rating</th><th className="p-2">Parking</th></tr></thead><tbody>{compared.map((row) => <tr key={row.id} className="border-t border-white/[0.05]"><td className="p-2 font-semibold">{row.name}</td><td className="p-2">{row.openStatus}</td><td className="p-2">{row.distanceKm == null ? "—" : `${row.distanceKm.toFixed(1)} km`}</td><td className="p-2">{row.priceMax == null ? "—" : `฿${row.priceMax}`}</td><td className="p-2">{row.rating ?? "—"}</td><td className="p-2">{row.parking ? "✓" : "—"}</td></tr>)}</tbody></table></div>}
      </div>}

      {mode === "trip" && <div className="mt-4">
        <p className="text-[9px] text-white/45">{language === "en" ? "Select up to 5 stops. The app orders them by nearest-next straight-line distance without calling a routing API." : "เลือกได้สูงสุด 5 จุด แอปเรียงจุดถัดไปที่ใกล้ที่สุดจากระยะเส้นตรง โดยไม่ยิง Routing API"}</p>
        <div className="mt-2 flex max-h-44 flex-wrap gap-1.5 overflow-y-auto">{topCandidates.map((place) => <button key={place.id} type="button" onClick={() => toggleId(place.id, tripIds, setTripIds, 5)} className={`rounded-lg px-2 py-1.5 text-[8px] ${tripIds.includes(place.id) ? "bg-[#007AFF] text-white" : "bg-white/[0.05] text-white/55"}`}>{tripIds.includes(place.id) && <Check className="mr-1 inline h-3 w-3" />}{place.name}</button>)}</div>
        {tripPlaces.length > 0 && <div className="mt-3 rounded-[18px] border border-white/[0.06] bg-black/10 p-3"><p className="text-[9px] font-bold">{language === "en" ? "Suggested order" : "ลำดับแนะนำ"} · {tripDistanceKm(tripPlaces, origin).toFixed(1)} km straight-line</p><div className="mt-2 space-y-1">{tripPlaces.map((place, index) => <button key={place.id} type="button" onClick={() => onOpenPlace(place)} className="flex w-full items-center gap-2 text-left text-[9px] text-white/65"><span className="grid h-5 w-5 place-items-center rounded-full bg-[#007AFF]/20 text-[8px] text-cyan-100">{index + 1}</span><span className="truncate">{place.name}</span></button>)}</div><div className="mt-3 flex gap-2"><button type="button" onClick={() => void saveTrip()} className="amd-btn amd-btn-primary min-h-10 flex-1 rounded-xl text-[9px]"><Save className="mr-1 inline h-3.5 w-3.5" />{language === "en" ? "Save to cloud" : "บันทึกขึ้นคลาวด์"}</button>{tripMapsUrl(tripPlaces) && <a href={tripMapsUrl(tripPlaces) || undefined} target="_blank" rel="noreferrer" className="amd-btn min-h-10 rounded-xl px-3 text-[9px]"><Route className="mr-1 inline h-3.5 w-3.5" />Maps</a>}</div></div>}
      </div>}

      {mode === "dorm" && <div className="mt-4"><p className="mb-3 text-[9px] text-white/45">{language === "en" ? "Daily essentials around the dorm" : "ของจำเป็นสำหรับชีวิตรอบหอ: ซักผ้า ยา ATM พัสดุ ซ่อม ฟิตเนส ที่จอดรถ"}</p><div className="space-y-2">{dormPlaces.slice(0, 7).map((place) => <CompactPlace key={place.id} place={place} language={language} onOpen={() => onOpenPlace(place)} onMap={() => onMapPlace(place)} />)}</div></div>}

      {mode === "emergency" && <div className="mt-4"><div className="mb-3 flex items-start gap-2 rounded-[16px] border border-rose-300/10 bg-rose-300/[0.04] p-3"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-200" /><p className="text-[9px] leading-4 text-rose-100/75">{language === "en" ? "Shows stored nearby hospital, clinic, pharmacy, fuel/repair data. For life-threatening emergencies, use official emergency services." : "แสดงโรงพยาบาล คลินิก ร้านยา ปั๊ม/ซ่อมจากข้อมูลที่แอปมี สำหรับเหตุฉุกเฉินรุนแรงให้ใช้บริการฉุกเฉินทางการ"}</p></div><div className="space-y-2">{emergency.length ? emergency.slice(0, 7).map((place) => <CompactPlace key={place.id} place={place} language={language} onOpen={() => onOpenPlace(place)} onMap={() => onMapPlace(place)} />) : <p className="py-5 text-center text-[10px] text-white/40">{language === "en" ? "No verified emergency-category places in the current dataset" : "ยังไม่มีสถานที่หมวดฉุกเฉินที่ยืนยันเพียงพอในชุดข้อมูล"}</p>}</div></div>}

      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/[0.06] pt-3">
        <button type="button" onClick={() => void enablePush()} disabled={pushState === "saving"} className="amd-btn min-h-11 rounded-xl px-3 text-[9px]"><BellRing className="mr-1 inline h-3.5 w-3.5" />{pushState === "ready" ? (language === "en" ? "Push ready" : "Push พร้อม") : (language === "en" ? "Enable smart alerts" : "เปิดแจ้งเตือนอัจฉริยะ")}</button>
        <div className="flex min-h-11 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 text-center text-[8px] text-white/45"><Footprints className="mr-1 h-3.5 w-3.5" />{typeof navigator !== "undefined" && !navigator.onLine ? (language === "en" ? "Offline read mode" : "โหมดอ่านออฟไลน์") : (language === "en" ? "Cloud-only state" : "ข้อมูลผู้ใช้อยู่บนคลาวด์")}</div>
      </div>
      {cloudMessage && <p className="mt-2 text-center text-[8px] text-cyan-100/65">{cloudMessage}</p>}
    </section>
  );
}

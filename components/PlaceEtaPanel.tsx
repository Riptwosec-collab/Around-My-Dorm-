"use client";

import { useState } from "react";
import { AlertTriangle, Navigation, RefreshCw } from "lucide-react";
import { googleMapsDirectionsFallbackUrl } from "@/lib/google-maps-links";
import {
  calculateRoute,
  getCachedRoute,
  type RouteMode,
  type RuntimeRouteResult,
} from "@/lib/routes/runtime-routes";
import type { Place } from "@/types/place";

type EtaState = "idle" | "loading" | "success" | "no_route" | "api_locked" | "error";

const MODES: Array<{ id: RouteMode; th: string; en: string }> = [
  { id: "walking", th: "เดิน", en: "Walk" },
  { id: "motorcycle", th: "มอไซค์", en: "Motorcycle" },
  { id: "driving", th: "รถ", en: "Drive" },
];

function formatDuration(seconds: number, language: "th" | "en") {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return language === "en" ? `${minutes} min` : `${minutes} นาที`;
}

function formatRouteDistance(meters: number, language: "th" | "en") {
  if (meters < 1000) return `${Math.round(meters)} ${language === "en" ? "m" : "ม."}`;
  const km = meters / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} ${language === "en" ? "km" : "กม."}`;
}

function errorState(error: unknown): Exclude<EtaState, "idle" | "loading" | "success"> {
  const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code) : "";
  if (code === "no_route") return "no_route";
  if (code === "api_locked") return "api_locked";
  return "error";
}

export function PlaceEtaPanel({ place, language }: { place: Place; language: "th" | "en" }) {
  const [mode, setMode] = useState<RouteMode>("walking");
  const initial = getCachedRoute(place.id, "walking");
  const [result, setResult] = useState<RuntimeRouteResult | null>(initial);
  const [state, setState] = useState<EtaState>(initial ? "success" : "idle");

  function selectMode(nextMode: RouteMode) {
    setMode(nextMode);
    const cached = getCachedRoute(place.id, nextMode);
    setResult(cached);
    setState(cached ? "success" : "idle");
  }

  async function run(force: boolean) {
    setState("loading");
    try {
      const next = await calculateRoute(place, mode, { force });
      setResult(next);
      setState("success");
    } catch (error) {
      setResult(null);
      setState(errorState(error));
    }
  }

  const copy = language === "en"
    ? {
        title: "Travel time from Baan Supha",
        calculate: "Calculate travel time",
        recalculate: "Recalculate",
        loading: "Calculating route…",
        noRoute: "No route is available for this travel mode.",
        locked: "Google API requests are locked. You can still open directions in Google Maps.",
        error: "Travel time is unavailable right now.",
        maps: "Open directions in Google Maps",
        disclaimer: "Walking and motorcycle routes can be incomplete. Check local conditions before travelling.",
        calculated: "Calculated",
      }
    : {
        title: "เวลาเดินทางจากบ้านสุภา",
        calculate: "คำนวณเวลาเดินทาง",
        recalculate: "คำนวณใหม่",
        loading: "กำลังคำนวณเส้นทาง…",
        noRoute: "ไม่พบเส้นทางสำหรับรูปแบบการเดินทางนี้",
        locked: "Google API ถูกล็อกอยู่ แต่ยังเปิดเส้นทางใน Google Maps ได้",
        error: "คำนวณเวลาเดินทางไม่ได้ในขณะนี้",
        maps: "เปิดเส้นทางใน Google Maps",
        disclaimer: "เส้นทางเดินและมอเตอร์ไซค์อาจไม่สมบูรณ์ ควรตรวจสอบสภาพเส้นทางก่อนเดินทาง",
        calculated: "คำนวณเมื่อ",
      };

  return (
    <section data-testid="place-eta-panel" className="mt-4 rounded-[24px] border border-cyan-300/10 bg-cyan-300/[0.035] p-4">
      <div className="flex items-center gap-2">
        <Navigation className="h-4 w-4 text-cyan-200" />
        <p className="text-[11px] font-bold text-white/85">{copy.title}</p>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {MODES.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={mode === item.id}
            onClick={() => selectMode(item.id)}
            className={`min-h-11 rounded-xl border px-2 text-[10px] font-bold ${mode === item.id ? "border-cyan-300/25 bg-cyan-300/[0.1] text-cyan-100" : "border-white/[0.07] bg-white/[0.035] text-white/55"}`}
          >
            {language === "en" ? item.en : item.th}
          </button>
        ))}
      </div>

      {state === "success" && result ? (
        <div className="mt-3 rounded-2xl border border-emerald-300/12 bg-emerald-300/[0.05] p-3">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-[20px] font-black text-emerald-100">{formatDuration(result.durationSeconds, language)}</span>
            <span className="text-[11px] font-semibold text-white/58">{formatRouteDistance(result.distanceMeters, language)}</span>
          </div>
          <p className="mt-1 text-[8px] text-white/35">
            {copy.calculated} {new Date(result.calculatedAt).toLocaleTimeString(language === "en" ? "en-GB" : "th-TH", { hour: "2-digit", minute: "2-digit" })}
          </p>
          {(mode === "walking" || mode === "motorcycle") && <p className="mt-2 text-[8px] leading-4 text-amber-100/55">{copy.disclaimer}</p>}
          <button type="button" onClick={() => void run(true)} className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 text-[9px] font-bold text-white/65">
            <RefreshCw className="h-3.5 w-3.5" />{copy.recalculate}
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={state === "loading"}
          onClick={() => void run(false)}
          className="mt-3 min-h-12 w-full rounded-2xl bg-cyan-300 px-4 text-[10px] font-black text-[#031018] disabled:cursor-wait disabled:opacity-55"
        >
          {state === "loading" ? copy.loading : copy.calculate}
        </button>
      )}

      {(state === "no_route" || state === "api_locked" || state === "error") && (
        <div className="mt-3 flex items-start gap-2 rounded-2xl border border-amber-300/12 bg-amber-300/[0.05] p-3 text-[9px] leading-4 text-amber-100/80">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{state === "no_route" ? copy.noRoute : state === "api_locked" ? copy.locked : copy.error}</span>
        </div>
      )}

      <a href={googleMapsDirectionsFallbackUrl(place)} target="_blank" rel="noreferrer" className="mt-3 flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 text-[9px] font-semibold text-white/55">
        <Navigation className="h-3.5 w-3.5" />{copy.maps}
      </a>
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Home, MapPin, RefreshCw } from "lucide-react";
import { isUsableHomeOrigin, loadHomeOrigin, notifyHomeOriginChanged } from "@/lib/home-origin";
import {
  confirmHomeOrigin,
  searchHomeOriginCandidates,
  shouldAutoRecommendHomeOrigin,
  type HomeOriginAssessment,
} from "@/lib/home-origin-resolver";
import type { HomeOrigin } from "@/types/place";

export function HomeOriginManager({
  language,
  adminAllowed,
}: {
  language: "th" | "en";
  adminAllowed: boolean;
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const [origin, setOrigin] = useState<HomeOrigin | null>(null);
  const [candidates, setCandidates] = useState<HomeOriginAssessment[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function refreshOrigin() {
    const next = await loadHomeOrigin();
    setOrigin(next);
    notifyHomeOriginChanged(next);
    return next;
  }

  useEffect(() => {
    let alive = true;
    void loadHomeOrigin()
      .then((next) => { if (alive) setOrigin(next); })
      .catch((error) => { if (alive) setMessage(error instanceof Error ? error.message : "HOME origin unavailable"); });
    return () => { alive = false; };
  }, []);

  async function search() {
    if (!adminAllowed || !apiKey) return;
    setBusy(true);
    setMessage(null);
    try {
      const next = await searchHomeOriginCandidates({ apiKey, language });
      setCandidates(next);
      if (!next.length) {
        setMessage(language === "en" ? "Google returned no HOME candidates." : "Google ไม่พบ Candidate ของบ้านสุภาอพาร์ทเม้นต์");
      } else {
        const recommended = shouldAutoRecommendHomeOrigin(next[0], next[1] || null);
        setMessage(
          language === "en"
            ? `${next.length} candidate(s) found.${recommended ? " Top candidate has strong evidence; review and confirm it." : " Review carefully; no candidate is auto-confirmed."}`
            : `พบ ${next.length} Candidate${recommended ? " • ตัวแรกมีหลักฐานค่อนข้างชัด ให้ตรวจที่อยู่แล้วกดยืนยัน" : " • ยังไม่ยืนยันอัตโนมัติ ให้ตรวจ Candidate ก่อน"}`,
        );
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "HOME search failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(item: HomeOriginAssessment) {
    if (!adminAllowed) return;
    setBusy(true);
    setMessage(null);
    try {
      const saved = await confirmHomeOrigin(item.candidate);
      setOrigin(saved);
      notifyHomeOriginChanged(saved);
      setCandidates([]);
      setMessage(language === "en" ? "HOME origin verified and saved." : "ยืนยัน HOME และบันทึกพิกัด Google แล้ว");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save HOME origin");
    } finally {
      setBusy(false);
    }
  }

  const verified = origin ? isUsableHomeOrigin(origin) : false;

  return (
    <section className="amd-glass amd-card mt-4 p-4" data-testid="home-origin-manager">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-cyan-300/20 bg-[#007AFF]/15">
          <Home className="h-5 w-5 text-[#00D9FF]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-bold">HOME / บ้านสุภาอพาร์ทเม้นต์</p>
            <span className={`rounded-full border px-2 py-1 text-[8px] font-bold ${verified ? "border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-200" : "border-amber-300/20 bg-amber-300/[0.06] text-amber-100"}`}>
              {verified ? "VERIFIED" : "UNRESOLVED"}
            </span>
          </div>
          {verified && origin ? (
            <div className="mt-2 text-[9px] leading-5 text-white/55">
              <p>{origin.formattedAddress || (language === "en" ? "Address unavailable" : "ไม่มีข้อมูลที่อยู่")}</p>
              <p>{origin.latitude?.toFixed(6)}, {origin.longitude?.toFixed(6)}</p>
              <p className="break-all">Place ID: {origin.googlePlaceId}</p>
            </div>
          ) : (
            <p className="mt-2 text-[9px] leading-5 text-amber-100/80">
              {language === "en" ? "HOME is not verified yet. Routes remain disabled until an exact Google Place is confirmed." : "HOME ยังไม่ได้ยืนยัน • ระบบ Routes จะยังไม่ทำงานจนกว่าจะยืนยัน Google Place ที่ถูกต้อง"}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <button type="button" disabled={!adminAllowed || !apiKey || busy} onClick={() => void search()} className="amd-btn amd-btn-primary min-h-11 flex-1 rounded-xl px-4 text-[9px] font-bold disabled:opacity-40">
          <span className="inline-flex items-center gap-2"><RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />{language === "en" ? "Find exact HOME on Google" : "ค้นหา HOME ที่ถูกต้องจาก Google"}</span>
        </button>
        <button type="button" disabled={busy} onClick={() => void refreshOrigin()} className="amd-chip min-h-11 px-3 text-[9px]">{language === "en" ? "Refresh" : "รีเฟรช"}</button>
      </div>

      {candidates.length > 0 && (
        <div className="mt-4 space-y-2">
          {candidates.slice(0, 6).map((item, index) => {
            const recommended = index === 0 && shouldAutoRecommendHomeOrigin(item, candidates[1] || null);
            return (
              <div key={item.candidate.googlePlaceId} className="rounded-2xl border border-white/[0.07] bg-black/15 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[10px] font-semibold">{item.candidate.name}</p>
                      <span className="rounded-full bg-white/[0.06] px-2 py-1 text-[8px]">{item.score}/100</span>
                      {recommended && <span className="rounded-full bg-emerald-300/[0.08] px-2 py-1 text-[8px] text-emerald-200">RECOMMENDED</span>}
                    </div>
                    <p className="mt-1 text-[8px] leading-4 text-white/45">{item.candidate.address || "ไม่มีข้อมูล"}</p>
                    <p className="mt-1 text-[8px] text-white/35">{item.candidate.latitude ?? "?"}, {item.candidate.longitude ?? "?"}</p>
                  </div>
                  <MapPin className="h-4 w-4 shrink-0 text-[#8ecbff]" />
                </div>
                <div className="mt-3 flex gap-2">
                  {item.candidate.googleMapsUrl && <a href={item.candidate.googleMapsUrl} target="_blank" rel="noreferrer" className="amd-chip grid min-h-9 place-items-center px-3 text-[8px]">Google Maps</a>}
                  <button type="button" disabled={busy || !adminAllowed} onClick={() => void confirm(item)} className="amd-chip min-h-9 flex-1 px-3 text-[8px] text-emerald-200 disabled:opacity-40">
                    <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5" />{language === "en" ? "Confirm as HOME" : "ยืนยันเป็น HOME"}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {message && <p className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2 text-[9px] leading-5 text-white/60">{message}</p>}
    </section>
  );
}

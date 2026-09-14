"use client";

import React, { useMemo } from "react";
import { AlertTriangle, CheckCircle2, Clock3, GitMerge, ShieldAlert } from "lucide-react";
import { canPublishCandidate, type PlaceCandidate } from "@/lib/maintenance/place-candidates";
import type { ReviewQueueItem } from "@/lib/maintenance/review-queue";
import type { Place } from "@/types/place";

function priorityTone(priority: ReviewQueueItem["priority"]) {
  if (priority === "p0") return "text-rose-200 border-rose-300/15 bg-rose-300/[0.05]";
  if (priority === "p1") return "text-amber-100 border-amber-300/15 bg-amber-300/[0.05]";
  if (priority === "p2") return "text-cyan-100 border-cyan-300/15 bg-cyan-300/[0.05]";
  return "text-white/60 border-white/[0.08] bg-white/[0.03]";
}

function reasonLabel(reason: ReviewQueueItem["reasons"][number], language: "th" | "en") {
  const labels: Record<typeof reason, { th: string; en: string }> = {
    new_place: { th: "ร้านใหม่", en: "New place" },
    invalid_coordinates: { th: "พิกัดไม่ถูกต้อง", en: "Invalid coordinates" },
    identity_conflict: { th: "ข้อมูลตัวตนขัดแย้ง", en: "Identity conflict" },
    possible_duplicate: { th: "อาจเป็นร้านซ้ำ", en: "Possible duplicate" },
    category_mismatch: { th: "หมวดต้องตรวจ", en: "Category mismatch" },
    local_chain_ambiguity: { th: "Local/Chain ไม่ชัด", en: "Local/Chain unclear" },
    missing_maps: { th: "ไม่มี Maps", en: "Missing Maps" },
    missing_hours: { th: "ไม่มีเวลาเปิด", en: "Missing hours" },
    stale_record: { th: "ข้อมูลเก่า", en: "Stale record" },
    missing_photo: { th: "ไม่มีรูป", en: "Missing photo" },
    missing_price: { th: "ไม่มีราคา", en: "Missing price" },
    high_risk_change: { th: "การเปลี่ยนแปลงความเสี่ยงสูง", en: "High-risk change" },
  };
  return labels[reason][language];
}

export function ReviewQueuePanel({
  items,
  candidates,
  places,
  language,
  onPublishCandidate,
  onRejectCandidate,
  onKeepSeparate,
  onReviewLater,
}: {
  items: ReviewQueueItem[];
  candidates: PlaceCandidate[];
  places: Place[];
  language: "th" | "en";
  onPublishCandidate: (candidateId: string) => void;
  onRejectCandidate: (candidateId: string) => void;
  onKeepSeparate: (candidateId: string) => void;
  onReviewLater: (candidateId: string) => void;
}) {
  const candidatesById = useMemo(() => new Map(candidates.map((candidate) => [candidate.id, candidate])), [candidates]);
  const placesById = useMemo(() => new Map(places.map((place) => [place.id, place])), [places]);
  const visible = items.slice(0, 40);

  return (
    <section data-testid="review-queue" className="amd-glass amd-card mt-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-amber-200" /><p className="text-[12px] font-bold">{language === "en" ? "Review Queue" : "คิวตรวจสอบข้อมูล"}</p></div>
          <p className="mt-1 text-[9px] leading-4 text-[var(--amd-text-3)]">{language === "en" ? "Deterministic queue from canonical health, staged candidates and review blockers." : "รวมรายการจาก Data Health, Candidate และตัวบล็อกการ Publish แบบ deterministic"}</p>
        </div>
        <span className="rounded-full border border-white/[0.08] bg-white/[0.035] px-2.5 py-1.5 text-[8px] text-white/60">{items.length}</span>
      </div>

      <div className="mt-4 space-y-2">
        {visible.map((item) => {
          const candidate = item.kind === "candidate" ? candidatesById.get(item.entityId) : undefined;
          const gate = candidate ? canPublishCandidate(candidate) : null;
          const matches = candidate?.possibleMatchIds.map((id) => placesById.get(id)).filter((place): place is Place => Boolean(place)) ?? [];
          return (
            <article key={item.id} className="rounded-2xl border border-white/[0.07] bg-black/10 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2 py-1 text-[8px] font-bold uppercase ${priorityTone(item.priority)}`}>{item.priority.toUpperCase()}</span><p className="truncate text-[11px] font-semibold">{item.title}</p></div>
                  <p className="mt-1 text-[8px] text-[var(--amd-text-3)]">{item.category || "unknown"} • {item.source || "unknown source"}{item.ringId ? ` • ${item.ringId.toUpperCase()}` : ""}</p>
                </div>
                {item.priority === "p0" || item.priority === "p1" ? <AlertTriangle className="h-4 w-4 shrink-0 text-amber-200" /> : <Clock3 className="h-4 w-4 shrink-0 text-white/30" />}
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">{item.reasons.map((reason) => <span key={reason} className="rounded-full bg-white/[0.04] px-2 py-1 text-[8px] text-white/55">{reasonLabel(reason, language)}</span>)}</div>

              {candidate && (
                <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
                  <div className="flex items-center gap-2"><GitMerge className="h-3.5 w-3.5 text-[#8ecbff]" /><p className="text-[9px] font-bold">{language === "en" ? "Candidate evidence" : "หลักฐาน Candidate"}</p></div>
                  <div className="mt-2 grid gap-1 text-[8px] text-white/55">
                    <p>{candidate.proposedPlace.name}</p>
                    {candidate.proposedPlace.phone && <p>{candidate.proposedPlace.phone}</p>}
                    {candidate.proposedPlace.address && <p>{candidate.proposedPlace.address}</p>}
                    <p>{candidate.sourceProvider} • match {candidate.matchScore}</p>
                  </div>

                  {matches.length > 0 && <div className="mt-2 space-y-1 border-t border-white/[0.06] pt-2">{matches.map((place) => <div key={place.id} className="text-[8px] text-amber-100/80"><span className="font-semibold">{place.name}</span>{place.phone ? ` • ${place.phone}` : ""}{place.address ? ` • ${place.address}` : ""}</div>)}</div>}

                  {gate && !gate.allowed ? <div data-testid="candidate-publish-blocked" className="mt-2 rounded-lg border border-amber-300/10 bg-amber-300/[0.04] px-2.5 py-2 text-[8px] text-amber-100">{language === "en" ? `Publish blocked: ${gate.blockers.join(", ")}` : `ยัง Publish ไม่ได้: ${gate.blockers.join(", ")}`}</div> : <div className="mt-2 flex items-center gap-1 text-[8px] text-emerald-200"><CheckCircle2 className="h-3 w-3" />{language === "en" ? "Publish gate passed" : "ผ่าน Publish gate"}</div>}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" disabled={!gate?.allowed} onClick={() => onPublishCandidate(candidate.id)} className="amd-chip h-9 min-h-0 px-3 text-[8px] font-bold disabled:cursor-not-allowed disabled:opacity-35">{language === "en" ? "Publish" : "เผยแพร่"}</button>
                    <button type="button" onClick={() => onRejectCandidate(candidate.id)} className="amd-chip h-9 min-h-0 px-3 text-[8px]">{language === "en" ? "Reject" : "ปฏิเสธ"}</button>
                    <button type="button" onClick={() => onKeepSeparate(candidate.id)} className="amd-chip h-9 min-h-0 px-3 text-[8px]">{language === "en" ? "Keep Separate" : "แยกร้าน"}</button>
                    <button type="button" onClick={() => onReviewLater(candidate.id)} className="amd-chip h-9 min-h-0 px-3 text-[8px]">{language === "en" ? "Review Later" : "ตรวจภายหลัง"}</button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
        {!visible.length && <p className="rounded-xl border border-emerald-300/10 bg-emerald-300/[0.04] p-3 text-[9px] text-emerald-100">{language === "en" ? "Review queue is clear." : "ไม่มีรายการรอตรวจในคิว"}</p>}
      </div>
    </section>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Link2, MapPin, Search, ShieldAlert, ShieldCheck, Unlink2, X } from "lucide-react";
import { applyLocalPlacePatch } from "@/lib/database/places";
import {
  DEFAULT_MATCH_CONFIDENCE_THRESHOLD,
  assessGooglePlaceMatch,
  auditExistingPlaceIds,
  buildGoogleMatchQuery,
  isChainPlace,
  placeIdCoverageSummary,
  placeIdIntegrityStatus,
  type GooglePlaceMatchAssessment,
  type PlaceIdIntegrityStatus,
} from "@/lib/google-place-id-manager";
import { estimateGoogleTextSearchRequests, runGoogleTextSearchRequest } from "@/lib/google-request-manager";
import type { GoogleDiscoveryCandidate } from "@/lib/google-live";
import { loadGooglePlaceMatchRecords, loadMatchConfidenceThreshold, rejectedGooglePlaceIds, saveGooglePlaceMatchRecord, saveMatchConfidenceThreshold } from "@/lib/storage/google-place-matches";
import type { Place } from "@/types/place";
import { getGoogleApiControlSettings } from "@/lib/google-api-control";

type Filter = "all" | "linked" | "missing" | "needs_review" | "possible_wrong_match" | "chain";
type CandidateAssessment = { candidate: GoogleDiscoveryCandidate; assessment: GooglePlaceMatchAssessment };

function statusLabel(status: PlaceIdIntegrityStatus, language: "th" | "en") {
  if (status === "linked") return language === "en" ? "Linked" : "เชื่อมแล้ว";
  if (status === "missing") return language === "en" ? "Missing Place ID" : "ยังไม่มี Place ID";
  if (status === "needs_review") return language === "en" ? "Needs Review" : "ต้องตรวจสอบ";
  return language === "en" ? "Possible Wrong Match" : "อาจจับคู่ผิด";
}

function factorText(score: number | null, label: string) {
  return score == null ? "—" : `${label} ${Math.round(score * 100)}%`;
}

export function GooglePlaceIdManager({ places, language, onReload }: { places: Place[]; language: "th" | "en"; onReload: () => void }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const [filter, setFilter] = useState<Filter>("all");
  const [matchingPlace, setMatchingPlace] = useState<Place | null>(null);
  const [candidates, setCandidates] = useState<CandidateAssessment[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [pendingLowConfidence, setPendingLowConfidence] = useState<CandidateAssessment | null>(null);
  const [threshold, setThreshold] = useState(DEFAULT_MATCH_CONFIDENCE_THRESHOLD);
  const [apiLocked, setApiLocked] = useState(() => getGoogleApiControlSettings().locked);

  useEffect(() => {
    void loadGooglePlaceMatchRecords().then(() => setThreshold(loadMatchConfidenceThreshold(DEFAULT_MATCH_CONFIDENCE_THRESHOLD))).catch(() => undefined);
    const syncLock = () => setApiLocked(getGoogleApiControlSettings().locked);
    window.addEventListener("amd-google-api-control-change", syncLock);
    return () => window.removeEventListener("amd-google-api-control-change", syncLock);
  }, []);

  const auditIssues = useMemo(() => auditExistingPlaceIds(places), [places]);
  const summary = useMemo(() => placeIdCoverageSummary(places, auditIssues), [places, auditIssues]);
  const statusById = useMemo(() => new Map(places.map((place) => [place.id, placeIdIntegrityStatus(place, auditIssues)])), [places, auditIssues]);
  const filteredPlaces = useMemo(() => places.filter((place) => {
    const status = statusById.get(place.id);
    if (filter === "all") return true;
    if (filter === "chain") return isChainPlace(place);
    return status === filter;
  }), [places, filter, statusById]);

  const matchQuery = matchingPlace ? buildGoogleMatchQuery(matchingPlace) : "";
  const matchCenter = matchingPlace?.latitude != null && matchingPlace?.longitude != null ? { lat: matchingPlace.latitude, lng: matchingPlace.longitude } : null;
  const matchRadius = matchingPlace && isChainPlace(matchingPlace) ? 1200 : 2500;
  const estimate = useMemo(() => matchCenter ? estimateGoogleTextSearchRequests({ query: matchQuery, center: matchCenter, radiusMeters: matchRadius, language }) : null, [matchQuery, matchCenter, matchRadius, language]);

  function startMatch(place: Place) {
    setMatchingPlace(place);
    setCandidates([]);
    setSearched(false);
    setError(null);
  }

  async function runMatchSearch() {
    if (!matchingPlace || !matchCenter || !matchQuery || !apiKey || searching) return;
    setSearching(true);
    setError(null);
    setSearched(true);
    try {
      const result = await runGoogleTextSearchRequest({ apiKey, query: matchQuery, center: matchCenter, radiusMeters: matchRadius, language, maxResults: 8 });
      const rejected = rejectedGooglePlaceIds(matchingPlace.id);
      const assessed = result.candidates
        .filter((candidate) => !rejected.has(candidate.googlePlaceId))
        .map((candidate) => ({ candidate, assessment: assessGooglePlaceMatch(matchingPlace, candidate, places) }))
        .sort((a, b) => b.assessment.confidence - a.assessment.confidence);
      setCandidates(assessed);
    } catch (reason) {
      setCandidates([]);
      setError(reason instanceof Error ? reason.message : "Google match search failed");
    } finally {
      setSearching(false);
    }
  }

  async function recordDecision(item: CandidateAssessment, decision: "linked" | "rejected" | "review") {
    if (!matchingPlace) return;
    await saveGooglePlaceMatchRecord({
      localPlaceId: matchingPlace.id,
      googlePlaceId: item.candidate.googlePlaceId,
      candidateName: item.candidate.name,
      decision,
      confidence: item.assessment.confidence,
      distanceMeters: item.assessment.distanceMeters,
      chainSafetyPassed: item.assessment.chainSafetyPassed,
    });
  }

  async function performLink(item: CandidateAssessment) {
    if (!matchingPlace || item.assessment.hardBlocked) return;
    await applyLocalPlacePatch(matchingPlace, {
      googlePlaceId: item.candidate.googlePlaceId,
      googleMaps: {
        placeId: item.candidate.googlePlaceId,
        url: item.candidate.googleMapsUrl,
        latitude: item.candidate.latitude,
        longitude: item.candidate.longitude,
      },
    }, "google_place_id_manual_link");
    await recordDecision(item, "linked");
    setPendingLowConfidence(null);
    setCandidates([]);
    setMatchingPlace(null);
    onReload();
  }

  async function requestLink(item: CandidateAssessment) {
    if (item.assessment.hardBlocked) return;
    if (item.assessment.confidence < threshold) {
      await recordDecision(item, "review");
      setPendingLowConfidence(item);
      return;
    }
    await performLink(item);
  }

  async function rejectCandidate(item: CandidateAssessment) {
    await recordDecision(item, "rejected");
    setCandidates((current) => current.filter((candidate) => candidate.candidate.googlePlaceId !== item.candidate.googlePlaceId));
  }

  const filters: Array<{ id: Filter; label: string; count: number }> = [
    { id: "all", label: language === "en" ? "All" : "ทั้งหมด", count: summary.total },
    { id: "linked", label: language === "en" ? "Linked" : "เชื่อมแล้ว", count: summary.linked },
    { id: "missing", label: language === "en" ? "Missing" : "ยังไม่มี", count: summary.missing },
    { id: "needs_review", label: language === "en" ? "Needs Review" : "ต้องตรวจ", count: summary.needsReview },
    { id: "possible_wrong_match", label: language === "en" ? "Possible Wrong" : "อาจผิด", count: summary.possibleWrongMatch },
    { id: "chain", label: language === "en" ? "Chain Locations" : "ร้าน Chain", count: summary.chainLocations },
  ];

  return (
    <section data-testid="google-place-id-manager" className="amd-glass amd-card mt-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2"><p className="text-[11px] font-bold">GOOGLE PLACE ID MANAGER</p><span className="rounded-full border border-cyan-300/20 bg-cyan-300/[0.07] px-2 py-1 text-[8px] font-extrabold text-cyan-200">MANUAL LINKING</span></div>
          <p className="mt-1 text-[9px] leading-5 text-[var(--amd-text-2)]">{language === "en" ? "Coverage, filters and audits are local. Google Search only runs after an explicit request button is pressed." : "การนับ Coverage, Filter และ Audit ทำในเครื่องทั้งหมด Google Search จะเริ่มเมื่อกด Run Request อย่างชัดเจนเท่านั้น"}</p>
        </div>
        <Link2 className="h-5 w-5 shrink-0 text-[#00D9FF]" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          [language === "en" ? "Total Places" : "ทั้งหมด", summary.total],
          [language === "en" ? "Place ID Linked" : "เชื่อม Place ID", summary.linked],
          [language === "en" ? "Missing Place ID" : "ไม่มี Place ID", summary.missing],
          [language === "en" ? "Needs Review" : "ต้องตรวจ", summary.needsReview],
          [language === "en" ? "Possible Wrong" : "อาจจับคู่ผิด", summary.possibleWrongMatch],
        ].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-white/[0.06] bg-black/10 p-3"><p className="text-[8px] leading-4 text-white/36">{label}</p><p className="mt-1 text-[19px] font-bold">{value}</p></div>)}
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {filters.map((item) => <button key={item.id} data-testid={`place-id-filter-${item.id}`} type="button" onClick={() => setFilter(item.id)} className={`amd-chip h-9 min-h-0 shrink-0 px-3 text-[8px] ${filter === item.id ? "amd-chip-active" : ""}`}>{item.label} <span className="ml-1 text-white/35">{item.count}</span></button>)}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-black/10 p-3">
        <div><p className="text-[9px] font-semibold">{language === "en" ? "Low-confidence link threshold" : "เกณฑ์ Low Confidence"}</p><p className="mt-1 text-[8px] text-white/32">{language === "en" ? "Below this score, explicit confirmation is required." : "ต่ำกว่าค่านี้ต้องยืนยันซ้ำก่อน Link"}</p></div>
        <select value={threshold} onChange={(event) => { const value = Number(event.target.value); setThreshold(value); void saveMatchConfidenceThreshold(value); }} className="amd-input h-10 rounded-xl bg-[#07111f] px-3 text-[9px]">{[60, 70, 75, 80, 90].map((value) => <option key={value} value={value}>{value}%</option>)}</select>
      </div>

      <button type="button" data-testid="audit-place-ids" onClick={() => setAuditOpen((value) => !value)} className="amd-chip mt-3 flex min-h-11 w-full items-center justify-center gap-2 px-4 text-[9px] font-bold text-[#8ecbff]"><ShieldCheck className="h-4 w-4" />{language === "en" ? "Audit Existing Place IDs — 0 Google Requests" : "Audit Place ID ที่มีอยู่ — 0 Google Requests"}</button>
      {auditOpen && <div className="mt-3 rounded-2xl border border-white/[0.06] bg-black/10 p-3"><p className="text-[9px] font-semibold">LOCAL PLACE ID AUDIT</p><p className="mt-1 text-[8px] text-white/34">{auditIssues.length ? `${auditIssues.length} issue(s) detected locally.` : (language === "en" ? "No local Place ID integrity issues detected." : "ไม่พบปัญหา Place ID จากการตรวจในเครื่อง")}</p>{auditIssues.length > 0 && <div className="mt-2 space-y-2">{auditIssues.slice(0, 20).map((issue) => <div key={issue.id} className={`rounded-xl border p-2 text-[8px] leading-4 ${issue.severity === "high" ? "border-rose-300/15 bg-rose-300/[0.05] text-rose-100" : "border-amber-300/15 bg-amber-300/[0.05] text-amber-100"}`}><strong>{issue.kind.replaceAll("_", " ").toUpperCase()}</strong><br />{issue.message}</div>)}</div>}</div>}

      <div className="mt-4 space-y-2">
        {filteredPlaces.slice(0, 100).map((place) => {
          const status = statusById.get(place.id) || "missing";
          const isMatching = matchingPlace?.id === place.id;
          return <article key={place.id} className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-[11px] font-semibold">{place.name}</p><p className="mt-1 truncate text-[8px] text-white/36">{place.soi || place.area || place.address || "—"}</p></div><span className={`shrink-0 rounded-full border px-2 py-1 text-[7px] font-bold ${status === "linked" ? "border-emerald-300/15 text-emerald-200" : status === "missing" ? "border-white/10 text-white/45" : status === "needs_review" ? "border-amber-300/15 text-amber-100" : "border-rose-300/15 text-rose-100"}`}>{statusLabel(status, language)}</span></div>
            <div className="mt-2 flex items-center justify-between gap-2"><p className="truncate text-[8px] text-white/28">Google Place ID: {place.googlePlaceId || (language === "en" ? "Not linked" : "ยังไม่เชื่อม")}</p>{!place.googlePlaceId && <button type="button" disabled={place.latitude == null || place.longitude == null} onClick={() => startMatch(place)} className="amd-chip h-9 min-h-0 shrink-0 px-3 text-[8px] font-bold text-[#8ecbff] disabled:opacity-35"><Search className="mr-1 inline h-3 w-3" />{language === "en" ? "Find Google Match" : "หา Google Match"}</button>}</div>
            {isMatching && <div className="mt-3 rounded-2xl border border-[#149CFF]/15 bg-[#007AFF]/[0.045] p-3">
              <div className="flex items-center justify-between gap-3"><div><p className="text-[8px] font-bold text-[#8ecbff]">MATCH REQUEST ESTIMATE</p><p className="mt-1 text-[8px] text-white/35">{matchQuery}</p></div><button type="button" onClick={() => { setMatchingPlace(null); setCandidates([]); }} className="grid h-8 w-8 place-items-center rounded-full bg-white/[0.05]"><X className="h-3.5 w-3.5" /></button></div>
              <div className="mt-3 flex items-end justify-between"><div><p className="text-[8px] text-white/32">{language === "en" ? "Estimated requests" : "Estimated Requests"}</p><p className="mt-1 text-[20px] font-bold text-[#19E6FF]">{estimate?.newRequests ?? 0}</p></div><p className="text-[8px] text-white/28">{estimate?.cacheHits ? "Cache hit available" : "No request has been sent"}</p></div>
              {!matchCenter && <p className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.05] p-2 text-[8px] text-amber-100">Coordinates are required before Place ID matching.</p>}
              <button type="button" disabled={!apiKey || apiLocked || !matchCenter || searching} onClick={() => void runMatchSearch()} className="amd-btn amd-btn-primary mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-[9px] font-bold disabled:opacity-40"><Search className="h-3.5 w-3.5" />{apiLocked ? (language === "en" ? "Google Requests Locked" : "Google Requests Locked") : searching ? (language === "en" ? "Searching…" : "กำลังค้นหา…") : estimate?.newRequests === 0 && estimate?.cacheHits ? (language === "en" ? "Use Cached Search — 0 New" : "ใช้ Cache — 0 Request ใหม่") : (language === "en" ? "Run 1 Google Search Request" : "Run 1 Google Search Request")}</button>
              {error && <p className="mt-2 rounded-xl border border-rose-300/10 bg-rose-300/[0.04] p-2 text-[8px] text-rose-100">{error}</p>}
              {searched && !searching && !candidates.length && !error && <p className="mt-3 text-[8px] text-white/35">{language === "en" ? "No acceptable candidates returned." : "ไม่พบ Candidate ที่ใช้ได้"}</p>}
              <div className="mt-3 space-y-2">{candidates.map((item) => <div key={item.candidate.googlePlaceId} className="rounded-2xl border border-white/[0.07] bg-black/10 p-3">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-[11px] font-semibold">{item.candidate.name}</p><p className="mt-1 text-[8px] leading-4 text-white/36">{item.candidate.address || "—"}</p></div><div className="text-right"><p className={`text-[18px] font-bold ${item.assessment.confidence >= threshold ? "text-emerald-200" : "text-amber-100"}`}>{item.assessment.confidence}%</p><p className="text-[7px] text-white/28">Internal confidence</p></div></div>
                <div className="mt-2 grid grid-cols-2 gap-1 text-[8px] text-white/42"><span>Name match</span><strong>{factorText(item.assessment.factors.name.score, item.assessment.factors.name.label)}</strong><span>Distance</span><strong>{item.assessment.distanceMeters == null ? "—" : `${item.assessment.distanceMeters} m`}</strong><span>Address match</span><strong>{factorText(item.assessment.factors.address.score, item.assessment.factors.address.label)}</strong><span>Category match</span><strong>{factorText(item.assessment.factors.category.score, item.assessment.factors.category.label)}</strong></div>
                {item.assessment.confidence < threshold && <div className="mt-2 rounded-xl border border-amber-300/15 bg-amber-300/[0.05] p-2 text-[8px] text-amber-100"><AlertTriangle className="mr-1 inline h-3 w-3" />LOW CONFIDENCE MATCH • Manual verification required.</div>}
                {item.assessment.isChain && <div className={`mt-2 rounded-xl border p-2 text-[8px] ${item.assessment.chainSafetyPassed ? "border-emerald-300/10 bg-emerald-300/[0.04] text-emerald-100" : "border-rose-300/12 bg-rose-300/[0.04] text-rose-100"}`}>{item.assessment.chainSafetyPassed ? <CheckCircle2 className="mr-1 inline h-3 w-3" /> : <ShieldAlert className="mr-1 inline h-3 w-3" />}Chain safety: {item.assessment.chainSafetyPassed ? "passed" : "blocked"}</div>}
                {item.assessment.blockReasons.length > 0 && <p className="mt-2 text-[8px] leading-4 text-rose-100">{item.assessment.blockReasons.join(" • ")}</p>}
                <div className="mt-3 grid grid-cols-3 gap-2"><button type="button" disabled={item.assessment.hardBlocked} onClick={() => requestLink(item)} className="amd-chip min-h-10 text-[8px] font-bold text-emerald-200 disabled:opacity-30"><Link2 className="mr-1 inline h-3 w-3" />{language === "en" ? "Link Place ID" : "Link Place ID"}</button>{item.candidate.googleMapsUrl ? <a href={item.candidate.googleMapsUrl} target="_blank" rel="noreferrer" className="amd-chip flex min-h-10 items-center justify-center gap-1 text-[8px] font-bold">{language === "en" ? "View Google" : "ดู Google"}<ExternalLink className="h-3 w-3" /></a> : <span /> }<button type="button" onClick={() => rejectCandidate(item)} className="amd-chip min-h-10 text-[8px] font-bold"><Unlink2 className="mr-1 inline h-3 w-3" />{language === "en" ? "Reject" : "Reject"}</button></div>
              </div>)}</div>
            </div>}
          </article>;
        })}
      </div>

      {pendingLowConfidence && matchingPlace && <div className="amd-sheet-backdrop z-[145]"><button type="button" aria-label="Close" className="absolute inset-0" onClick={() => setPendingLowConfidence(null)} /><section className="amd-sheet amd-glass-strong relative w-full max-w-[440px] rounded-t-[30px] p-5"><div className="flex items-center gap-2 text-amber-100"><AlertTriangle className="h-5 w-5" /><p className="text-[10px] font-bold">LOW CONFIDENCE MATCH</p></div><h3 className="mt-2 text-[18px] font-bold">{pendingLowConfidence.candidate.name}</h3><p className="mt-2 text-[10px] leading-5 text-white/52">Internal confidence {pendingLowConfidence.assessment.confidence}% is below the configured {threshold}% threshold. Confirm only after manually verifying branch identity, coordinates and address.</p><div className="mt-4 flex gap-2"><button type="button" onClick={() => setPendingLowConfidence(null)} className="amd-chip flex-1 min-h-11 text-[9px]">Cancel</button><button type="button" onClick={() => performLink(pendingLowConfidence)} className="amd-btn amd-btn-primary flex-1 rounded-xl text-[9px] font-bold">Explicitly Link</button></div></section></div>}
    </section>
  );
}

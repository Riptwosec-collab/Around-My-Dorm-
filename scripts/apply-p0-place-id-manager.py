from pathlib import Path

ROOT = Path('.')

place_id_lib = r'''import { haversineKm, normalizeText } from "@/lib/place-utils";
import type { CategoryId, Place } from "@/types/place";
import type { GoogleDiscoveryCandidate } from "@/lib/google-live";

export type PlaceIdIntegrityStatus = "linked" | "missing" | "needs_review" | "possible_wrong_match";
export type PlaceIdAuditSeverity = "review" | "high";
export type MatchFactorKey = "name" | "coordinates" | "address" | "category" | "phone" | "website";

export type PlaceIdAuditIssue = {
  id: string;
  placeIds: string[];
  googlePlaceId?: string;
  kind: "duplicate_google_place_id" | "missing_coordinates" | "google_maps_identity_conflict" | "distant_link" | "chain_conflict";
  severity: PlaceIdAuditSeverity;
  message: string;
};

export type MatchFactor = {
  key: MatchFactorKey;
  weight: number;
  score: number | null;
  label: "High" | "Medium" | "Low" | "Unavailable";
};

export type GooglePlaceMatchAssessment = {
  confidence: number;
  factors: Record<MatchFactorKey, MatchFactor>;
  distanceMeters: number | null;
  isChain: boolean;
  chainSafetyPassed: boolean;
  duplicateGooglePlaceId: boolean;
  hardBlocked: boolean;
  blockReasons: string[];
};

export type PlaceIdCoverageSummary = {
  total: number;
  linked: number;
  missing: number;
  needsReview: number;
  possibleWrongMatch: number;
  chainLocations: number;
};

export const DEFAULT_MATCH_CONFIDENCE_THRESHOLD = 75;

const CHAIN_NAME_PATTERNS = [
  /\b7[\s-]?eleven\b/i,
  /เซเว่น/i,
  /\bstarbucks\b/i,
  /cafe amazon/i,
  /คาเฟ่อเมซอน/i,
  /\bkfc\b/i,
  /mcdonald/i,
  /burger king/i,
  /\bsubway\b/i,
  /lotus'?s?/i,
  /\bbig c\b/i,
];

const CATEGORY_GOOGLE_TYPES: Partial<Record<CategoryId, string[]>> = {
  cafe: ["cafe", "coffee_shop"],
  food: ["restaurant", "food", "meal_takeaway"],
  local_food: ["restaurant", "food", "meal_takeaway"],
  thai_food: ["thai_restaurant", "restaurant"],
  japanese: ["japanese_restaurant", "restaurant"],
  korean_food: ["korean_restaurant", "restaurant"],
  chinese_food: ["chinese_restaurant", "restaurant"],
  noodle: ["restaurant", "food"],
  mookata: ["restaurant", "barbecue_restaurant"],
  bbq: ["barbecue_restaurant", "restaurant"],
  hotpot: ["restaurant"],
  bar: ["bar", "pub"],
  convenience: ["convenience_store"],
  supermarket: ["supermarket", "grocery_store"],
  pharmacy: ["pharmacy"],
  hospital: ["hospital"],
  clinic: ["doctor", "medical_clinic"],
  parking: ["parking"],
  monthly_parking: ["parking"],
  fitness: ["gym", "fitness_center"],
  laundry: ["laundry"],
  barber: ["barber_shop", "hair_salon"],
  salon: ["hair_salon", "beauty_salon"],
  gas_station: ["gas_station"],
  atm: ["atm"],
  bank: ["bank"],
  post_office: ["post_office"],
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const saved = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = saved;
    }
  }
  return previous[b.length];
}

export function textSimilarity(a: string | null | undefined, b: string | null | undefined) {
  const left = normalizeText(a || "");
  const right = normalizeText(b || "");
  if (!left || !right) return null;
  if (left === right) return 1;
  const maxLength = Math.max(left.length, right.length);
  const editScore = 1 - levenshtein(left, right) / maxLength;
  const leftTokens = new Set(left.split(/\s+/).filter(Boolean));
  const rightTokens = new Set(right.split(/\s+/).filter(Boolean));
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size || 1;
  const tokenScore = overlap / union;
  return clamp01(Math.max(editScore, tokenScore));
}

function scoreLabel(score: number | null): MatchFactor["label"] {
  if (score == null) return "Unavailable";
  if (score >= 0.8) return "High";
  if (score >= 0.55) return "Medium";
  return "Low";
}

function coordinateScore(distanceMeters: number | null) {
  if (distanceMeters == null) return null;
  if (distanceMeters <= 25) return 1;
  if (distanceMeters <= 75) return 0.92;
  if (distanceMeters <= 150) return 0.8;
  if (distanceMeters <= 300) return 0.58;
  if (distanceMeters <= 750) return 0.25;
  return 0;
}

function categoryScore(place: Place, candidate: GoogleDiscoveryCandidate) {
  const type = String(candidate.primaryType || "").toLowerCase();
  if (!type) return null;
  const expected = new Set(place.categories.flatMap((category) => CATEGORY_GOOGLE_TYPES[category] || []));
  if (!expected.size) return null;
  return expected.has(type) ? 1 : 0.25;
}

export function isChainPlace(place: Place) {
  if (place.placeType === "chain" || place.placeType === "franchise") return true;
  return CHAIN_NAME_PATTERNS.some((pattern) => pattern.test(place.name));
}

export function buildGoogleMatchQuery(place: Place) {
  return [place.name, place.address || place.soi || place.area].filter(Boolean).join(" ").trim();
}

export function usedGooglePlaceIds(places: Place[]) {
  const map = new Map<string, string[]>();
  for (const place of places) {
    if (!place.googlePlaceId) continue;
    const list = map.get(place.googlePlaceId) || [];
    list.push(place.id);
    map.set(place.googlePlaceId, list);
  }
  return map;
}

export function assessGooglePlaceMatch(place: Place, candidate: GoogleDiscoveryCandidate, places: Place[]): GooglePlaceMatchAssessment {
  const distanceMeters = place.latitude != null && place.longitude != null && candidate.latitude != null && candidate.longitude != null
    ? Math.round(haversineKm({ lat: place.latitude, lng: place.longitude }, { lat: candidate.latitude, lng: candidate.longitude }) * 1000)
    : null;
  const factorsArray: MatchFactor[] = [
    { key: "name", weight: 35, score: textSimilarity(place.name, candidate.name), label: "Unavailable" },
    { key: "coordinates", weight: 30, score: coordinateScore(distanceMeters), label: "Unavailable" },
    { key: "address", weight: 15, score: textSimilarity(place.address || `${place.soi || ""} ${place.area || ""}`, candidate.address), label: "Unavailable" },
    { key: "category", weight: 10, score: categoryScore(place, candidate), label: "Unavailable" },
    { key: "phone", weight: 5, score: null, label: "Unavailable" },
    { key: "website", weight: 5, score: null, label: "Unavailable" },
  ].map((factor) => ({ ...factor, label: scoreLabel(factor.score) }));
  const available = factorsArray.filter((factor) => factor.score != null);
  const weightTotal = available.reduce((sum, factor) => sum + factor.weight, 0);
  const weighted = available.reduce((sum, factor) => sum + (factor.score || 0) * factor.weight, 0);
  const confidence = weightTotal ? Math.round((weighted / weightTotal) * 100) : 0;
  const factorMap = Object.fromEntries(factorsArray.map((factor) => [factor.key, factor])) as Record<MatchFactorKey, MatchFactor>;
  const linkedElsewhere = places.some((item) => item.id !== place.id && item.googlePlaceId === candidate.googlePlaceId);
  const chain = isChainPlace(place);
  const chainAddressScore = factorMap.address.score;
  const chainSafetyPassed = !chain || (
    distanceMeters != null && distanceMeters <= 150 &&
    chainAddressScore != null && chainAddressScore >= 0.45 &&
    !linkedElsewhere
  );
  const blockReasons: string[] = [];
  if (linkedElsewhere) blockReasons.push("Google Place ID is already linked to another local record");
  if (chain && distanceMeters == null) blockReasons.push("Chain location requires coordinate proximity");
  if (chain && distanceMeters != null && distanceMeters > 150) blockReasons.push("Chain candidate is too far from this branch");
  if (chain && (chainAddressScore == null || chainAddressScore < 0.45)) blockReasons.push("Chain candidate requires address agreement");
  return {
    confidence,
    factors: factorMap,
    distanceMeters,
    isChain: chain,
    chainSafetyPassed,
    duplicateGooglePlaceId: linkedElsewhere,
    hardBlocked: linkedElsewhere || !chainSafetyPassed,
    blockReasons,
  };
}

export function auditExistingPlaceIds(places: Place[]) {
  const issues: PlaceIdAuditIssue[] = [];
  const byGoogleId = usedGooglePlaceIds(places);
  for (const [googlePlaceId, placeIds] of byGoogleId.entries()) {
    if (placeIds.length > 1) {
      issues.push({ id: `duplicate:${googlePlaceId}`, placeIds, googlePlaceId, kind: "duplicate_google_place_id", severity: "high", message: `Google Place ID is assigned to ${placeIds.length} local records.` });
      if (placeIds.some((id) => isChainPlace(places.find((place) => place.id === id)!))) {
        issues.push({ id: `chain:${googlePlaceId}`, placeIds, googlePlaceId, kind: "chain_conflict", severity: "high", message: "A chain location shares a Google Place ID with another local record." });
      }
    }
  }
  for (const place of places) {
    if (!place.googlePlaceId) continue;
    if (place.latitude == null || place.longitude == null) {
      issues.push({ id: `coords:${place.id}`, placeIds: [place.id], googlePlaceId: place.googlePlaceId, kind: "missing_coordinates", severity: "review", message: "Linked record is missing local coordinates." });
    }
    if (place.googleMaps?.placeId && place.googleMaps.placeId !== place.googlePlaceId) {
      issues.push({ id: `identity:${place.id}`, placeIds: [place.id], googlePlaceId: place.googlePlaceId, kind: "google_maps_identity_conflict", severity: "high", message: "googlePlaceId conflicts with the stored Google Maps identity." });
    }
    if (place.latitude != null && place.longitude != null && place.googleMaps?.latitude != null && place.googleMaps?.longitude != null) {
      const distanceKm = haversineKm({ lat: place.latitude, lng: place.longitude }, { lat: place.googleMaps.latitude, lng: place.googleMaps.longitude });
      if (distanceKm > 1) issues.push({ id: `distance:${place.id}`, placeIds: [place.id], googlePlaceId: place.googlePlaceId, kind: "distant_link", severity: "high", message: `Stored Google Maps coordinates are ${distanceKm.toFixed(1)} km from the local record.` });
    }
  }
  return issues;
}

export function placeIdIntegrityStatus(place: Place, issues: PlaceIdAuditIssue[]): PlaceIdIntegrityStatus {
  if (!place.googlePlaceId) return "missing";
  const mine = issues.filter((issue) => issue.placeIds.includes(place.id));
  if (mine.some((issue) => issue.severity === "high")) return "possible_wrong_match";
  if (mine.length) return "needs_review";
  return "linked";
}

export function placeIdCoverageSummary(places: Place[], issues = auditExistingPlaceIds(places)): PlaceIdCoverageSummary {
  const statuses = places.map((place) => placeIdIntegrityStatus(place, issues));
  return {
    total: places.length,
    linked: statuses.filter((status) => status === "linked").length,
    missing: statuses.filter((status) => status === "missing").length,
    needsReview: statuses.filter((status) => status === "needs_review").length,
    possibleWrongMatch: statuses.filter((status) => status === "possible_wrong_match").length,
    chainLocations: places.filter(isChainPlace).length,
  };
}
'''

match_storage = r'''export type GooglePlaceMatchDecision = "linked" | "rejected" | "review";

export type GooglePlaceMatchRecord = {
  id: string;
  localPlaceId: string;
  googlePlaceId: string;
  candidateName: string;
  decision: GooglePlaceMatchDecision;
  confidence: number;
  distanceMeters: number | null;
  chainSafetyPassed: boolean;
  createdAt: string;
};

const KEY = "around-dorm-google-place-matches-v1";
const THRESHOLD_KEY = "around-dorm-google-place-match-threshold-v1";

function read(): GooglePlaceMatchRecord[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "[]") as GooglePlaceMatchRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function loadGooglePlaceMatchRecords() {
  return read().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function saveGooglePlaceMatchRecord(record: Omit<GooglePlaceMatchRecord, "id" | "createdAt">) {
  if (typeof localStorage === "undefined") return;
  const next: GooglePlaceMatchRecord = { ...record, id: `gmatch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, createdAt: new Date().toISOString() };
  localStorage.setItem(KEY, JSON.stringify([next, ...read()].slice(0, 500)));
}

export function rejectedGooglePlaceIds(localPlaceId: string) {
  return new Set(read().filter((record) => record.localPlaceId === localPlaceId && record.decision === "rejected").map((record) => record.googlePlaceId));
}

export function loadMatchConfidenceThreshold(defaultValue = 75) {
  if (typeof localStorage === "undefined") return defaultValue;
  const value = Number(localStorage.getItem(THRESHOLD_KEY));
  return Number.isFinite(value) && value >= 50 && value <= 95 ? value : defaultValue;
}

export function saveMatchConfidenceThreshold(value: number) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(THRESHOLD_KEY, String(Math.max(50, Math.min(95, Math.round(value)))));
}
'''

component = r'''"use client";

import { useMemo, useState } from "react";
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
import { loadMatchConfidenceThreshold, rejectedGooglePlaceIds, saveGooglePlaceMatchRecord, saveMatchConfidenceThreshold } from "@/lib/storage/google-place-matches";
import type { Place } from "@/types/place";

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
  const [threshold, setThreshold] = useState(() => loadMatchConfidenceThreshold(DEFAULT_MATCH_CONFIDENCE_THRESHOLD));

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

  function recordDecision(item: CandidateAssessment, decision: "linked" | "rejected" | "review") {
    if (!matchingPlace) return;
    saveGooglePlaceMatchRecord({
      localPlaceId: matchingPlace.id,
      googlePlaceId: item.candidate.googlePlaceId,
      candidateName: item.candidate.name,
      decision,
      confidence: item.assessment.confidence,
      distanceMeters: item.assessment.distanceMeters,
      chainSafetyPassed: item.assessment.chainSafetyPassed,
    });
  }

  function performLink(item: CandidateAssessment) {
    if (!matchingPlace || item.assessment.hardBlocked) return;
    applyLocalPlacePatch(matchingPlace, {
      googlePlaceId: item.candidate.googlePlaceId,
      googleMaps: {
        placeId: item.candidate.googlePlaceId,
        url: item.candidate.googleMapsUrl,
        latitude: item.candidate.latitude,
        longitude: item.candidate.longitude,
      },
    }, "google_place_id_manual_link");
    recordDecision(item, "linked");
    setPendingLowConfidence(null);
    setCandidates([]);
    setMatchingPlace(null);
    onReload();
  }

  function requestLink(item: CandidateAssessment) {
    if (item.assessment.hardBlocked) return;
    if (item.assessment.confidence < threshold) {
      recordDecision(item, "review");
      setPendingLowConfidence(item);
      return;
    }
    performLink(item);
  }

  function rejectCandidate(item: CandidateAssessment) {
    recordDecision(item, "rejected");
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
        <select value={threshold} onChange={(event) => { const value = Number(event.target.value); setThreshold(value); saveMatchConfidenceThreshold(value); }} className="amd-input h-10 rounded-xl bg-[#07111f] px-3 text-[9px]">{[60, 70, 75, 80, 90].map((value) => <option key={value} value={value}>{value}%</option>)}</select>
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
              <button type="button" disabled={!apiKey || !matchCenter || searching} onClick={() => void runMatchSearch()} className="amd-btn amd-btn-primary mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-[9px] font-bold disabled:opacity-40"><Search className="h-3.5 w-3.5" />{searching ? (language === "en" ? "Searching…" : "กำลังค้นหา…") : estimate?.newRequests === 0 && estimate?.cacheHits ? (language === "en" ? "Use Cached Search — 0 New" : "ใช้ Cache — 0 Request ใหม่") : (language === "en" ? "Run 1 Google Search Request" : "Run 1 Google Search Request")}</button>
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
'''

tests = r'''import { describe, expect, it } from "vitest";
import { assessGooglePlaceMatch, auditExistingPlaceIds, placeIdCoverageSummary } from "@/lib/google-place-id-manager";
import type { Place } from "@/types/place";
import type { GoogleDiscoveryCandidate } from "@/lib/google-live";

function place(overrides: Partial<Place> = {}): Place {
  return {
    id: "p1", googlePlaceId: null, name: "THER CAFE & Bistro", nameEn: null, slug: "ther", category: "cafe", categories: ["cafe"], subcategory: null,
    shortDescription: "", description: "", address: "Lat Phrao 41 Bangkok", area: "Lat Phrao", soi: "41", latitude: 13.82, longitude: 100.58,
    distanceKm: null, walkingMinutes: null, drivingMinutes: null, openingHours: { monday: null, tuesday: null, wednesday: null, thursday: null, friday: null, saturday: null, sunday: null }, is24Hours: false,
    priceLevel: null, priceText: null, averagePricePerPerson: null, minPrice: null, maxPrice: null, popularMenus: [], recommendedItems: [], tags: [], rating: null, reviewCount: null,
    phone: null, line: null, facebook: null, instagram: null, website: null, googleMapsUrl: null, image: null, images: [], paymentMethods: [], delivery: null, deliveryApps: [], dineIn: null, takeaway: null,
    parking: { available: null, type: null, price: null, note: null }, airConditioned: null, wifi: null, powerOutlet: null, toilet: null, petFriendly: null, wheelchairAccessible: null, openLate: null,
    studentFriendly: null, goodForWorking: null, recommended: false, localFavorite: false, verified: false, lastVerified: null, source: ["seed"], notes: null, ...overrides,
  };
}

function candidate(overrides: Partial<GoogleDiscoveryCandidate> = {}): GoogleDiscoveryCandidate {
  return { googlePlaceId: "g1", name: "THER CAFE & Bistro", address: "Lat Phrao 41 Bangkok", latitude: 13.82005, longitude: 100.58005, primaryType: "cafe", primaryTypeLabel: "Cafe", rating: null, reviewCount: null, openNow: null, googleMapsUrl: "https://maps.google.com/", fetchedAt: new Date().toISOString(), ...overrides };
}

describe("Google Place ID integrity", () => {
  it("uses actual records for coverage", () => {
    const places = [place(), place({ id: "p2", googlePlaceId: "g2" })];
    const summary = placeIdCoverageSummary(places);
    expect(summary.total).toBe(2);
    expect(summary.missing).toBe(1);
    expect(summary.linked).toBe(1);
  });

  it("detects duplicate Google Place IDs locally without Google", () => {
    const places = [place({ googlePlaceId: "g1" }), place({ id: "p2", googlePlaceId: "g1" })];
    expect(auditExistingPlaceIds(places).some((issue) => issue.kind === "duplicate_google_place_id")).toBe(true);
  });

  it("scores a close matching candidate highly", () => {
    const local = place();
    const result = assessGooglePlaceMatch(local, candidate(), [local]);
    expect(result.confidence).toBeGreaterThanOrEqual(85);
    expect(result.hardBlocked).toBe(false);
  });

  it("blocks a same-name chain branch that is far away", () => {
    const local = place({ name: "7-Eleven Lat Phrao 41", placeType: "chain", address: "Lat Phrao 41 Bangkok" });
    const remote = candidate({ name: "7-Eleven Lat Phrao 41", address: "Lat Phrao 101 Bangkok", latitude: 13.9, longitude: 100.65, primaryType: "convenience_store" });
    const result = assessGooglePlaceMatch(local, remote, [local]);
    expect(result.isChain).toBe(true);
    expect(result.chainSafetyPassed).toBe(false);
    expect(result.hardBlocked).toBe(true);
  });

  it("blocks linking a Google Place ID already used by another local record", () => {
    const local = place();
    const other = place({ id: "p2", googlePlaceId: "g1" });
    const result = assessGooglePlaceMatch(local, candidate({ googlePlaceId: "g1" }), [local, other]);
    expect(result.duplicateGooglePlaceId).toBe(true);
    expect(result.hardBlocked).toBe(true);
  });
});
'''

e2e = r'''import { expect, test } from "@playwright/test";

test("Place ID Manager is mobile safe and filters do not trigger Google Places", async ({ page }) => {
  let googlePlacesRequests = 0;
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("places.googleapis.com") || url.includes("/maps/api/place") || url.includes("maps.googleapis.com/maps/api/place")) googlePlacesRequests += 1;
  });

  await page.goto("/settings");
  await expect(page.getByText("จัดการข้อมูลร้าน")).toBeVisible();
  await page.getByRole("button", { name: /จัดการ/ }).click();
  await expect(page.getByTestId("google-place-id-manager")).toBeVisible();
  await page.getByTestId("place-id-filter-missing").click();
  await page.getByTestId("place-id-filter-linked").click();
  await page.getByTestId("place-id-filter-chain").click();
  await page.getByTestId("audit-place-ids").click();
  await page.waitForTimeout(300);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(googlePlacesRequests).toBe(0);
});
'''

(ROOT / 'lib/google-place-id-manager.ts').write_text(place_id_lib, encoding='utf-8')
(ROOT / 'lib/storage/google-place-matches.ts').write_text(match_storage, encoding='utf-8')
(ROOT / 'components/GooglePlaceIdManager.tsx').write_text(component, encoding='utf-8')
(ROOT / 'tests/google-place-id-manager.test.ts').write_text(tests, encoding='utf-8')
(ROOT / 'e2e/p0-place-id-manager.spec.ts').write_text(e2e, encoding='utf-8')

path = ROOT / 'components/DataManagement.tsx'
text = path.read_text(encoding='utf-8')
if 'GooglePlaceIdManager' not in text:
    marker = 'import { GoogleMaintenancePanel } from "@/components/GoogleMaintenancePanel";'
    if marker not in text:
        raise SystemExit('GoogleMaintenancePanel import marker not found')
    text = text.replace(marker, marker + '\nimport { GooglePlaceIdManager } from "@/components/GooglePlaceIdManager";', 1)
    render_marker = '        <GoogleMaintenancePanel places={places} language={language} />'
    if render_marker not in text:
        raise SystemExit('GoogleMaintenancePanel render marker not found')
    text = text.replace(render_marker, '        <GooglePlaceIdManager places={places} language={language} onReload={onReload} />\n\n' + render_marker, 1)
    path.write_text(text, encoding='utf-8')

print('P0 Google Place ID Manager staged')

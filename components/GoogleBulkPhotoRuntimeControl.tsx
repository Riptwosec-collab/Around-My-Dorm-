"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Image as ImageIcon, LoaderCircle, RotateCcw, ShieldCheck, X } from "lucide-react";
import { CloudPermanentImageManager } from "@/components/CloudPermanentImageManager";
import { getAdminAccessState } from "@/lib/admin-auth";
import { recordTrackedGoogleRequest } from "@/lib/google-api-budget";
import { supabase } from "@/lib/cloud/supabase";
import { loadPlacesFromDatabase } from "@/lib/database/places";
import {
  loadGooglePhotoCloudMetadata,
  type GooglePhotoCloudMetadataSummary,
  type GooglePhotoCloudResultCode,
} from "@/lib/google-photo-cloud-metadata";
import { fetchGoogleTransientPhoto } from "@/lib/google-transient-photo";
import {
  getGoogleRuntimePhoto,
  isGooglePhotoAutoRestoreInFlight,
  setGoogleRuntimePhoto,
} from "@/lib/google-photo-runtime";
import type { Place } from "@/types/place";

const PHOTO_REQUEST_LIMIT = 100;

type Progress = {
  current: number;
  total: number;
  loaded: number;
  noPhoto: number;
  failed: number;
  currentName: string | null;
};

type SharedGooglePhotoLink = {
  place_id: string;
  google_place_id: string | null;
  status: "linked" | "review";
  confidence: number | null;
};

type PhotoTarget = {
  place: Place;
  googlePlaceId: string;
  verificationStatus: "linked" | "review";
};

const EMPTY_PROGRESS: Progress = { current: 0, total: 0, loaded: 0, noPhoto: 0, failed: 0, currentName: null };
const EMPTY_CLOUD_METADATA: GooglePhotoCloudMetadataSummary = {
  savedPlaceIds: [],
  restoreTargets: [],
  savedCount: 0,
  noPhotoCount: 0,
  failedCount: 0,
  lastSavedAt: null,
};

function linkedGooglePlaceId(place: Place): string | null {
  return place.googlePlaceId || place.googleMaps?.placeId || null;
}

function photoGooglePlaceId(place: Place, sharedLink?: SharedGooglePhotoLink): string | null {
  return linkedGooglePlaceId(place) || sharedLink?.google_place_id || null;
}

function hasPersistedImage(place: Place): boolean {
  return Boolean(
    place.coverImage
    || place.image
    || place.images?.some(Boolean)
    || place.galleryImages?.some(Boolean)
    || place.imageMetadata?.some((image) => Boolean(image.url)),
  );
}

function errorText(error: unknown) {
  return (error instanceof Error ? error.message : String(error || "Unknown error")).slice(0, 420);
}

function formatCloudTime(value: string | null) {
  if (!value) return "ยังไม่มี";
  try {
    return new Intl.DateTimeFormat("th-TH", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "Asia/Bangkok",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function GoogleBulkPhotoRuntimeControl() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const [admin, setAdmin] = useState(false);
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [places, setPlaces] = useState<Place[]>([]);
  const [sharedGoogleLinks, setSharedGoogleLinks] = useState<SharedGooglePhotoLink[]>([]);
  const [cloudMetadata, setCloudMetadata] = useState<GooglePhotoCloudMetadataSummary>(EMPTY_CLOUD_METADATA);
  const [loadingPlaces, setLoadingPlaces] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Progress>(EMPTY_PROGRESS);
  const [message, setMessage] = useState<string | null>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    let alive = true;
    const refreshAccess = () => {
      void getAdminAccessState()
        .then((state) => { if (alive) setAdmin(state.admin); })
        .catch(() => { if (alive) setAdmin(false); });
    };
    refreshAccess();
    const { data } = supabase.auth.onAuthStateChange(() => refreshAccess());
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  async function refreshPlaces() {
    setLoadingPlaces(true);
    setMessage(null);
    try {
      const [result, linksResult, cloudResult] = await Promise.all([
        loadPlacesFromDatabase(),
        supabase.from("amd_google_public_links").select("place_id,google_place_id,status,confidence"),
        loadGooglePhotoCloudMetadata(),
      ]);
      if (linksResult.error) throw linksResult.error;
      setPlaces(result.places);
      setSharedGoogleLinks((linksResult.data || []) as SharedGooglePhotoLink[]);
      setCloudMetadata(cloudResult);
      if (result.warning) setMessage(result.warning);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "โหลดรายการร้านไม่สำเร็จ");
    } finally {
      setLoadingPlaces(false);
    }
  }

  useEffect(() => {
    if (open && admin && places.length === 0 && !loadingPlaces) void refreshPlaces();
  }, [open, admin]);

  const summary = useMemo(() => {
    let linked = 0;
    let reviewPhotoCandidates = 0;
    let availableGoogleIds = 0;
    let persisted = 0;
    let runtime = 0;
    const linksByPlace = new Map(sharedGoogleLinks.map((row) => [row.place_id, row]));
    const placesById = new Map(places.map((place) => [place.id, place]));
    const targets: PhotoTarget[] = [];

    for (const place of places) {
      const sharedLink = linksByPlace.get(place.id);
      const verifiedGooglePlaceId = linkedGooglePlaceId(place);
      const googlePlaceId = photoGooglePlaceId(place, sharedLink);
      const verificationStatus: "linked" | "review" = verifiedGooglePlaceId || sharedLink?.status === "linked" ? "linked" : "review";

      if (verificationStatus === "linked" && googlePlaceId) linked += 1;
      if (verificationStatus === "review" && googlePlaceId) reviewPhotoCandidates += 1;
      if (googlePlaceId) availableGoogleIds += 1;

      if (hasPersistedImage(place)) {
        persisted += 1;
        continue;
      }
      if (getGoogleRuntimePhoto(place.id)) {
        runtime += 1;
        continue;
      }
      if (googlePlaceId) targets.push({ place, googlePlaceId, verificationStatus });
    }

    const restoreTargets: PhotoTarget[] = [];
    for (const saved of cloudMetadata.restoreTargets) {
      const place = placesById.get(saved.placeId);
      if (!place || hasPersistedImage(place) || getGoogleRuntimePhoto(place.id)) continue;
      const sharedLink = linksByPlace.get(place.id);
      const currentGooglePlaceId = photoGooglePlaceId(place, sharedLink);
      const verificationStatus: "linked" | "review" = linkedGooglePlaceId(place) || sharedLink?.status === "linked" ? "linked" : "review";
      restoreTargets.push({
        place,
        googlePlaceId: currentGooglePlaceId || saved.googlePlaceId,
        verificationStatus,
      });
    }

    return {
      linked,
      reviewPhotoCandidates,
      availableGoogleIds,
      persisted,
      runtime,
      targets,
      restoreTargets: restoreTargets.slice(0, PHOTO_REQUEST_LIMIT),
      missingPlaceId: Math.max(0, places.length - availableGoogleIds),
      cappedTargets: targets.slice(0, PHOTO_REQUEST_LIMIT),
    };
  }, [places, sharedGoogleLinks, cloudMetadata, progress.loaded]);

  async function runPhotoTargets(targets: PhotoTarget[], mode: "bulk" | "restore") {
    if (running || !admin) return;
    if (!apiKey) {
      setConfirmOpen(false);
      setMessage("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is missing");
      return;
    }

    const runnableTargets = targets
      .filter((target) => !getGoogleRuntimePhoto(target.place.id))
      .filter((target) => mode !== "restore" || !isGooglePhotoAutoRestoreInFlight(target.place.id))
      .slice(0, PHOTO_REQUEST_LIMIT);

    setConfirmOpen(false);
    setRunning(true);
    setMessage(null);
    cancelRef.current = false;
    let loaded = 0;
    let noPhoto = 0;
    let failed = 0;
    let firstError: string | null = null;
    setProgress({ ...EMPTY_PROGRESS, total: runnableTargets.length });

    for (let index = 0; index < runnableTargets.length; index += 1) {
      if (cancelRef.current) break;
      const target = runnableTargets[index];
      const startedAt = Date.now();
      let requestStatus: "success" | "failed" = "success";
      let resultCode: GooglePhotoCloudResultCode = "no_photo";
      setProgress({ current: index, total: runnableTargets.length, loaded, noPhoto, failed, currentName: target.place.name });

      try {
        const photo = await fetchGoogleTransientPhoto(apiKey, target.googlePlaceId);
        if (photo) {
          setGoogleRuntimePhoto(target.place.id, target.googlePlaceId, photo);
          resultCode = "photo_loaded";
          loaded += 1;
        } else {
          resultCode = "no_photo";
          noPhoto += 1;
        }
      } catch (error) {
        requestStatus = "failed";
        resultCode = "failed";
        failed += 1;
        if (!firstError) firstError = `${target.place.name}: ${errorText(error)}`;
      }

      try {
        await recordTrackedGoogleRequest({
          requestType: "place_photo",
          placeId: target.place.id,
          placeName: target.place.name,
          googlePlaceId: target.googlePlaceId,
          status: requestStatus,
          resultCode,
          attempted: 1,
          retryCount: 0,
          durationMs: Math.max(0, Date.now() - startedAt),
        });
      } catch (error) {
        if (!firstError) firstError = `บันทึก Cloud metadata ไม่สำเร็จ: ${errorText(error)}`;
      }

      setProgress({ current: index + 1, total: runnableTargets.length, loaded, noPhoto, failed, currentName: target.place.name });
    }

    try {
      setCloudMetadata(await loadGooglePhotoCloudMetadata());
    } catch (error) {
      if (!firstError) firstError = `อ่าน Cloud metadata ไม่สำเร็จ: ${errorText(error)}`;
    }

    const cancelled = cancelRef.current;
    const diagnostic = firstError ? ` • สาเหตุแรก: ${firstError}` : "";
    const action = mode === "restore" ? "Restore" : "โหลดรูป Google";
    setRunning(false);
    setProgress((current) => ({ ...current, currentName: null }));
    setMessage(
      cancelled
        ? `หยุดแล้ว • ${action} สำเร็จ ${loaded} ร้าน • ไม่มีรูป ${noPhoto} • ผิดพลาด ${failed}${diagnostic}`
        : `${action} ชั่วคราวสำเร็จ ${loaded} ร้าน • ไม่มีรูป ${noPhoto} • ผิดพลาด ${failed} • Cloud metadata บันทึกอัตโนมัติ${diagnostic}`,
    );
  }

  async function runBulkPhotos() {
    await runPhotoTargets(summary.cappedTargets, "bulk");
  }

  async function runRestoreRemaining() {
    await runPhotoTargets(summary.restoreTargets, "restore");
  }

  if (!admin) return null;

  const percent = progress.total ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="fixed bottom-[calc(84px+env(safe-area-inset-bottom))] right-3 z-[98] sm:bottom-5 sm:right-5">
      {!open ? (
        <button
          data-testid="google-bulk-photo-runtime-open"
          type="button"
          onClick={() => setOpen(true)}
          className="amd-glass-strong flex h-11 items-center gap-2 rounded-full border border-cyan-300/20 px-3 text-[9px] font-bold text-cyan-100 shadow-[0_10px_30px_rgba(0,120,255,.2)]"
        >
          <Camera className="h-4 w-4" /> Google Photos
        </button>
      ) : (
        <section data-testid="google-bulk-photo-runtime-control" className="amd-glass-strong max-h-[78vh] w-[min(92vw,410px)] overflow-y-auto rounded-[24px] border border-cyan-300/15 p-4 shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-300" /><p className="text-[11px] font-bold">GOOGLE PHOTOS • HYBRID RESTORE</p></div>
              <p className="mt-1 text-[8px] leading-4 text-white/45">รูป Google อยู่เฉพาะ memory ของ session • ร้านที่เคยโหลดสำเร็จอาจ Restore อัตโนมัติเมื่อการ์ดเข้าหน้าจอ สูงสุด 20 ร้านต่อ session • ไม่บันทึก Photo URI/Photo Name/blob ลง Supabase</p>
            </div>
            <button type="button" onClick={() => { if (!running) setOpen(false); }} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/[0.06]"><X className="h-4 w-4" /></button>
          </div>

          {loadingPlaces ? (
            <div className="mt-4 flex items-center gap-2 text-[9px] text-white/60"><LoaderCircle className="h-4 w-4 animate-spin" />กำลังอ่านร้านและ Google Place ID จาก Supabase…</div>
          ) : (
            <div className="mt-4 grid grid-cols-5 gap-1 text-center text-[8px]">
              <div className="rounded-xl bg-white/[0.035] p-2"><p className="text-white/40">ร้าน</p><strong>{places.length}</strong></div>
              <div className="rounded-xl bg-white/[0.035] p-2"><p className="text-white/40">Google ID</p><strong>{summary.availableGoogleIds}</strong></div>
              <div className="rounded-xl bg-white/[0.035] p-2"><p className="text-white/40">Verified</p><strong>{summary.linked}</strong></div>
              <div className="rounded-xl bg-white/[0.035] p-2"><p className="text-white/40">Restore</p><strong>{summary.restoreTargets.length}</strong></div>
              <div className="rounded-xl bg-white/[0.035] p-2"><p className="text-white/40">จะโหลด</p><strong>{summary.cappedTargets.length}</strong></div>
            </div>
          )}

          {!loadingPlaces && (
            <p className="mt-2 rounded-xl border border-emerald-300/10 bg-emerald-300/[0.04] px-3 py-2 text-[8px] leading-4 text-emerald-100">
              Cloud metadata • เคยโหลดรูปสำเร็จ {cloudMetadata.savedCount} ร้าน • ไม่มีรูป {cloudMetadata.noPhotoCount} • Fail {cloudMetadata.failedCount} • ล่าสุด {formatCloudTime(cloudMetadata.lastSavedAt)}
            </p>
          )}

          {!running && !loadingPlaces && summary.restoreTargets.length > 0 && (
            <button
              data-testid="google-photo-restore-remaining"
              type="button"
              onClick={() => void runRestoreRemaining()}
              className="amd-chip mt-3 flex h-10 min-h-0 w-full items-center justify-center gap-2 text-[8px] font-bold text-cyan-100"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Restore All Remaining ({summary.restoreTargets.length})
            </button>
          )}

          {summary.reviewPhotoCandidates > 0 && !loadingPlaces && (
            <p className="mt-2 rounded-xl border border-amber-300/10 bg-amber-300/[0.04] px-3 py-2 text-[8px] leading-4 text-amber-100">ครอบคลุมรูปครบทุก Google ID: Verified {summary.linked} + Review {summary.reviewPhotoCandidates} = {summary.availableGoogleIds} ร้าน • กลุ่ม Review ใช้ Place ID เพื่อพรีวิวรูปแบบ manual เท่านั้น ไม่เปลี่ยนสถานะเป็น Verified และไม่เขียน ID กลับ canonical record</p>
          )}

          {summary.missingPlaceId > 0 && !loadingPlaces && (
            <p className="mt-2 rounded-xl border border-rose-300/10 bg-rose-300/[0.04] px-3 py-2 text-[8px] leading-4 text-rose-100">ยังไม่มี Google Place ID {summary.missingPlaceId} ร้าน จึงไม่สามารถขอรูปจาก Google ให้ร้านเหล่านี้ได้</p>
          )}

          {running && (
            <div className="mt-4 rounded-2xl border border-cyan-300/10 bg-cyan-300/[0.04] p-3">
              <div className="flex items-center justify-between text-[8px]"><span className="max-w-[70%] truncate">{progress.currentName || "กำลังโหลด…"}</span><strong>{progress.current}/{progress.total}</strong></div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full bg-[#149CFF] transition-all" style={{ width: `${percent}%` }} /></div>
              <div className="mt-2 grid grid-cols-3 gap-1 text-center text-[8px] text-white/45"><span>รูป {progress.loaded}</span><span>ไม่มีรูป {progress.noPhoto}</span><span>Fail {progress.failed}</span></div>
              <button type="button" onClick={() => { cancelRef.current = true; }} className="amd-chip mt-3 h-9 min-h-0 w-full text-[8px] text-rose-100">หยุดหลัง Request ปัจจุบัน</button>
            </div>
          )}

          {!running && !confirmOpen && (
            <button
              data-testid="google-bulk-photo-runtime-confirm-open"
              type="button"
              disabled={loadingPlaces || summary.cappedTargets.length === 0}
              onClick={() => setConfirmOpen(true)}
              className="amd-btn amd-btn-primary mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-[9px] font-bold disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ImageIcon className="h-4 w-4" />โหลดรูป Google ทั้งชุด ({summary.cappedTargets.length} ร้าน)
            </button>
          )}

          {!running && confirmOpen && (
            <div className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-300/[0.04] p-3">
              <p className="text-[9px] font-bold text-amber-100">ยืนยัน Google Places requests</p>
              <p className="mt-1 text-[8px] leading-4 text-white/55">จะยิงสูงสุด {summary.cappedTargets.length} requests ใน foreground เท่านั้น • Hard cap {PHOTO_REQUEST_LIMIT} • ผล request จะบันทึก Cloud metadata อัตโนมัติ • Review ID ใช้สำหรับรูปชั่วคราวเท่านั้น • รูป Google เองหายเมื่อ reload หน้าเว็บ</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setConfirmOpen(false)} className="amd-chip h-10 min-h-0 text-[8px]">ยกเลิก</button>
                <button data-testid="google-bulk-photo-runtime-run" type="button" onClick={() => void runBulkPhotos()} className="amd-btn amd-btn-primary h-10 min-h-0 rounded-xl text-[8px] font-bold">ยืนยันและโหลด</button>
              </div>
            </div>
          )}

          {!running && !loadingPlaces && (
            <CloudPermanentImageManager places={places} onChanged={refreshPlaces} />
          )}

          {message && <p className="mt-3 rounded-xl border border-white/[0.06] bg-black/10 px-3 py-2 text-[8px] leading-4 text-white/60">{message}</p>}
          {!running && !loadingPlaces && <button type="button" onClick={() => void refreshPlaces()} className="mt-2 text-[8px] text-cyan-200/70 underline decoration-cyan-300/30 underline-offset-2">อ่านรายการร้านใหม่จาก Cloud</button>}
        </section>
      )}
    </div>
  );
}

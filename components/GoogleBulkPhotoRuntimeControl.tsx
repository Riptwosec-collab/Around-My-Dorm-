"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Image as ImageIcon, LoaderCircle, ShieldCheck, X } from "lucide-react";
import { getAdminAccessState } from "@/lib/admin-auth";
import { supabase } from "@/lib/cloud/supabase";
import { loadPlacesFromDatabase } from "@/lib/database/places";
import { fetchGoogleTransientPhoto } from "@/lib/google-transient-photo";
import { getGoogleRuntimePhoto, setGoogleRuntimePhoto } from "@/lib/google-photo-runtime";
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

const EMPTY_PROGRESS: Progress = { current: 0, total: 0, loaded: 0, noPhoto: 0, failed: 0, currentName: null };

function linkedGooglePlaceId(place: Place): string | null {
  return place.googlePlaceId || place.googleMaps?.placeId || null;
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

export function GoogleBulkPhotoRuntimeControl() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const [admin, setAdmin] = useState(false);
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [places, setPlaces] = useState<Place[]>([]);
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
      const result = await loadPlacesFromDatabase();
      setPlaces(result.places);
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
    let persisted = 0;
    let runtime = 0;
    const targets: Array<{ place: Place; googlePlaceId: string }> = [];
    for (const place of places) {
      const googlePlaceId = linkedGooglePlaceId(place);
      if (googlePlaceId) linked += 1;
      if (hasPersistedImage(place)) {
        persisted += 1;
        continue;
      }
      if (getGoogleRuntimePhoto(place.id)) {
        runtime += 1;
        continue;
      }
      if (googlePlaceId) targets.push({ place, googlePlaceId });
    }
    return {
      linked,
      persisted,
      runtime,
      targets,
      missingPlaceId: Math.max(0, places.length - linked),
      cappedTargets: targets.slice(0, PHOTO_REQUEST_LIMIT),
    };
  }, [places, progress.loaded]);

  async function runBulkPhotos() {
    if (running || !admin) return;
    if (!apiKey) {
      setConfirmOpen(false);
      setMessage("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is missing");
      return;
    }

    const targets = summary.cappedTargets;
    setConfirmOpen(false);
    setRunning(true);
    setMessage(null);
    cancelRef.current = false;
    let loaded = 0;
    let noPhoto = 0;
    let failed = 0;
    setProgress({ ...EMPTY_PROGRESS, total: targets.length });

    for (let index = 0; index < targets.length; index += 1) {
      if (cancelRef.current) break;
      const target = targets[index];
      setProgress({ current: index, total: targets.length, loaded, noPhoto, failed, currentName: target.place.name });
      try {
        const photo = await fetchGoogleTransientPhoto(apiKey, target.googlePlaceId);
        if (photo) {
          setGoogleRuntimePhoto(target.place.id, target.googlePlaceId, photo);
          loaded += 1;
        } else {
          noPhoto += 1;
        }
      } catch {
        failed += 1;
      }
      setProgress({ current: index + 1, total: targets.length, loaded, noPhoto, failed, currentName: target.place.name });
    }

    const cancelled = cancelRef.current;
    setRunning(false);
    setProgress((current) => ({ ...current, currentName: null }));
    setMessage(
      cancelled
        ? `หยุดแล้ว • โหลดรูปสำเร็จ ${loaded} ร้าน • ไม่มีรูป ${noPhoto} • ผิดพลาด ${failed}`
        : `โหลดรูป Google ชั่วคราวสำเร็จ ${loaded} ร้าน • ไม่มีรูป ${noPhoto} • ผิดพลาด ${failed}`,
    );
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
        <section data-testid="google-bulk-photo-runtime-control" className="amd-glass-strong w-[min(92vw,390px)] rounded-[24px] border border-cyan-300/15 p-4 shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-300" /><p className="text-[11px] font-bold">GOOGLE PHOTOS • MANUAL</p></div>
              <p className="mt-1 text-[8px] leading-4 text-white/45">รูปจาก Google เก็บเฉพาะ memory ของ session นี้ ไม่บันทึก Photo URI/Photo Name ลง Supabase และไม่มี background request</p>
            </div>
            <button type="button" onClick={() => { if (!running) setOpen(false); }} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/[0.06]"><X className="h-4 w-4" /></button>
          </div>

          {loadingPlaces ? (
            <div className="mt-4 flex items-center gap-2 text-[9px] text-white/60"><LoaderCircle className="h-4 w-4 animate-spin" />กำลังอ่านร้านจาก Supabase…</div>
          ) : (
            <div className="mt-4 grid grid-cols-4 gap-1 text-center text-[8px]">
              <div className="rounded-xl bg-white/[0.035] p-2"><p className="text-white/40">ร้าน</p><strong>{places.length}</strong></div>
              <div className="rounded-xl bg-white/[0.035] p-2"><p className="text-white/40">Place ID</p><strong>{summary.linked}</strong></div>
              <div className="rounded-xl bg-white/[0.035] p-2"><p className="text-white/40">มีรูปแล้ว</p><strong>{summary.persisted + summary.runtime}</strong></div>
              <div className="rounded-xl bg-white/[0.035] p-2"><p className="text-white/40">จะโหลด</p><strong>{summary.cappedTargets.length}</strong></div>
            </div>
          )}

          {summary.missingPlaceId > 0 && !loadingPlaces && (
            <p className="mt-2 rounded-xl border border-amber-300/10 bg-amber-300/[0.04] px-3 py-2 text-[8px] leading-4 text-amber-100">{summary.missingPlaceId} ร้านยังไม่มี Google Place ID ที่ยืนยัน จึงไม่ดึงรูปมั่วข้ามร้าน/ข้ามสาขา • ให้รัน Google → Supabase enrichment ก่อน</p>
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
              <p className="mt-1 text-[8px] leading-4 text-white/55">จะยิงสูงสุด {summary.cappedTargets.length} requests ใน foreground เท่านั้น • Hard cap {PHOTO_REQUEST_LIMIT} • รูปหายเมื่อ reload หน้าเว็บตามข้อจำกัด Google</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setConfirmOpen(false)} className="amd-chip h-10 min-h-0 text-[8px]">ยกเลิก</button>
                <button data-testid="google-bulk-photo-runtime-run" type="button" onClick={() => void runBulkPhotos()} className="amd-btn amd-btn-primary h-10 min-h-0 rounded-xl text-[8px] font-bold">ยืนยันและโหลด</button>
              </div>
            </div>
          )}

          {message && <p className="mt-3 rounded-xl border border-white/[0.06] bg-black/10 px-3 py-2 text-[8px] leading-4 text-white/60">{message}</p>}
          {!running && !loadingPlaces && <button type="button" onClick={() => void refreshPlaces()} className="mt-2 text-[8px] text-cyan-200/70 underline decoration-cyan-300/30 underline-offset-2">อ่านรายการร้านใหม่จาก Cloud</button>}
        </section>
      )}
    </div>
  );
}

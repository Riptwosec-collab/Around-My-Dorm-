"use client";

import { useCallback, useEffect, useState } from "react";
import { Camera, LoaderCircle } from "lucide-react";
import {
  GOOGLE_PHOTO_RUNTIME_CHANGED_EVENT,
  GOOGLE_PHOTO_VISIBLE_CARDS_CHANGED_EVENT,
  getVisibleGooglePhotoLoadTargetCount,
  loadVisibleGooglePhotos,
} from "@/lib/google-photo-runtime";

export function VisibleGooglePhotoLoadControl() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const [targetCount, setTargetCount] = useState(0);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setTargetCount(getVisibleGooglePhotoLoadTargetCount());
  }, []);

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener(GOOGLE_PHOTO_VISIBLE_CARDS_CHANGED_EVENT, onChange);
    window.addEventListener(GOOGLE_PHOTO_RUNTIME_CHANGED_EVENT, onChange);
    return () => {
      window.removeEventListener(GOOGLE_PHOTO_VISIBLE_CARDS_CHANGED_EVENT, onChange);
      window.removeEventListener(GOOGLE_PHOTO_RUNTIME_CHANGED_EVENT, onChange);
    };
  }, [refresh]);

  async function loadVisible() {
    if (running || targetCount === 0) return;
    if (!apiKey) {
      setMessage("ยังไม่ได้ตั้งค่า Google Maps API Key");
      return;
    }

    setRunning(true);
    setMessage(null);
    try {
      const result = await loadVisibleGooglePhotos(apiKey);
      setMessage(`โหลดแล้ว ${result.loaded}/${result.attempted} • ไม่มีรูป ${result.noPhoto} • ผิดพลาด ${result.failed}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "โหลดรูป Google ไม่สำเร็จ");
    } finally {
      setRunning(false);
      refresh();
    }
  }

  if (targetCount === 0 && !running && !message) return null;

  return (
    <div className="pointer-events-none fixed bottom-[calc(92px+env(safe-area-inset-bottom))] left-1/2 z-[97] flex -translate-x-1/2 flex-col items-center gap-1.5 sm:bottom-6">
      <button
        data-testid="visible-google-photo-load"
        type="button"
        disabled={running || targetCount === 0}
        onClick={() => void loadVisible()}
        className="amd-glass-strong pointer-events-auto flex min-h-11 items-center gap-2 rounded-full border border-cyan-300/20 px-4 text-[10px] font-bold text-cyan-50 shadow-[0_12px_34px_rgba(0,120,255,.22)] disabled:cursor-not-allowed disabled:opacity-55"
      >
        {running ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        {running ? "กำลังโหลดรูปที่เห็น…" : `โหลดรูปที่เห็น (${targetCount})`}
      </button>
      {message && (
        <p className="pointer-events-auto max-w-[88vw] rounded-full border border-white/[0.07] bg-black/75 px-3 py-1 text-center text-[8px] leading-4 text-white/70 backdrop-blur-xl">
          {message}
        </p>
      )}
    </div>
  );
}

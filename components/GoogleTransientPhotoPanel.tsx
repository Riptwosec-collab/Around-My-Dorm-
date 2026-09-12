"use client";

import { useState } from "react";
import { ExternalLink, Flag, Image as ImageIcon, LoaderCircle } from "lucide-react";
import { fetchGoogleTransientPhoto, type GoogleTransientPhoto } from "@/lib/google-transient-photo";
import type { Place } from "@/types/place";

export function GoogleTransientPhotoPanel({ place, language }: { place: Place; language: "th" | "en" }) {
  const [photo, setPhoto] = useState<GoogleTransientPhoto | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  const googlePlaceId = place.googlePlaceId || place.googleMaps?.placeId || null;

  async function loadPhoto() {
    if (!apiKey || !googlePlaceId || loading) return;
    setLoading(true);
    setMessage(null);
    // Never persist this result. It is intentionally component/runtime state only.
    try {
      const next = await fetchGoogleTransientPhoto(apiKey, googlePlaceId);
      setPhoto(next);
      if (!next) setMessage(language === "en" ? "No Google photo is available for this place." : "Google ยังไม่มีรูปที่ใช้ได้สำหรับสถานที่นี้");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Google photo request failed");
    } finally {
      setLoading(false);
    }
  }

  if (!googlePlaceId) return null;

  return (
    <section className="mt-4 rounded-[24px] border border-white/[0.07] bg-white/[0.035] p-4" data-testid="google-transient-photo">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">GOOGLE PHOTO</p>
          <p className="mt-1 text-[9px] leading-5 text-white/45">{language === "en" ? "Loaded only when you press the button. The photo URI is not saved to Supabase or browser storage." : "โหลดเฉพาะตอนกดปุ่ม • URL รูปจะไม่ถูกบันทึกลง Supabase หรือ Browser Storage"}</p>
        </div>
        <ImageIcon className="h-4 w-4 text-[#8ecbff]" />
      </div>

      {!photo && (
        <button type="button" disabled={loading || !apiKey} onClick={() => void loadPhoto()} className="amd-btn mt-3 min-h-11 w-full rounded-xl border border-white/10 px-4 text-[9px] font-bold disabled:opacity-40">
          <span className="inline-flex items-center gap-2">{loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}{language === "en" ? "Load Google photo" : "โหลดรูปจาก Google"}</span>
        </button>
      )}

      {photo && (
        <div className="mt-3">
          <img src={photo.url} alt={`${place.name} — Google`} loading="lazy" decoding="async" className="max-h-[320px] w-full rounded-2xl object-cover" />
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[8px] leading-4 text-white/45">
            <span>Google Maps</span>
            {photo.authorAttributions.map((author, index) => author.uri ? (
              <a key={`${author.uri}-${index}`} href={author.uri} target="_blank" rel="noreferrer" className="underline underline-offset-2">{author.displayName || (language === "en" ? "Photo contributor" : "ผู้ให้เครดิตรูป")}</a>
            ) : <span key={index}>{author.displayName || (language === "en" ? "Photo contributor" : "ผู้ให้เครดิตรูป")}</span>)}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {photo.googleMapsUrl && <a href={photo.googleMapsUrl} target="_blank" rel="noreferrer" className="amd-chip h-9 min-h-0 px-3 text-[8px]"><span className="inline-flex items-center gap-1"><ExternalLink className="h-3 w-3" />Google Maps</span></a>}
            {photo.flagContentUrl && <a href={photo.flagContentUrl} target="_blank" rel="noreferrer" className="amd-chip h-9 min-h-0 px-3 text-[8px]"><span className="inline-flex items-center gap-1"><Flag className="h-3 w-3" />{language === "en" ? "Report photo" : "รายงานรูป"}</span></a>}
            <button type="button" disabled={loading} onClick={() => void loadPhoto()} className="amd-chip h-9 min-h-0 px-3 text-[8px]">{language === "en" ? "Refresh manually" : "โหลดใหม่เอง"}</button>
          </div>
        </div>
      )}

      {!apiKey && <p className="mt-2 text-[8px] text-rose-200">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is missing.</p>}
      {message && <p className="mt-2 text-[8px] leading-4 text-amber-100">{message}</p>}
    </section>
  );
}

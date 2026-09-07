"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PlaceDetail } from "@/components/PlaceDetail";
import { loadFavorites, saveFavorites } from "@/lib/storage/favorites";
import { loadSettings } from "@/lib/storage/settings";
import { addRecentView, loadRecentViews, saveRecentViews } from "@/lib/storage/recent";
import { PLACES } from "@/data/places";
import type { Place } from "@/types/place";
export function PlaceRouteClient({ place }: { place: Place }) {
  const router = useRouter(); const [saved, setSaved] = useState(false); const [language, setLanguage] = useState<"th"|"en">("th");
  useEffect(() => { const favorites = loadFavorites(); setSaved(favorites.some((item) => item.id === place.id)); setLanguage(loadSettings().language); const views = addRecentView(loadRecentViews(PLACES), place, true); saveRecentViews(views); }, [place]);
  function toggle() { const current = loadFavorites(); const exists = current.some((item) => item.id === place.id); const next = exists ? current.filter((item) => item.id !== place.id) : [place, ...current].slice(0,100); saveFavorites(next); setSaved(!exists); }
  return <main className="amd-app"><div className="amd-shell"><div className="amd-content"><PlaceDetail place={place} saved={saved} language={language} onClose={() => router.back()} onSave={toggle} onMap={() => router.push(`/map/?place=${encodeURIComponent(place.slug)}`)} /></div></div></main>;
}

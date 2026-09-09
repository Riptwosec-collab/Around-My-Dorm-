"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PlaceDetail } from "@/components/PlaceDetail";
import { loadCloudAppState, recordRecentViewCloud, setFavoriteCloud } from "@/lib/cloud/store";
import { DEFAULT_COLLECTIONS, DEFAULT_SETTINGS } from "@/lib/app-shell-config";
import type { Place } from "@/types/place";

export function PlaceRouteClient({ place }: { place: Place }) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const [language, setLanguage] = useState<"th" | "en">("th");

  useEffect(() => {
    let active = true;
    void loadCloudAppState(DEFAULT_COLLECTIONS).then((state) => {
      if (!active) return;
      setSaved(state.favorites.some((item: Place) => item.id === place.id));
      setLanguage(state.settings?.language || DEFAULT_SETTINGS.language);
    }).catch(() => undefined);
    void recordRecentViewCloud({ placeId: place.id, viewedAt: new Date().toISOString(), source: "seed" }).catch(() => undefined);
    return () => { active = false; };
  }, [place]);

  function toggle() {
    const next = !saved;
    setSaved(next);
    void setFavoriteCloud(place, next).catch(() => setSaved(!next));
  }

  return <main className="amd-app"><div className="amd-shell"><div className="amd-content"><PlaceDetail place={place} saved={saved} language={language} onClose={() => router.back()} onSave={toggle} onMap={() => router.push(`/map/?place=${encodeURIComponent(place.slug)}`)} /></div></div></main>;
}

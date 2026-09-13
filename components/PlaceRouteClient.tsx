"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PlaceDetail } from "@/components/PlaceDetail";
import { loadCloudAppState, recordRecentViewCloud, setFavoriteCloud } from "@/lib/cloud/store";
import { loadPlacesFromDatabase } from "@/lib/database/places";
import { DEFAULT_COLLECTIONS, DEFAULT_SETTINGS } from "@/lib/app-shell-config";
import { getAdminAccessState, type AdminAccessState } from "@/lib/admin-auth";
import { saveAdminPlaceNote } from "@/lib/admin-notes";
import type { Place } from "@/types/place";

const INITIAL_ADMIN_ACCESS: AdminAccessState = {
  authenticated: false,
  admin: false,
  anonymous: false,
  email: null,
};

export function PlaceRouteClient({ place }: { place: Place }) {
  const router = useRouter();
  const [resolvedPlace, setResolvedPlace] = useState(place);
  const [saved, setSaved] = useState(false);
  const [language, setLanguage] = useState<"th" | "en">("th");
  const [adminAccess, setAdminAccess] = useState<AdminAccessState>(INITIAL_ADMIN_ACCESS);

  useEffect(() => {
    let active = true;

    // Static route generation only guarantees that the URL exists. The detail
    // screen itself must resolve the current Supabase/shared-Google layer at
    // runtime, otherwise it keeps showing the original seed forever even after
    // a successful Google -> Cloud enrichment run.
    void loadPlacesFromDatabase()
      .then((result) => {
        if (!active) return;
        const current = result.places.find((item) => item.id === place.id || item.slug === place.slug);
        if (current) setResolvedPlace(current);
      })
      .catch(() => undefined);

    void loadCloudAppState(DEFAULT_COLLECTIONS)
      .then((state) => {
        if (!active) return;
        setSaved(state.favorites.some((item: Place) => item.id === place.id));
        setLanguage(state.settings?.language || DEFAULT_SETTINGS.language);
      })
      .catch(() => undefined);

    void getAdminAccessState()
      .then((state) => {
        if (active) setAdminAccess(state);
      })
      .catch(() => {
        if (active) setAdminAccess(INITIAL_ADMIN_ACCESS);
      });

    void recordRecentViewCloud({ placeId: place.id, viewedAt: new Date().toISOString(), source: "seed" }).catch(() => undefined);
    return () => { active = false; };
  }, [place]);

  function toggle() {
    const next = !saved;
    setSaved(next);
    void setFavoriteCloud(resolvedPlace, next).catch(() => setSaved(!next));
  }

  async function saveAdminNote(note: string) {
    const result = await saveAdminPlaceNote(resolvedPlace.id, note);
    setResolvedPlace((current) => ({
      ...current,
      adminNote: result.note,
      adminNoteUpdatedAt: result.updatedAt,
      lastUpdated: result.updatedAt,
    }));
  }

  return (
    <main className="amd-app">
      <div className="amd-shell">
        <div className="amd-content">
          <PlaceDetail
            place={resolvedPlace}
            saved={saved}
            language={language}
            adminAllowed={adminAccess.admin}
            onSaveAdminNote={saveAdminNote}
            onClose={() => router.back()}
            onSave={toggle}
            onMap={() => router.push(`/map/?place=${encodeURIComponent(resolvedPlace.slug)}`)}
          />
        </div>
      </div>
    </main>
  );
}

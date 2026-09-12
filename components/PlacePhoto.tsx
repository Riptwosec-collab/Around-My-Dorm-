"use client";

import { useEffect, useMemo, useState } from "react";
import { BriefcaseBusiness, Car, Coffee, Dumbbell, Pill, Scissors, ShoppingBag, Store, Utensils, WashingMachine } from "lucide-react";
import { getPlaceImageCandidates } from "@/lib/place-images";
import {
  GOOGLE_PHOTO_RUNTIME_CHANGED_EVENT,
  getGoogleRuntimePhoto,
} from "@/lib/google-photo-runtime";
import type { CategoryId, Place, PlaceImage } from "@/types/place";

function CategoryIcon({ category, className = "h-8 w-8 stroke-[1.7]" }: { category: CategoryId; className?: string }) {
  if (["food", "local_food", "noodle", "thai_food", "isan_food", "mookata", "japanese", "korean_food", "vietnamese_food", "hotpot", "bbq", "chinese_food", "night_food"].includes(category)) return <Utensils className={className} />;
  if (category === "cafe" || category === "bar") return <Coffee className={className} />;
  if (category === "parking" || category === "monthly_parking") return <Car className={className} />;
  if (category === "pharmacy" || category === "clinic" || category === "hospital") return <Pill className={className} />;
  if (category === "fitness") return <Dumbbell className={className} />;
  if (category === "laundry") return <WashingMachine className={className} />;
  if (category === "shopping" || category === "supermarket" || category === "convenience" || category === "market") return <ShoppingBag className={className} />;
  if (category === "salon" || category === "barber") return <Scissors className={className} />;
  if (["service", "hardware", "mobile_repair", "computer_repair", "auto_repair", "tire_shop", "parcel", "post_office", "copy_print"].includes(category)) return <BriefcaseBusiness className={className} />;
  return <Store className={className} />;
}

function useGoogleRuntimePhoto(placeId: string) {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const refresh = (event: Event) => {
      const detail = (event as CustomEvent<{ placeId?: string | null }>).detail;
      if (!detail?.placeId || detail.placeId === placeId) setVersion((value) => value + 1);
    };
    window.addEventListener(GOOGLE_PHOTO_RUNTIME_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(GOOGLE_PHOTO_RUNTIME_CHANGED_EVENT, refresh);
  }, [placeId]);
  return useMemo(() => getGoogleRuntimePhoto(placeId), [placeId, version]);
}

function runtimeImage(photo: ReturnType<typeof getGoogleRuntimePhoto>): PlaceImage | null {
  if (!photo?.url) return null;
  const attribution = photo.authorAttributions.map((item) => item.displayName).filter(Boolean).join(", ") || null;
  return {
    url: photo.url,
    source: "google_places",
    attribution,
    width: photo.width,
    height: photo.height,
    verified: true,
    photoReference: null,
  };
}

export function PlacePhoto({
  place,
  className = "h-full w-full object-cover",
  eager = false,
  fallbackLabel,
}: {
  place: Place;
  className?: string;
  eager?: boolean;
  fallbackLabel?: string;
}) {
  const persistedCandidates = useMemo(() => getPlaceImageCandidates(place), [place]);
  const transientPhoto = useGoogleRuntimePhoto(place.id);
  const transientImage = useMemo(() => runtimeImage(transientPhoto), [transientPhoto]);
  const candidates = useMemo(
    () => persistedCandidates.length ? persistedCandidates : transientImage ? [transientImage] : [],
    [persistedCandidates, transientImage],
  );
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const active = candidates.find((image) => !failed.has(image.url)) ?? null;

  if (!active) {
    return (
      <div className="grid h-full w-full place-items-center bg-[radial-gradient(circle_at_40%_30%,rgba(0,140,255,.14),transparent_34%),linear-gradient(145deg,#07111f,#04101b)] text-[#8bbfe9]">
        <div className="text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-[18px] border border-[rgba(120,160,210,.12)] bg-white/[0.035] shadow-[inset_0_1px_0_rgba(255,255,255,.035)]">
            <CategoryIcon category={place.category} />
          </div>
          {fallbackLabel && <p className="mt-2 px-2 text-[9px] font-semibold leading-4 text-[var(--amd-text-3)]">{fallbackLabel}</p>}
        </div>
      </div>
    );
  }

  const loaded = loadedUrl === active.url;
  const usingTransientGooglePhoto = persistedCandidates.length === 0 && transientPhoto?.url === active.url;
  const transientCredit = transientPhoto?.authorAttributions.map((item) => item.displayName).filter(Boolean).join(", ") || "";

  return (
    <>
      <div className={`amd-skeleton absolute inset-0 transition-opacity duration-[var(--motion-normal)] ${loaded ? "opacity-0" : "opacity-100"}`} aria-hidden="true" />
      <img
        key={active.url}
        src={active.url}
        alt={place.name}
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : "auto"}
        decoding="async"
        className={`amd-place-photo relative transition-[opacity,transform] duration-[var(--motion-slow)] ease-[var(--ease-standard)] ${loaded ? "opacity-100" : "opacity-0"} ${className}`}
        onLoad={() => setLoadedUrl(active.url)}
        onError={() => {
          setLoadedUrl(null);
          setFailed((current) => new Set(current).add(active.url));
        }}
      />
      {usingTransientGooglePhoto && loaded && (
        <span className="pointer-events-none absolute bottom-1 right-1 z-[3] max-w-[80%] truncate rounded-md bg-black/65 px-1.5 py-0.5 text-[7px] leading-3 text-white/80 backdrop-blur-sm">
          Google Maps{transientCredit ? ` • ${transientCredit}` : ""}
        </span>
      )}
    </>
  );
}

export function PlacePhotoAttribution({ place }: { place: Place }) {
  const transientPhoto = useGoogleRuntimePhoto(place.id);
  const transientCredit = transientPhoto?.authorAttributions.map((item) => item.displayName).filter(Boolean).join(", ") || null;
  const credit = place.imageAttribution || transientCredit;
  if (!credit) return null;
  return <p className="text-[8px] leading-4 text-[var(--amd-text-3)]">Photo: {credit}{!place.imageAttribution && transientPhoto ? " • Google Maps" : ""}</p>;
}

"use client";

import { useMemo, useState } from "react";
import { BriefcaseBusiness, Car, Coffee, Dumbbell, Pill, Scissors, ShoppingBag, Store, Utensils, WashingMachine } from "lucide-react";
import { getPlaceImageCandidates } from "@/lib/place-images";
import type { CategoryId, Place } from "@/types/place";

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
  const candidates = useMemo(() => getPlaceImageCandidates(place), [place]);
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
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

  return (
    <>
      <div className="amd-skeleton absolute inset-0" aria-hidden="true" />
      <img
        key={active.url}
        src={active.url}
        alt={place.name}
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : "auto"}
        decoding="async"
        className={`relative ${className}`}
        onLoad={(event) => { event.currentTarget.previousElementSibling?.classList.add("hidden"); }}
        onError={() => setFailed((current) => new Set(current).add(active.url))}
      />
    </>
  );
}

export function PlacePhotoAttribution({ place }: { place: Place }) {
  if (!place.imageAttribution) return null;
  return <p className="text-[8px] leading-4 text-[var(--amd-text-3)]">Photo: {place.imageAttribution}</p>;
}

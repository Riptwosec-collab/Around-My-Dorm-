"use client";

import { useEffect, useRef } from "react";
import { MapPin, Star } from "lucide-react";
import { formatDistance } from "@/lib/place-utils";
import type { Place } from "@/types/place";

export function MapPlaceRail({
  places,
  selectedPlace,
  language,
  onSelectPlace,
}: {
  places: Place[];
  selectedPlace: Place | null;
  language: "th" | "en";
  onSelectPlace: (place: Place) => void;
}) {
  const cardRefs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    if (!selectedPlace) return;
    cardRefs.current.get(selectedPlace.id)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [selectedPlace]);

  if (!places.length) return null;

  return (
    <div className="-mx-4 mt-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-testid="map-place-rail">
      <div className="flex w-max gap-2">
        {places.slice(0, 40).map((place) => {
          const selected = selectedPlace?.id === place.id;
          return (
            <button
              key={place.id}
              ref={(node) => { if (node) cardRefs.current.set(place.id, node); else cardRefs.current.delete(place.id); }}
              type="button"
              data-map-card-id={place.id}
              aria-pressed={selected}
              onClick={() => onSelectPlace(place)}
              className={`w-[210px] rounded-2xl border p-3 text-left transition ${selected ? "border-cyan-300/45 bg-cyan-300/[0.08] shadow-[0_0_20px_rgba(0,217,255,.12)]" : "border-white/[0.07] bg-white/[0.035]"}`}
            >
              <p className="truncate text-[11px] font-bold">{place.name}</p>
              <div className="mt-2 flex items-center gap-2 text-[8px] text-white/45">
                <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{formatDistance(place.distanceKm)}</span>
                {place.rating != null && <span className="inline-flex items-center gap-1"><Star className="h-3 w-3" />{place.rating.toFixed(1)}</span>}
              </div>
              <p className="mt-2 truncate text-[8px] text-white/35">{place.area || (language === "en" ? "Area unavailable" : "ยังไม่มีข้อมูลพื้นที่")}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

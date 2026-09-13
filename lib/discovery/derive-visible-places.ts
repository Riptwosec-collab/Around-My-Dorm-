import type { FilterState } from "@/components/FilterSheet";
import type { OriginMode } from "@/lib/app-shell-config";
import { filterPlacesInSearchArea, type GeoPoint } from "@/lib/hybrid-map-platform";
import { matchesSearch, withDistance } from "@/lib/place-utils";
import { passesFilters, sortPlaces, type RecommendationContext } from "@/lib/place-ranking";
import type { CategoryId, Place, SortMode } from "@/types/place";

export type DiscoveryInput = {
  places: Place[];
  origin: GeoPoint;
  category: "all" | CategoryId;
  query: string;
  filters: FilterState;
  radiusMeters: number;
  mapSearchCenter: GeoPoint;
  originMode: OriginMode;
  sortMode: SortMode;
  verifiedOnly: boolean;
  recommendationContext: RecommendationContext;
};

export type DiscoveryResult = {
  allPlaces: Place[];
  visiblePlaces: Place[];
};

export function deriveDiscoveryState(input: DiscoveryInput): DiscoveryResult {
  const allPlaces = input.places.map((place) => withDistance(place, input.origin));
  const base = allPlaces.filter((place) => {
    if (input.category !== "all" && !place.categories.includes(input.category)) return false;
    if (!matchesSearch(place, input.query)) return false;
    if (!passesFilters(place, input.filters, input.verifiedOnly)) return false;
    if (input.originMode === "me" && place.distanceKm == null) return false;
    return true;
  });

  const inArea = new Set(
    filterPlacesInSearchArea(base, input.mapSearchCenter, input.radiusMeters).map((place) => place.id),
  );
  const visible = base.filter(
    (place) => place.latitude == null || place.longitude == null || inArea.has(place.id),
  );

  return {
    allPlaces,
    visiblePlaces: sortPlaces(visible, input.sortMode, input.recommendationContext),
  };
}

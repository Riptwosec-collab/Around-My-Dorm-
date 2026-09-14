import type { FilterState } from "@/components/FilterSheet";
import type { OriginMode } from "@/lib/app-shell-config";
import {
  effectiveIntentCategories,
  mergeIntentFilters,
} from "@/lib/discovery/intent-filters";
import {
  parseDiscoveryQuery,
  type DiscoveryIntent,
} from "@/lib/discovery/query-intent";
import { filterPlacesInSearchArea, type GeoPoint } from "@/lib/hybrid-map-platform";
import { matchesSearch, withDistance } from "@/lib/place-utils";
import { passesFilters, sortPlaces, type RecommendationContext } from "@/lib/place-ranking";
import type { CategoryId, Place, SortMode } from "@/types/place";

export type DiscoveryInput = {
  places: Place[];
  origin: GeoPoint;
  category: "all" | CategoryId;
  query: string;
  /**
   * Optional during the Phase 2B rollout so existing call sites keep working.
   * UI surfaces can parse once and pass the memoized intent; otherwise the
   * shared engine derives it locally from `query` with no network access.
   */
  queryIntent?: DiscoveryIntent;
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
  const intent = input.queryIntent ?? parseDiscoveryQuery(input.query);
  const effectiveFilters = mergeIntentFilters(input.filters, intent);
  const effectiveCategories = effectiveIntentCategories(input.category, intent);
  const allPlaces = input.places.map((place) => withDistance(place, input.origin));

  const base = allPlaces.filter((place) => {
    if (
      effectiveCategories
      && !effectiveCategories.some((category) => place.categories.includes(category))
    ) return false;
    if (!matchesSearch(place, intent.freeText)) return false;
    if (!passesFilters(place, effectiveFilters, input.verifiedOnly)) return false;
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

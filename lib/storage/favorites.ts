import type { Place } from "@/types/place";
import { setFavoriteCloud } from "@/lib/cloud/store";
export const FAVORITES_KEY = "cloud-only";
export function saveFavorite(place: Place, saved: boolean) { return setFavoriteCloud(place, saved); }

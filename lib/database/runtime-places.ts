import type { Place } from "@/types/place";

let runtimePlaces: Place[] = [];

export function setRuntimeLoadedPlaces(places: Place[]) {
  runtimePlaces = places;
}

export function getRuntimeLoadedPlaces() {
  return runtimePlaces;
}

export function resetRuntimeLoadedPlacesForTests() {
  runtimePlaces = [];
}

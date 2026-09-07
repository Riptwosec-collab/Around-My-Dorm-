import type { PlaceUpdateDiff } from "@/lib/place-update-engine";

export type PlaceUpdateHistoryEntry = {
  id: string;
  placeId: string;
  placeName: string;
  changedAt: string;
  source: string;
  previousData: Record<string, unknown>;
  newData: Record<string, unknown>;
};

const HISTORY_KEY = "around-dorm-place-update-history-v1";
const PENDING_KEY = "around-dorm-place-update-pending-v1";

function parseArray<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function loadPendingPlaceChanges() {
  return parseArray<PlaceUpdateDiff>(PENDING_KEY);
}

export function savePendingPlaceChanges(changes: PlaceUpdateDiff[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PENDING_KEY, JSON.stringify(changes.slice(0, 500)));
}

export function loadPlaceUpdateHistory() {
  return parseArray<PlaceUpdateHistoryEntry>(HISTORY_KEY);
}

export function appendPlaceUpdateHistory(entry: PlaceUpdateHistoryEntry) {
  if (typeof window === "undefined") return;
  const current = loadPlaceUpdateHistory();
  localStorage.setItem(HISTORY_KEY, JSON.stringify([entry, ...current].slice(0, 200)));
}

export function removePlaceUpdateHistory(id: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(HISTORY_KEY, JSON.stringify(loadPlaceUpdateHistory().filter((entry) => entry.id !== id)));
}

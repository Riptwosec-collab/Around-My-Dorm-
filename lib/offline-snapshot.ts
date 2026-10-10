import type { AppSettings, SavedCollection } from "@/lib/app-shell-config";
import type { RecentView } from "@/types/app";
import type { Place } from "@/types/place";

const STORAGE_KEY = "around-my-dorm-offline-snapshot-v1";
const MAX_RECENT = 100;
const MAX_FAVORITES = 100;

export type OfflineAppSnapshot = {
  version: 1;
  savedAt: string;
  favorites: Place[];
  recentViews: RecentView[];
  settings: AppSettings;
  collections: SavedCollection[];
};

function storageAvailable() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function saveOfflineAppSnapshot(input: Omit<OfflineAppSnapshot, "version" | "savedAt">) {
  if (!storageAvailable()) return;
  try {
    const snapshot: OfflineAppSnapshot = {
      version: 1,
      savedAt: new Date().toISOString(),
      favorites: input.favorites.slice(0, MAX_FAVORITES),
      recentViews: input.recentViews.slice(0, MAX_RECENT),
      settings: input.settings,
      collections: input.collections,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Offline mirroring is best-effort and must never block the app.
  }
}

export function loadOfflineAppSnapshot(): OfflineAppSnapshot | null {
  if (!storageAvailable()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<OfflineAppSnapshot>;
    if (
      value.version !== 1 ||
      !Array.isArray(value.favorites) ||
      !Array.isArray(value.recentViews) ||
      !Array.isArray(value.collections) ||
      !value.settings ||
      typeof value.settings !== "object"
    ) return null;
    return value as OfflineAppSnapshot;
  } catch {
    return null;
  }
}

export function clearOfflineAppSnapshot() {
  if (!storageAvailable()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

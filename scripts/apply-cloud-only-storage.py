from pathlib import Path

ROOT = Path('.')

def write(path: str, content: str):
    p = ROOT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding='utf-8')

def replace(path: str, old: str, new: str):
    p = ROOT / path
    text = p.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'Pattern not found in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new), encoding='utf-8')

write('lib/cloud/supabase.ts', r'''import { createClient, type User } from "@supabase/supabase-js";

const FALLBACK_SUPABASE_URL = "https://gfqkexnqbjtuwsyqacsw.supabase.co";
const FALLBACK_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_jsDnGIrAjuf0b9w9Hy1z8g_u9SXAfht";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_SUPABASE_URL;
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_SUPABASE_PUBLISHABLE_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: "amd-supabase-auth-session-v1",
  },
});

let cloudUserPromise: Promise<User> | null = null;

export function ensureCloudUser(): Promise<User> {
  if (cloudUserPromise) return cloudUserPromise;
  cloudUserPromise = (async () => {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (sessionData.session?.user) return sessionData.session.user;
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error || !data.user) {
      cloudUserPromise = null;
      throw error || new Error("Cloud session could not be created");
    }
    return data.user;
  })();
  return cloudUserPromise;
}

export function cloudOnlyPersistenceNote() {
  return "Application data is persisted in Supabase only. The browser keeps only the Supabase authentication session and transient PWA/runtime caches.";
}
''')

write('lib/cloud/store.ts', r'''import { ensureCloudUser, supabase } from "@/lib/cloud/supabase";
import type { AppSettings, RecentView, SavedCollection } from "@/types/app";
import type { Place } from "@/types/place";

export type CloudAppState = {
  userId: string;
  favorites: Place[];
  recentViews: RecentView[];
  settings: Partial<AppSettings> | null;
  collections: SavedCollection[];
};

function isPlace(value: unknown): value is Place {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<Place>;
  return typeof record.id === "string" && typeof record.name === "string";
}

export async function loadCloudAppState(defaultCollections: SavedCollection[]): Promise<CloudAppState> {
  const user = await ensureCloudUser();
  const [favoritesResult, recentResult, settingsResult, collectionsResult, collectionPlacesResult] = await Promise.all([
    supabase.from("amd_favorites").select("place_id,snapshot,created_at").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("amd_recent_views").select("place_id,source,snapshot,viewed_at").eq("user_id", user.id).order("viewed_at", { ascending: false }).limit(100),
    supabase.from("amd_user_settings").select("settings").eq("user_id", user.id).maybeSingle(),
    supabase.from("amd_collections").select("id,client_id,system_key,title,icon,updated_at").eq("user_id", user.id).order("updated_at", { ascending: true }),
    supabase.from("amd_collection_places").select("collection_id,place_id").eq("user_id", user.id),
  ]);
  for (const result of [favoritesResult, recentResult, settingsResult, collectionsResult, collectionPlacesResult]) {
    if (result.error) throw result.error;
  }

  const favorites = (favoritesResult.data || []).map((row: any) => row.snapshot).filter(isPlace);
  const recentViews: RecentView[] = (recentResult.data || []).map((row: any) => ({
    placeId: row.place_id,
    viewedAt: row.viewed_at,
    source: row.source || "seed",
    snapshot: isPlace(row.snapshot) ? row.snapshot : undefined,
  }));

  const rows = collectionsResult.data || [];
  let collections: SavedCollection[] = [];
  if (rows.length) {
    const placeRows = collectionPlacesResult.data || [];
    collections = rows.map((row: any) => ({
      id: row.client_id,
      title: row.title,
      icon: row.icon || "📌",
      placeIds: placeRows.filter((item: any) => item.collection_id === row.id).map((item: any) => item.place_id),
    }));
  } else {
    collections = defaultCollections;
    await saveCollectionsCloud(defaultCollections);
  }

  return {
    userId: user.id,
    favorites,
    recentViews,
    settings: (settingsResult.data?.settings as Partial<AppSettings> | undefined) || null,
    collections,
  };
}

export async function saveSettingsCloud(settings: AppSettings) {
  const user = await ensureCloudUser();
  const { error } = await supabase.from("amd_user_settings").upsert({ user_id: user.id, settings, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw error;
}

export async function setFavoriteCloud(place: Place, saved: boolean) {
  const user = await ensureCloudUser();
  if (saved) {
    const { error } = await supabase.from("amd_favorites").upsert({ user_id: user.id, place_id: place.id, snapshot: place }, { onConflict: "user_id,place_id" });
    if (error) throw error;
  } else {
    const { error } = await supabase.from("amd_favorites").delete().eq("user_id", user.id).eq("place_id", place.id);
    if (error) throw error;
  }
}

export async function saveCollectionsCloud(collections: SavedCollection[]) {
  const user = await ensureCloudUser();
  const existing = await supabase.from("amd_collections").select("id,client_id").eq("user_id", user.id);
  if (existing.error) throw existing.error;
  const keep = new Set(collections.map((item) => item.id));
  const removeIds = (existing.data || []).filter((row: any) => !keep.has(row.client_id)).map((row: any) => row.id);
  if (removeIds.length) {
    const removed = await supabase.from("amd_collections").delete().eq("user_id", user.id).in("id", removeIds);
    if (removed.error) throw removed.error;
  }

  for (const collection of collections) {
    const systemKey = ["wishlist", "regular", "late", "work"].includes(collection.id) ? collection.id : null;
    const upsert = await supabase.from("amd_collections").upsert({
      user_id: user.id,
      client_id: collection.id,
      system_key: systemKey,
      title: collection.title,
      icon: collection.icon,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,client_id" }).select("id").single();
    if (upsert.error) throw upsert.error;
    const collectionId = upsert.data.id;
    const cleared = await supabase.from("amd_collection_places").delete().eq("user_id", user.id).eq("collection_id", collectionId);
    if (cleared.error) throw cleared.error;
    if (collection.placeIds.length) {
      const inserted = await supabase.from("amd_collection_places").insert(collection.placeIds.map((placeId) => ({ user_id: user.id, collection_id: collectionId, place_id: placeId, snapshot: {} })));
      if (inserted.error) throw inserted.error;
    }
  }
}

export async function recordRecentViewCloud(view: RecentView) {
  const user = await ensureCloudUser();
  const { error } = await supabase.from("amd_recent_views").insert({
    user_id: user.id,
    place_id: view.placeId,
    source: view.source || "seed",
    snapshot: view.snapshot || null,
    viewed_at: view.viewedAt,
  });
  if (error) throw error;
}

export async function submitPlaceReportCloud(input: { placeId: string; reportType: string; message?: string | null }) {
  const user = await ensureCloudUser();
  const { error } = await supabase.from("amd_reports").insert({ user_id: user.id, place_id: input.placeId, report_type: input.reportType, message: input.message || null });
  if (error) throw error;
}

export async function logRuntimeEventCloud(eventName: string, payload: Record<string, unknown> = {}, level = "info") {
  try {
    const user = await ensureCloudUser();
    await supabase.from("amd_runtime_events").insert({ user_id: user.id, event_name: eventName, level, payload });
  } catch {
    // Observability must never break the user flow.
  }
}
''')

write('lib/database/places.ts', r'''import { PLACES as EMBEDDED_PLACES } from "@/data/places";
import { ensureCloudUser, supabase } from "@/lib/cloud/supabase";
import type { Place } from "@/types/place";
import { prepareProvenancePatch } from "@/lib/field-provenance";

export type PlaceDatabaseSource = "supabase" | "embedded";
export type PlaceDatabaseResult = { places: Place[]; source: PlaceDatabaseSource; loadedAt: string; warning: string | null };
export type LocalPlaceHistory = { id: string; placeId: string; placeName: string; changedAt: string; source: string; previousData: Partial<Place>; newData: Partial<Place> };
export type ApplyLocalPlacePatchResult = { appliedFields: string[]; blockedFields: string[] };

let runtimeCanonicalCache: { at: number; places: Place[] } | null = null;
const RUNTIME_CACHE_MS = 5 * 60 * 1000;

function isPlaceRecord(value: unknown): value is Place {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<Place>;
  return typeof record.id === "string" && typeof record.name === "string" && typeof record.slug === "string" && Array.isArray(record.categories);
}

async function loadCanonicalCloudPlaces(): Promise<Place[] | null> {
  if (runtimeCanonicalCache && Date.now() - runtimeCanonicalCache.at < RUNTIME_CACHE_MS) return runtimeCanonicalCache.places;
  const { data, error } = await supabase.from("amd_places").select("record").order("name", { ascending: true });
  if (error) throw error;
  const places = (data || []).map((row: any) => row.record).filter(isPlaceRecord);
  if (!places.length) return null;
  runtimeCanonicalCache = { at: Date.now(), places };
  return places;
}

async function applyCloudUserLayer(places: Place[]) {
  const user = await ensureCloudUser();
  const [overridesResult, additionsResult] = await Promise.all([
    supabase.from("amd_place_overrides").select("place_id,patch,source,applied_at").eq("user_id", user.id),
    supabase.from("amd_place_additions").select("record").eq("user_id", user.id).order("updated_at", { ascending: false }),
  ]);
  if (overridesResult.error) throw overridesResult.error;
  if (additionsResult.error) throw additionsResult.error;
  const overrides = new Map((overridesResult.data || []).map((row: any) => [row.place_id, row]));
  const base = places.map((place) => {
    const override: any = overrides.get(place.id);
    if (!override) return place;
    return { ...place, ...(override.patch || {}), source: Array.from(new Set([...(place.source || []), override.source])), lastUpdated: override.applied_at } as Place;
  });
  const known = new Set(base.map((place) => place.id));
  const additions = (additionsResult.data || []).map((row: any) => row.record).filter(isPlaceRecord).filter((place) => !known.has(place.id));
  return [...base, ...additions];
}

export async function loadPlacesFromDatabase(): Promise<PlaceDatabaseResult> {
  let canonical: Place[] | null = null;
  let source: PlaceDatabaseSource = "embedded";
  let warning: string | null = null;
  try {
    canonical = await loadCanonicalCloudPlaces();
    if (canonical?.length) source = "supabase";
  } catch (error) {
    warning = error instanceof Error ? error.message : "Cloud place database unavailable";
  }
  const base = canonical?.length ? canonical : EMBEDDED_PLACES;
  try {
    return { places: await applyCloudUserLayer(base), source, loadedAt: new Date().toISOString(), warning };
  } catch (error) {
    return { places: base, source, loadedAt: new Date().toISOString(), warning: error instanceof Error ? error.message : "Cloud profile unavailable" };
  }
}

export async function applyLocalPlacePatch(place: Place, patch: Partial<Place>, source = "manual_review"): Promise<ApplyLocalPlacePatchResult> {
  const user = await ensureCloudUser();
  const appliedAt = new Date().toISOString();
  const prepared = prepareProvenancePatch(place, patch, source, appliedAt);
  if (!prepared.appliedFields.length) return { appliedFields: [], blockedFields: prepared.blockedFields };
  const current = await supabase.from("amd_place_overrides").select("patch").eq("user_id", user.id).eq("place_id", place.id).maybeSingle();
  if (current.error) throw current.error;
  const previousData: Partial<Place> = {};
  for (const key of Object.keys(prepared.patch) as Array<keyof Place>) previousData[key] = place[key] as never;
  const upsert = await supabase.from("amd_place_overrides").upsert({ user_id: user.id, place_id: place.id, patch: { ...(current.data?.patch || {}), ...prepared.patch }, source, applied_at: appliedAt }, { onConflict: "user_id,place_id" });
  if (upsert.error) throw upsert.error;
  const history = await supabase.from("amd_place_history").insert({ user_id: user.id, place_id: place.id, place_name: place.name, source, previous_data: previousData, new_data: prepared.patch, changed_at: appliedAt });
  if (history.error) throw history.error;
  return { appliedFields: prepared.appliedFields, blockedFields: prepared.blockedFields };
}

export async function addReviewedLocalPlace(place: Place, source = "manual") {
  const user = await ensureCloudUser();
  const now = new Date().toISOString();
  const next: Place = { ...place, source: Array.from(new Set([...(place.source || []), source])), sourceId: place.sourceId ?? null, sourceUrl: place.sourceUrl ?? null, lastChecked: place.lastChecked ?? now, lastUpdated: now };
  const upsert = await supabase.from("amd_place_additions").upsert({ user_id: user.id, place_id: place.id, record: next, source, updated_at: now }, { onConflict: "user_id,place_id" });
  if (upsert.error) throw upsert.error;
  const history = await supabase.from("amd_place_history").insert({ user_id: user.id, place_id: place.id, place_name: place.name, source, previous_data: {}, new_data: next, changed_at: now });
  if (history.error) throw history.error;
}

export async function loadLocalPlaceHistory(): Promise<LocalPlaceHistory[]> {
  const user = await ensureCloudUser();
  const { data, error } = await supabase.from("amd_place_history").select("id,place_id,place_name,source,previous_data,new_data,changed_at").eq("user_id", user.id).order("changed_at", { ascending: false }).limit(200);
  if (error) throw error;
  return (data || []).map((row: any) => ({ id: row.id, placeId: row.place_id, placeName: row.place_name, changedAt: row.changed_at, source: row.source, previousData: row.previous_data || {}, newData: row.new_data || {} }));
}

export async function rollbackLocalPlaceHistory(entry: LocalPlaceHistory) {
  const user = await ensureCloudUser();
  if (Object.keys(entry.previousData).length === 0) {
    const removed = await supabase.from("amd_place_additions").delete().eq("user_id", user.id).eq("place_id", entry.placeId);
    if (removed.error) throw removed.error;
  } else {
    const current = await supabase.from("amd_place_overrides").select("patch").eq("user_id", user.id).eq("place_id", entry.placeId).maybeSingle();
    if (current.error) throw current.error;
    const nextPatch = { ...(current.data?.patch || {}), ...entry.previousData };
    const updated = await supabase.from("amd_place_overrides").upsert({ user_id: user.id, place_id: entry.placeId, patch: nextPatch, source: "rollback", applied_at: new Date().toISOString() }, { onConflict: "user_id,place_id" });
    if (updated.error) throw updated.error;
  }
  const removedHistory = await supabase.from("amd_place_history").delete().eq("user_id", user.id).eq("id", entry.id);
  if (removedHistory.error) throw removedHistory.error;
}

export function embeddedPlaces(): Place[] { return EMBEDDED_PLACES; }
''')

write('lib/storage/recent.ts', r'''import type { Place } from "@/types/place";
import type { RecentView } from "@/types/app";

const MAX_RECENT_VIEWS = 100;

export function addRecentView(current: RecentView[], place: Place, central: boolean): RecentView[] {
  const view: RecentView = { placeId: place.id, viewedAt: new Date().toISOString(), source: central ? "seed" : place.googlePlaceId ? "google" : "unknown", snapshot: central ? undefined : place };
  return [view, ...current].slice(0, MAX_RECENT_VIEWS);
}

export function resolveRecentPlaces(views: RecentView[], places: Place[]): Place[] {
  const byId = new Map(places.map((place) => [place.id, place]));
  const result: Place[] = [];
  const seen = new Set<string>();
  for (const view of views) {
    if (seen.has(view.placeId)) continue;
    const place = byId.get(view.placeId) || view.snapshot;
    if (!place) continue;
    seen.add(view.placeId); result.push(place);
  }
  return result;
}

export function bangkokDateKey(value: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}

export function getTodayRecentStats(views: RecentView[], places: Place[], now = new Date()) {
  const todayKey = bangkokDateKey(now); const byId = new Map(places.map((place) => [place.id, place]));
  const today = views.filter((view) => { const time = new Date(view.viewedAt); return !Number.isNaN(time.getTime()) && bangkokDateKey(time) === todayKey; });
  const placeIds = new Set(today.map((view) => view.placeId)); const categories = new Set<string>(); const areas = new Set<string>();
  for (const view of today) { const place = byId.get(view.placeId) || view.snapshot; if (!place) continue; categories.add(place.category); if (place.area) areas.add(place.area); }
  return { viewCount: today.length, placeCount: placeIds.size, categoryCount: categories.size, areaCount: areas.size };
}
''')

write('lib/storage/settings.ts', r'''import type { AppSettings } from "@/types/app";
import { saveSettingsCloud } from "@/lib/cloud/store";
export const SETTINGS_KEY = "cloud-only";
export function saveSettings(settings: AppSettings) { return saveSettingsCloud(settings); }
''')

write('lib/storage/favorites.ts', r'''import type { Place } from "@/types/place";
import { setFavoriteCloud } from "@/lib/cloud/store";
export const FAVORITES_KEY = "cloud-only";
export function saveFavorite(place: Place, saved: boolean) { return setFavoriteCloud(place, saved); }
''')

write('lib/storage/collections.ts', r'''import type { SavedCollection } from "@/types/app";
import { saveCollectionsCloud } from "@/lib/cloud/store";
export const COLLECTIONS_KEY = "cloud-only";
export function saveCollections(collections: SavedCollection[]) { return saveCollectionsCloud(collections); }
''')

write('lib/storage/place-updates.ts', r'''import { ensureCloudUser, supabase } from "@/lib/cloud/supabase";
import type { PlaceUpdateDiff } from "@/lib/place-update-engine";

export type PlaceUpdateHistoryEntry = { id: string; placeId: string; placeName: string; changedAt: string; source: string; previousData: Record<string, unknown>; newData: Record<string, unknown> };

export async function loadPendingPlaceChanges(): Promise<PlaceUpdateDiff[]> {
  const user = await ensureCloudUser();
  const { data, error } = await supabase.from("amd_pending_place_changes").select("payload").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(500);
  if (error) throw error;
  return (data || []).map((row: any) => row.payload).filter(Boolean);
}

export async function savePendingPlaceChanges(changes: PlaceUpdateDiff[]) {
  const user = await ensureCloudUser();
  const cleared = await supabase.from("amd_pending_place_changes").delete().eq("user_id", user.id);
  if (cleared.error) throw cleared.error;
  if (!changes.length) return;
  const now = new Date().toISOString();
  const inserted = await supabase.from("amd_pending_place_changes").insert(changes.slice(0, 500).map((payload) => ({ user_id: user.id, payload, updated_at: now })));
  if (inserted.error) throw inserted.error;
}

export async function loadPlaceUpdateHistory(): Promise<PlaceUpdateHistoryEntry[]> {
  const user = await ensureCloudUser();
  const { data, error } = await supabase.from("amd_place_history").select("id,place_id,place_name,changed_at,source,previous_data,new_data").eq("user_id", user.id).order("changed_at", { ascending: false }).limit(200);
  if (error) throw error;
  return (data || []).map((row: any) => ({ id: row.id, placeId: row.place_id, placeName: row.place_name, changedAt: row.changed_at, source: row.source, previousData: row.previous_data || {}, newData: row.new_data || {} }));
}
''')

write('lib/storage/google-place-matches.ts', r'''import { ensureCloudUser, supabase } from "@/lib/cloud/supabase";
export type GooglePlaceMatchDecision = "linked" | "rejected" | "review";
export type GooglePlaceMatchRecord = { id: string; localPlaceId: string; googlePlaceId: string; candidateName: string; decision: GooglePlaceMatchDecision; confidence: number; distanceMeters: number | null; chainSafetyPassed: boolean; createdAt: string };
let recordsCache: GooglePlaceMatchRecord[] = [];
let thresholdCache = 75;

export async function loadGooglePlaceMatchRecords() {
  const user = await ensureCloudUser();
  const [matches, control] = await Promise.all([
    supabase.from("amd_google_place_matches").select("place_id,google_place_id,status,confidence,candidate,updated_at").eq("user_id", user.id).order("updated_at", { ascending: false }),
    supabase.from("amd_google_api_control").select("match_confidence_threshold").eq("user_id", user.id).maybeSingle(),
  ]);
  if (matches.error) throw matches.error;
  if (control.error) throw control.error;
  thresholdCache = control.data?.match_confidence_threshold || 75;
  recordsCache = (matches.data || []).filter((row: any) => row.google_place_id).map((row: any) => ({ id: `${row.place_id}:${row.google_place_id}`, localPlaceId: row.place_id, googlePlaceId: row.google_place_id, candidateName: row.candidate?.name || "", decision: row.status === "rejected" ? "rejected" : row.status === "linked" ? "linked" : "review", confidence: row.confidence || 0, distanceMeters: row.candidate?.distanceMeters ?? null, chainSafetyPassed: row.candidate?.chainSafetyPassed !== false, createdAt: row.updated_at }));
  return recordsCache;
}

export async function saveGooglePlaceMatchRecord(record: Omit<GooglePlaceMatchRecord, "id" | "createdAt">) {
  const user = await ensureCloudUser();
  const now = new Date().toISOString();
  const candidate = { name: record.candidateName, distanceMeters: record.distanceMeters, chainSafetyPassed: record.chainSafetyPassed };
  const { error } = await supabase.from("amd_google_place_matches").upsert({ user_id: user.id, place_id: record.localPlaceId, google_place_id: record.googlePlaceId, status: record.decision, confidence: record.confidence, candidate, reviewed_at: now, updated_at: now }, { onConflict: "user_id,place_id" });
  if (error) throw error;
  await loadGooglePlaceMatchRecords();
}

export function rejectedGooglePlaceIds(localPlaceId: string) { return new Set(recordsCache.filter((record) => record.localPlaceId === localPlaceId && record.decision === "rejected").map((record) => record.googlePlaceId)); }
export function loadMatchConfidenceThreshold(defaultValue = 75) { return thresholdCache || defaultValue; }
export async function saveMatchConfidenceThreshold(value: number) {
  const user = await ensureCloudUser(); thresholdCache = Math.max(50, Math.min(95, Math.round(value)));
  const { error } = await supabase.from("amd_google_api_control").upsert({ user_id: user.id, match_confidence_threshold: thresholdCache, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw error;
}
''')

# AroundMyDormApp: cloud state instead of localStorage.
p = ROOT / 'components/AroundMyDormApp.tsx'
text = p.read_text(encoding='utf-8')
text = text.replace('import { addRecentView, getTodayRecentStats, loadRecentViews, resolveRecentPlaces, saveRecentViews } from "@/lib/storage/recent";', 'import { addRecentView, getTodayRecentStats, resolveRecentPlaces } from "@/lib/storage/recent";\nimport { loadCloudAppState, recordRecentViewCloud, saveCollectionsCloud, saveSettingsCloud, setFavoriteCloud, logRuntimeEventCloud } from "@/lib/cloud/store";')
text = text.replace('  COLLECTIONS_KEY,\n', '').replace('  RECENT_META_KEY,\n', '').replace('  SETTINGS_KEY,\n', '')
old = '''  useEffect(() => {\n    try {\n      const saved = JSON.parse(localStorage.getItem("around-dorm-favorites-v2") || "[]") as Place[];\n      const recentHistory = loadRecentViews(PLACES);\n      const savedSettings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null") as Partial<AppSettings> | null;\n      const savedCollections = JSON.parse(localStorage.getItem(COLLECTIONS_KEY) || "null") as SavedCollection[] | null;\n      const nextFavorites = Array.isArray(saved) ? saved : [];\n      setFavorites(nextFavorites);\n      setRecentViews(recentHistory);\n      const mergedSettings = { ...DEFAULT_SETTINGS, ...(savedSettings || {}) };\n      setSettings({ ...mergedSettings, preferredCategories: Array.isArray(mergedSettings.preferredCategories) ? mergedSettings.preferredCategories : [] });\n      setRadiusMeters(mergedSettings.defaultRadius);\n      if (mergedSettings.homeMode === "custom" && mergedSettings.customHomeLocation) {\n        const customCenter = { lat: mergedSettings.customHomeLocation.latitude, lng: mergedSettings.customHomeLocation.longitude };\n        setOrigin(customCenter); setOriginMode("custom"); setMapSearchCenter(customCenter);\n      }\n      if (Array.isArray(savedCollections) && savedCollections.length) {\n        setCollections(savedCollections);\n      } else if (nextFavorites.length) {\n        setCollections(DEFAULT_COLLECTIONS.map((collection) => collection.id === "wishlist" ? { ...collection, placeIds: nextFavorites.map((place) => place.id) } : collection));\n      }\n    } catch {}\n  }, []);\n\n  useEffect(() => {\n    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));\n'''
new = '''  const [cloudReady, setCloudReady] = useState(false);\n  const [cloudError, setCloudError] = useState<string | null>(null);\n\n  useEffect(() => {\n    let active = true;\n    void loadCloudAppState(DEFAULT_COLLECTIONS).then((state) => {\n      if (!active) return;\n      setFavorites(state.favorites);\n      setRecentViews(state.recentViews);\n      const mergedSettings = { ...DEFAULT_SETTINGS, ...(state.settings || {}) };\n      setSettings({ ...mergedSettings, preferredCategories: Array.isArray(mergedSettings.preferredCategories) ? mergedSettings.preferredCategories : [] });\n      setRadiusMeters(mergedSettings.defaultRadius);\n      if (mergedSettings.homeMode === "custom" && mergedSettings.customHomeLocation) {\n        const customCenter = { lat: mergedSettings.customHomeLocation.latitude, lng: mergedSettings.customHomeLocation.longitude };\n        setOrigin(customCenter); setOriginMode("custom"); setMapSearchCenter(customCenter);\n      }\n      setCollections(state.collections.length ? state.collections : DEFAULT_COLLECTIONS);\n      setCloudReady(true); setCloudError(null);\n      void logRuntimeEventCloud("cloud_state_loaded", { favorites: state.favorites.length, recent: state.recentViews.length, collections: state.collections.length });\n    }).catch((error) => {\n      if (!active) return;\n      setCloudError(error instanceof Error ? error.message : "Cloud unavailable");\n      setCloudReady(false);\n    });\n    return () => { active = false; };\n  }, []);\n\n  useEffect(() => {\n'''
if old not in text:
    raise SystemExit('AroundMyDormApp initial localStorage block not found')
text = text.replace(old, new)
text = text.replace('  useEffect(() => {\n    localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(collections));\n  }, [collections]);', '  useEffect(() => {\n    if (!cloudReady) return;\n    const timer = window.setTimeout(() => { void saveCollectionsCloud(collections).catch((error) => setCloudError(error instanceof Error ? error.message : "Cloud save failed")); }, 250);\n    return () => window.clearTimeout(timer);\n  }, [collections, cloudReady]);\n\n  useEffect(() => {\n    if (!cloudReady) return;\n    const timer = window.setTimeout(() => { void saveSettingsCloud(settings).catch((error) => setCloudError(error instanceof Error ? error.message : "Cloud save failed")); }, 250);\n    return () => window.clearTimeout(timer);\n  }, [settings, cloudReady]);')
text = text.replace('      localStorage.setItem("around-dorm-favorites-v2", JSON.stringify(next));', '      void setFavoriteCloud(place, !exists).catch((error) => { setCloudError(error instanceof Error ? error.message : "Cloud save failed"); showToast(settings.language === "en" ? "Cloud save failed" : "บันทึกขึ้นคลาวด์ไม่สำเร็จ", "removed"); });')
text = text.replace('  function addRecent(place: Place) {\n    setRecentViews((current) => { const next = addRecentView(current, place, PLACES.some((item) => item.id === place.id)); saveRecentViews(next); return next; });\n  }', '  function addRecent(place: Place) {\n    setRecentViews((current) => { const next = addRecentView(current, place, PLACES.some((item) => item.id === place.id)); const latest = next[0]; if (latest) void recordRecentViewCloud(latest).catch(() => undefined); return next; });\n  }')
# Surface cloud-only state in Settings header area if the marker exists.
text = text.replace('{tab === "settings" && (\n            <div className="amd-page amd-page-enter">', '{tab === "settings" && (\n            <div className="amd-page amd-page-enter">\n              <div data-testid="cloud-only-status" className={`mb-3 rounded-2xl border px-3 py-2 text-[9px] ${cloudReady ? "border-emerald-300/15 bg-emerald-300/[0.05] text-emerald-100" : "border-amber-300/15 bg-amber-300/[0.05] text-amber-100"}`}>{cloudReady ? (settings.language === "en" ? "Cloud-only storage active • Supabase sync enabled" : "บันทึกบนคลาวด์เท่านั้น • Supabase Sync ทำงาน") : (settings.language === "en" ? `Cloud storage unavailable${cloudError ? `: ${cloudError}` : ""}` : `คลาวด์ยังไม่พร้อม${cloudError ? `: ${cloudError}` : ""}`)}</div>')
p.write_text(text, encoding='utf-8')

# DataManagement async cloud history/pending and no local usage counter.
p = ROOT / 'components/DataManagement.tsx'
text = p.read_text(encoding='utf-8')
text = text.replace('import { useMemo, useRef, useState } from "react";', 'import { useEffect, useMemo, useRef, useState } from "react";')
text = text.replace('  const [pending, setPending] = useState(() => loadPendingPlaceChanges());\n  const [history, setHistory] = useState<LocalPlaceHistory[]>(() => loadLocalPlaceHistory());', '  const [pending, setPending] = useState<Awaited<ReturnType<typeof loadPendingPlaceChanges>>>([]);\n  const [history, setHistory] = useState<LocalPlaceHistory[]>([]);\n  useEffect(() => {\n    void Promise.all([loadPendingPlaceChanges(), loadLocalPlaceHistory()]).then(([nextPending, nextHistory]) => { setPending(nextPending); setHistory(nextHistory); }).catch((error) => setMessage(error instanceof Error ? error.message : "Cloud state unavailable"));\n  }, []);')
text = text.replace('  const externalUsage = useMemo(() => {\n    if (typeof window === "undefined") return 0;\n    try { return Number(JSON.parse(localStorage.getItem("around-dorm-external-usage-v1") || "0")) || 0; } catch { return 0; }\n  }, []);', '  const externalUsage = 0;')
text = text.replace('  function applySafeChange(changeId: string) {', '  async function applySafeChange(changeId: string) {')
text = text.replace('    const result = applyLocalPlacePatch(place, patch, change.source);', '    const result = await applyLocalPlacePatch(place, patch, change.source);')
text = text.replace('    setHistory(loadLocalPlaceHistory());\n    onReload();', '    setHistory(await loadLocalPlaceHistory());\n    onReload();', 1)
text = text.replace('  function applySingleField(changeId: string, fieldName: string) {', '  async function applySingleField(changeId: string, fieldName: string) {')
text = text.replace('    const result = applyLocalPlacePatch(place, { [field.field]: field.incomingValue } as Partial<Place>, `${change.source}:field_review`);', '    const result = await applyLocalPlacePatch(place, { [field.field]: field.incomingValue } as Partial<Place>, `${change.source}:field_review`);')
text = text.replace('    setHistory(loadLocalPlaceHistory());\n    onReload();', '    setHistory(await loadLocalPlaceHistory());\n    onReload();', 1)
text = text.replace('  function undo(entry: LocalPlaceHistory) {\n    rollbackLocalPlaceHistory(entry);\n    setHistory(loadLocalPlaceHistory());\n    onReload();\n  }', '  async function undo(entry: LocalPlaceHistory) {\n    await rollbackLocalPlaceHistory(entry);\n    setHistory(await loadLocalPlaceHistory());\n    onReload();\n  }')
text = text.replace('  function addCandidate(item: NewPlaceCandidate, keepSeparate = false) {', '  async function addCandidate(item: NewPlaceCandidate, keepSeparate = false) {')
text = text.replace('    addReviewedLocalPlace(place, candidate.sourceProvider);', '    await addReviewedLocalPlace(place, candidate.sourceProvider);')
text = text.replace('    setHistory(loadLocalPlaceHistory());\n    onReload();', '    setHistory(await loadLocalPlaceHistory());\n    onReload();', 1)
text = text.replace('  function addManualPlace() {', '  async function addManualPlace() {')
text = text.replace('    addReviewedLocalPlace(place, "manual");', '    await addReviewedLocalPlace(place, "manual");')
text = text.replace('    setHistory(loadLocalPlaceHistory());\n    onReload();', '    setHistory(await loadLocalPlaceHistory());\n    onReload();', 1)
p.write_text(text, encoding='utf-8')

# GooglePlaceIdManager: hydrate cloud match history and await cloud writes.
p = ROOT / 'components/GooglePlaceIdManager.tsx'
text = p.read_text(encoding='utf-8')
text = text.replace('  const [threshold, setThreshold] = useState(() => loadMatchConfidenceThreshold(DEFAULT_MATCH_CONFIDENCE_THRESHOLD));', '  const [threshold, setThreshold] = useState(DEFAULT_MATCH_CONFIDENCE_THRESHOLD);')
text = text.replace('  useEffect(() => {\n    const syncLock = () => setApiLocked(getGoogleApiControlSettings().locked);', '  useEffect(() => {\n    void loadGooglePlaceMatchRecords().then(() => setThreshold(loadMatchConfidenceThreshold(DEFAULT_MATCH_CONFIDENCE_THRESHOLD))).catch(() => undefined);\n    const syncLock = () => setApiLocked(getGoogleApiControlSettings().locked);')
text = text.replace('import { loadMatchConfidenceThreshold, rejectedGooglePlaceIds, saveGooglePlaceMatchRecord, saveMatchConfidenceThreshold } from "@/lib/storage/google-place-matches";', 'import { loadGooglePlaceMatchRecords, loadMatchConfidenceThreshold, rejectedGooglePlaceIds, saveGooglePlaceMatchRecord, saveMatchConfidenceThreshold } from "@/lib/storage/google-place-matches";')
text = text.replace('  function recordDecision(item: CandidateAssessment, decision: "linked" | "rejected" | "review") {', '  async function recordDecision(item: CandidateAssessment, decision: "linked" | "rejected" | "review") {')
text = text.replace('    saveGooglePlaceMatchRecord({', '    await saveGooglePlaceMatchRecord({')
text = text.replace('  function performLink(item: CandidateAssessment) {', '  async function performLink(item: CandidateAssessment) {')
text = text.replace('    applyLocalPlacePatch(matchingPlace, {', '    await applyLocalPlacePatch(matchingPlace, {')
text = text.replace('    recordDecision(item, "linked");', '    await recordDecision(item, "linked");')
text = text.replace('  function requestLink(item: CandidateAssessment) {', '  async function requestLink(item: CandidateAssessment) {')
text = text.replace('      recordDecision(item, "review");', '      await recordDecision(item, "review");')
text = text.replace('    performLink(item);', '    await performLink(item);')
text = text.replace('  function rejectCandidate(item: CandidateAssessment) {\n    recordDecision(item, "rejected");', '  async function rejectCandidate(item: CandidateAssessment) {\n    await recordDecision(item, "rejected");')
text = text.replace('saveMatchConfidenceThreshold(value);', 'void saveMatchConfidenceThreshold(value);')
p.write_text(text, encoding='utf-8')

# App config no longer advertises local persistence keys.
p = ROOT / 'lib/app-shell-config.ts'
text = p.read_text(encoding='utf-8')
text = text.replace('export const SETTINGS_KEY = "around-dorm-settings-v3";\nexport const COLLECTIONS_KEY = "around-dorm-collections-v1";\nexport const RECENT_META_KEY = "around-dorm-recent-meta-v1";\n\n', '')
p.write_text(text, encoding='utf-8')

# Environment docs: cloud is the only persistent store.
p = ROOT / '.env.example'
text = p.read_text(encoding='utf-8')
if 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY' not in text:
    text += '\n# Cloud-only persistence (Supabase)\nNEXT_PUBLIC_SUPABASE_URL=https://gfqkexnqbjtuwsyqacsw.supabase.co\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_jsDnGIrAjuf0b9w9Hy1z8g_u9SXAfht\n# Anonymous Auth must be enabled. App data never falls back to localStorage.\n'
p.write_text(text, encoding='utf-8')

# Architecture regression test: no app-data localStorage persistence remains in core storage/runtime modules.
write('tests/cloud-only-storage.test.ts', r'''import { describe, expect, it } from "vitest";
import fs from "node:fs";

const cloudOnlyFiles = [
  "components/AroundMyDormApp.tsx",
  "components/DataManagement.tsx",
  "lib/database/places.ts",
  "lib/storage/favorites.ts",
  "lib/storage/collections.ts",
  "lib/storage/recent.ts",
  "lib/storage/settings.ts",
  "lib/storage/place-updates.ts",
  "lib/storage/google-place-matches.ts",
];

describe("cloud-only application persistence", () => {
  it("does not persist application records in localStorage", () => {
    for (const file of cloudOnlyFiles) {
      const source = fs.readFileSync(file, "utf8");
      expect(source, file).not.toContain("localStorage");
    }
  });
  it("uses RLS-scoped Around My Dorm cloud tables", () => {
    const source = fs.readFileSync("lib/cloud/store.ts", "utf8") + fs.readFileSync("lib/database/places.ts", "utf8");
    expect(source).toContain("amd_favorites");
    expect(source).toContain("amd_user_settings");
    expect(source).toContain("amd_recent_views");
    expect(source).toContain("amd_place_overrides");
  });
});
''')

print('Cloud-only storage migration staged.')

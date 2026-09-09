import { PLACES as EMBEDDED_PLACES } from "@/data/places";
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

import { ensureCloudUser, supabase } from "@/lib/cloud/supabase";
import type { AppSettings, RecentView, SavedCollection } from "@/types/app";
import type { Place } from "@/types/place";

export type CloudAppState = {
  userId: string;
  favorites: Place[];
  recentViews: RecentView[];
  settings: Partial<AppSettings> | null;
  collections: SavedCollection[];
};

export type CloudTripPlan = {
  id: string;
  clientId: string;
  title: string;
  placeIds: string[];
  mode: string;
  updatedAt: string;
};

export type CloudCheckin = {
  placeId: string;
  crowdLevel: "quiet" | "normal" | "busy";
  checkedInAt: string;
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

export async function saveTripPlanCloud(input: { clientId: string; title: string; placeIds: string[]; mode?: string }) {
  const user = await ensureCloudUser();
  const { error } = await supabase.from("amd_trip_plans").upsert({
    user_id: user.id,
    client_id: input.clientId,
    title: input.title,
    place_ids: input.placeIds.slice(0, 5),
    mode: input.mode || "mixed",
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,client_id" });
  if (error) throw error;
}

export async function loadTripPlansCloud(): Promise<CloudTripPlan[]> {
  const user = await ensureCloudUser();
  const { data, error } = await supabase.from("amd_trip_plans").select("id,client_id,title,place_ids,mode,updated_at").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(20);
  if (error) throw error;
  return (data || []).map((row: any) => ({ id: row.id, clientId: row.client_id, title: row.title, placeIds: Array.isArray(row.place_ids) ? row.place_ids : [], mode: row.mode || "mixed", updatedAt: row.updated_at }));
}

export async function recordCrowdCheckinCloud(input: { placeId: string; crowdLevel: "quiet" | "normal" | "busy" }) {
  const user = await ensureCloudUser();
  const { error } = await supabase.from("amd_checkins").insert({ user_id: user.id, place_id: input.placeId, crowd_level: input.crowdLevel, checked_in_at: new Date().toISOString() });
  if (error) throw error;
}

export async function loadMyRecentCheckinsCloud(placeIds: string[]): Promise<CloudCheckin[]> {
  if (!placeIds.length) return [];
  const user = await ensureCloudUser();
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase.from("amd_checkins").select("place_id,crowd_level,checked_in_at").eq("user_id", user.id).in("place_id", placeIds.slice(0, 50)).gte("checked_in_at", cutoff).order("checked_in_at", { ascending: false });
  if (error) throw error;
  return (data || []).map((row: any) => ({ placeId: row.place_id, crowdLevel: row.crowd_level, checkedInAt: row.checked_in_at }));
}

export async function saveNotificationRulesCloud(rules: Record<string, unknown>) {
  const user = await ensureCloudUser();
  const { error } = await supabase.from("amd_notification_rules").upsert({ user_id: user.id, rules, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw error;
}

export async function savePushSubscriptionCloud(subscription: PushSubscriptionJSON) {
  const user = await ensureCloudUser();
  const endpoint = subscription.endpoint || "";
  if (!endpoint) throw new Error("Push subscription endpoint is missing");
  const row = {
    user_id: user.id,
    endpoint,
    p256dh: subscription.keys?.p256dh || "",
    auth: subscription.keys?.auth || "",
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("amd_push_subscriptions").upsert(row, { onConflict: "user_id,endpoint" });
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

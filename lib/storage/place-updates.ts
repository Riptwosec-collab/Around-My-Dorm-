import { ensureCloudUser, supabase } from "@/lib/cloud/supabase";
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

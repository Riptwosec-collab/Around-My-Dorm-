import { supabase } from "@/lib/cloud/supabase";
import type { HomeOrigin } from "@/types/place";

const HOME_ID: HomeOrigin["id"] = "baan-supha-apartment";
export const HOME_ORIGIN_CHANGED_EVENT = "amd-home-origin-changed";

function validLatitude(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -90 && value <= 90;
}

function validLongitude(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -180 && value <= 180;
}

export function isUsableHomeOrigin(
  value: Pick<HomeOrigin, "googlePlaceId" | "latitude" | "longitude" | "verifiedAt">,
): boolean {
  return Boolean(
    value.googlePlaceId?.trim() &&
      validLatitude(value.latitude) &&
      validLongitude(value.longitude) &&
      value.verifiedAt,
  );
}

export function notifyHomeOriginChanged(origin: HomeOrigin | null): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<HomeOrigin | null>(HOME_ORIGIN_CHANGED_EVENT, { detail: origin }));
}

function fromRow(row: any): HomeOrigin {
  return {
    id: HOME_ID,
    nameTh: "บ้านสุภาอพาร์ทเม้นต์",
    nameEn: typeof row?.name_en === "string" ? row.name_en : null,
    googlePlaceId: typeof row?.google_place_id === "string" ? row.google_place_id : null,
    formattedAddress: typeof row?.formatted_address === "string" ? row.formatted_address : null,
    latitude: typeof row?.latitude === "number" ? row.latitude : null,
    longitude: typeof row?.longitude === "number" ? row.longitude : null,
    googleMapsUrl: typeof row?.google_maps_url === "string" ? row.google_maps_url : null,
    resolvedAt: typeof row?.resolved_at === "string" ? row.resolved_at : null,
    verifiedAt: typeof row?.verified_at === "string" ? row.verified_at : null,
    source: row?.source === "google_places" || row?.source === "manual_verified" ? row.source : "unresolved",
  };
}

export async function loadHomeOrigin(): Promise<HomeOrigin | null> {
  const { data, error } = await supabase
    .from("amd_home_origin")
    .select("id,name_th,name_en,google_place_id,formatted_address,latitude,longitude,google_maps_url,resolved_at,verified_at,source")
    .eq("id", HOME_ID)
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data) : null;
}

export async function saveVerifiedHomeOrigin(origin: HomeOrigin): Promise<void> {
  if (!isUsableHomeOrigin(origin)) {
    throw new Error("HOME origin must have a verified Google Place ID and valid coordinates");
  }
  const { error } = await supabase.from("amd_home_origin").upsert({
    id: HOME_ID,
    name_th: "บ้านสุภาอพาร์ทเม้นต์",
    name_en: origin.nameEn,
    google_place_id: origin.googlePlaceId,
    formatted_address: origin.formattedAddress,
    latitude: origin.latitude,
    longitude: origin.longitude,
    google_maps_url: origin.googleMapsUrl,
    resolved_at: origin.resolvedAt || new Date().toISOString(),
    verified_at: origin.verifiedAt,
    source: origin.source,
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (error) throw error;
}

export function unresolvedHomeOrigin(): HomeOrigin {
  return {
    id: HOME_ID,
    nameTh: "บ้านสุภาอพาร์ทเม้นต์",
    nameEn: null,
    googlePlaceId: null,
    formattedAddress: null,
    latitude: null,
    longitude: null,
    googleMapsUrl: null,
    resolvedAt: null,
    verifiedAt: null,
    source: "unresolved",
  };
}

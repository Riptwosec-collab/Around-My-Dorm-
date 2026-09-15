import { getAdminAccessState } from "@/lib/admin-auth";
import {
  validatePermanentImageMetadata,
  type CloudPermanentImageRow,
  type PermanentImageSource,
} from "@/lib/cloud/place-image-model";
import { supabase } from "@/lib/cloud/supabase";

export const PERMANENT_IMAGE_BUCKET = "amd-place-images";
export const PERMANENT_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

const PLACE_ID_CHUNK_SIZE = 100;
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

export type PermanentImageUploadInput = {
  placeId: string;
  file: File;
  source: PermanentImageSource;
  rightsBasis: string;
  sourceReference?: string | null;
  sourceUrl?: string | null;
  attribution?: string | null;
  width?: number | null;
  height?: number | null;
  isCover?: boolean;
};

function requireNonEmptyPlaceId(placeId: string) {
  const normalized = placeId.trim();
  if (!normalized) throw new Error("Place ID is required for a permanent image");
  return normalized;
}

function validateUploadFile(file: File) {
  const extension = EXTENSIONS[file.type];
  if (!extension) {
    throw new Error("Permanent images must be JPEG, PNG, WebP, or AVIF");
  }
  if (file.size > PERMANENT_IMAGE_MAX_BYTES) {
    throw new Error("Permanent images must be 8 MiB or smaller");
  }
  return extension;
}

async function requirePermanentImageAdmin() {
  const [{ data, error }, access] = await Promise.all([
    supabase.auth.getUser(),
    getAdminAccessState(),
  ]);
  if (error) throw error;
  const user = data.user;
  if (!user || user.is_anonymous || !access.authenticated || access.anonymous || !access.admin) {
    throw new Error("Around My Dorm admin authentication is required for permanent image changes");
  }
  return user;
}

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

export async function loadActivePermanentImageRows(placeIds: string[]): Promise<CloudPermanentImageRow[]> {
  const ids = Array.from(new Set(placeIds.map((id) => id.trim()).filter(Boolean)));
  if (!ids.length) return [];

  const rows: CloudPermanentImageRow[] = [];
  for (const idsChunk of chunk(ids, PLACE_ID_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("amd_place_images")
      .select("*")
      .eq("status", "active")
      .in("place_id", idsChunk);
    if (error) throw error;
    if (data?.length) rows.push(...(data as CloudPermanentImageRow[]));
  }
  return rows;
}

export function getPermanentImagePublicUrl(row: CloudPermanentImageRow): string {
  if (!row.storage_path?.trim()) throw new Error("Permanent image Storage path is missing");
  return supabase.storage
    .from(row.storage_bucket || PERMANENT_IMAGE_BUCKET)
    .getPublicUrl(row.storage_path).data.publicUrl;
}

export async function setPermanentImageCover(imageId: string): Promise<void> {
  if (!imageId.trim()) throw new Error("Permanent image ID is required");
  const { error } = await supabase.rpc("amd_set_place_image_cover", { p_image_id: imageId });
  if (error) throw error;
}

export async function archivePermanentPlaceImage(
  row: CloudPermanentImageRow,
): Promise<{ objectRemoved: boolean }> {
  await requirePermanentImageAdmin();
  const updatedAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("amd_place_images")
    .update({ status: "archived", is_cover: false, updated_at: updatedAt })
    .eq("id", row.id);
  if (updateError) throw updateError;

  if (!row.storage_path?.trim()) return { objectRemoved: true };
  const { error: removeError } = await supabase.storage
    .from(row.storage_bucket || PERMANENT_IMAGE_BUCKET)
    .remove([row.storage_path]);
  return { objectRemoved: !removeError };
}

export async function uploadPermanentPlaceImage(
  input: PermanentImageUploadInput,
): Promise<CloudPermanentImageRow> {
  const placeId = requireNonEmptyPlaceId(input.placeId);
  const extension = validateUploadFile(input.file);
  const metadata = validatePermanentImageMetadata({
    source: input.source,
    rightsBasis: input.rightsBasis,
    sourceUrl: input.sourceUrl,
    sourceReference: input.sourceReference,
  });
  const user = await requirePermanentImageAdmin();
  const objectPath = `${placeId}/${crypto.randomUUID()}.${extension}`;

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(PERMANENT_IMAGE_BUCKET)
    .upload(objectPath, input.file, {
      contentType: input.file.type,
      upsert: false,
    });
  if (uploadError) throw uploadError;

  const storagePath = uploadData?.path || objectPath;
  const timestamp = new Date().toISOString();
  const payload = {
    place_id: placeId,
    source: metadata.source,
    source_reference: metadata.sourceReference,
    source_url: metadata.sourceUrl,
    attribution: input.attribution?.trim() || null,
    width: input.width ?? null,
    height: input.height ?? null,
    verified: true,
    last_checked: timestamp,
    storage_bucket: PERMANENT_IMAGE_BUCKET,
    storage_path: storagePath,
    rights_basis: metadata.rightsBasis,
    mime_type: input.file.type,
    byte_size: input.file.size,
    is_cover: false,
    status: "active" as const,
    created_by: user.id,
    updated_at: timestamp,
  };

  const { data: inserted, error: insertError } = await supabase
    .from("amd_place_images")
    .insert(payload)
    .select("*")
    .single();

  if (insertError || !inserted) {
    await supabase.storage.from(PERMANENT_IMAGE_BUCKET).remove([storagePath]);
    throw insertError || new Error("Permanent image registry row was not created");
  }

  const createdRow = inserted as CloudPermanentImageRow;
  if (!input.isCover) return createdRow;

  try {
    await setPermanentImageCover(createdRow.id);
    return { ...createdRow, is_cover: true, updated_at: new Date().toISOString() };
  } catch (error) {
    try {
      await archivePermanentPlaceImage(createdRow);
    } catch {
      // Preserve the original cover error. If archiving itself fails, keeping the
      // uploaded object is safer than deleting bytes still referenced by an active row.
    }
    throw error;
  }
}

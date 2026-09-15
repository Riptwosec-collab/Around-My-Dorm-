import { requireAdminSessionToken } from "@/lib/admin-auth";

export const ADMIN_NOTE_MAX_LENGTH = 500;

export type AdminNoteSaveResult = {
  placeId: string;
  note: string | null;
  updatedAt: string;
};

export function normalizeAdminNote(value: string): string | null {
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > ADMIN_NOTE_MAX_LENGTH) {
    throw new Error(`Admin note must be ${ADMIN_NOTE_MAX_LENGTH} characters or fewer`);
  }
  return normalized;
}

export async function saveAdminPlaceNote(placeId: string, note: string): Promise<AdminNoteSaveResult> {
  const normalizedPlaceId = placeId.trim();
  if (!normalizedPlaceId) throw new Error("Place id is required");
  const normalizedNote = normalizeAdminNote(note);
  const token = await requireAdminSessionToken();

  const response = await fetch("/api/admin-notes", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ placeId: normalizedPlaceId, note: normalizedNote }),
  });

  const payload = await response.json().catch(() => null) as ({ ok?: boolean; error?: string } & Partial<AdminNoteSaveResult>) | null;
  if (!response.ok || !payload?.ok || !payload.placeId || !payload.updatedAt) {
    throw new Error(payload?.error || "Admin note could not be saved");
  }

  return {
    placeId: payload.placeId,
    note: payload.note ?? null,
    updatedAt: payload.updatedAt,
  };
}

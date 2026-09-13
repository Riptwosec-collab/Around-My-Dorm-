import type { WorkerEnv } from "@/worker/google-routes";

const ADMIN_NOTE_MAX_LENGTH = 500;

export type AdminNoteInput = {
  placeId?: unknown;
  note?: unknown;
};

export type AdminNoteResult = {
  placeId: string;
  note: string | null;
  updatedAt: string;
};

function normalizedInput(input: AdminNoteInput) {
  if (typeof input.placeId !== "string" || !input.placeId.trim()) {
    throw Object.assign(new Error("Place id is required"), { status: 400 });
  }
  if (input.note != null && typeof input.note !== "string") {
    throw Object.assign(new Error("Admin note must be text or null"), { status: 400 });
  }
  const note = typeof input.note === "string" ? input.note.trim() : "";
  if (note.length > ADMIN_NOTE_MAX_LENGTH) {
    throw Object.assign(new Error(`Admin note must be ${ADMIN_NOTE_MAX_LENGTH} characters or fewer`), { status: 400 });
  }
  return { placeId: input.placeId.trim(), note: note || null };
}

export async function saveAdminNote(
  env: WorkerEnv,
  accessToken: string,
  input: AdminNoteInput,
  fetchFn: typeof fetch = fetch,
): Promise<AdminNoteResult> {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
    throw Object.assign(new Error("Supabase worker access is not configured"), { status: 500 });
  }
  const normalized = normalizedInput(input);
  const response = await fetchFn(`${env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/rpc/amd_set_admin_note`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({ p_place_id: normalized.placeId, p_note: normalized.note }),
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw Object.assign(new Error("Admin note update was not authorized"), { status: response.status });
    }
    if (response.status === 404) {
      throw Object.assign(new Error("Admin note target was not found"), { status: 404 });
    }
    throw Object.assign(new Error("Admin note database update failed"), { status: response.status >= 400 && response.status < 600 ? response.status : 500 });
  }

  const payload = await response.json() as Partial<AdminNoteResult>;
  if (typeof payload.placeId !== "string" || typeof payload.updatedAt !== "string") {
    throw Object.assign(new Error("Admin note database response was invalid"), { status: 502 });
  }
  return { placeId: payload.placeId, note: typeof payload.note === "string" ? payload.note : null, updatedAt: payload.updatedAt };
}

import { supabase } from "@/lib/cloud/supabase";
import type { ReliabilityField } from "@/lib/reliability/types";
import type { Place } from "@/types/place";

export type PlaceVerificationSource = "manual_verified" | "official";
export type PlaceReportOutcome = "resolved" | "rejected" | null;

export type VerifyCanonicalPlaceFieldInput = {
  placeId: string;
  fieldName: ReliabilityField;
  newValue: Record<string, unknown> | null;
  verifyUnchanged: boolean;
  source: PlaceVerificationSource;
  sourceUrl: string | null;
  note: string | null;
  linkedReportIds: string[];
  reportOutcome: PlaceReportOutcome;
};

export type PlaceVerificationResult = {
  placeId: string;
  eventId: string;
  record: Place;
};

export type PlaceVerificationEvent = {
  id: string;
  placeId: string;
  fieldName: ReliabilityField;
  action: "verified_unchanged" | "updated_and_verified" | "rollback";
  beforeValue: unknown;
  afterValue: unknown;
  beforeMetadata: Record<string, unknown>;
  afterMetadata: Record<string, unknown>;
  source: string;
  sourceUrl: string | null;
  note: string | null;
  linkedReportIds: string[];
  verifiedBy: string;
  createdAt: string;
  rollbackOf: string | null;
  rollbackEligible: boolean;
};

function firstRow(data: unknown) {
  return Array.isArray(data) ? data[0] : data;
}

function mapResult(data: unknown): PlaceVerificationResult {
  const row = firstRow(data) as any;
  if (!row?.place_id || !row?.event_id || !row?.record) throw new Error("Place verification returned no result");
  return {
    placeId: String(row.place_id),
    eventId: String(row.event_id),
    record: row.record as Place,
  };
}

function mapHistoryRow(row: any): PlaceVerificationEvent {
  return {
    id: String(row.id),
    placeId: String(row.place_id),
    fieldName: row.field_name as ReliabilityField,
    action: row.action,
    beforeValue: row.before_value ?? null,
    afterValue: row.after_value ?? null,
    beforeMetadata: row.before_metadata && typeof row.before_metadata === "object" ? row.before_metadata : {},
    afterMetadata: row.after_metadata && typeof row.after_metadata === "object" ? row.after_metadata : {},
    source: String(row.source || ""),
    sourceUrl: typeof row.source_url === "string" ? row.source_url : null,
    note: typeof row.note === "string" ? row.note : null,
    linkedReportIds: Array.isArray(row.linked_report_ids) ? row.linked_report_ids.map(String) : [],
    verifiedBy: String(row.verified_by || ""),
    createdAt: String(row.created_at),
    rollbackOf: typeof row.rollback_of === "string" ? row.rollback_of : null,
    rollbackEligible: row.rollback_eligible === true,
  };
}

export async function verifyCanonicalPlaceField(input: VerifyCanonicalPlaceFieldInput): Promise<PlaceVerificationResult> {
  const { data, error } = await supabase.rpc("amd_admin_verify_place_field", {
    p_place_id: input.placeId,
    p_field_name: input.fieldName,
    p_new_value: input.newValue,
    p_verify_unchanged: input.verifyUnchanged,
    p_source: input.source,
    p_source_url: input.sourceUrl?.trim() || null,
    p_note: input.note?.trim() || null,
    p_linked_report_ids: input.linkedReportIds,
    p_report_outcome: input.reportOutcome,
  });
  if (error) throw error;
  return mapResult(data);
}

export async function loadPlaceVerificationHistory(placeId: string): Promise<PlaceVerificationEvent[]> {
  const { data, error } = await supabase.rpc("amd_admin_place_verification_history", { p_place_id: placeId });
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map(mapHistoryRow);
}

export async function rollbackPlaceVerification(eventId: string, note?: string | null): Promise<PlaceVerificationResult> {
  const { data, error } = await supabase.rpc("amd_admin_rollback_place_verification", {
    p_event_id: eventId,
    p_note: note?.trim() || null,
  });
  if (error) throw error;
  return mapResult(data);
}

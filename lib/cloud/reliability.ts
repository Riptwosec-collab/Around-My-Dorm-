import { supabase } from "@/lib/cloud/supabase";
import type { ReliabilityTaskState, ReliabilityTaskStateWrite, ReliabilityTaskStatus } from "@/lib/reliability/types";

const STATUSES = new Set<ReliabilityTaskStatus>(["open", "in_review", "snoozed", "done"]);

function mapReliabilityStateRow(row: any): ReliabilityTaskState {
  const status = String(row?.status) as ReliabilityTaskStatus;
  if (!STATUSES.has(status)) throw new Error("Unknown reliability task status");
  return {
    taskKey: String(row.task_key),
    taskRevision: String(row.task_revision),
    placeId: typeof row.place_id === "string" ? row.place_id : null,
    fieldName: String(row.field_name),
    status,
    snoozedUntil: typeof row.snoozed_until === "string" ? row.snoozed_until : null,
    assignedTo: typeof row.assigned_to === "string" ? row.assigned_to : null,
    lastOpenedAt: typeof row.last_opened_at === "string" ? row.last_opened_at : null,
    note: typeof row.note === "string" ? row.note : null,
    updatedAt: String(row.updated_at),
  };
}

export async function loadReliabilityTaskState(): Promise<ReliabilityTaskState[]> {
  const { data, error } = await supabase
    .from("amd_reliability_task_state")
    .select("task_key,task_revision,place_id,field_name,status,snoozed_until,assigned_to,last_opened_at,note,updated_at");
  if (error) throw error;
  return (data || []).map(mapReliabilityStateRow);
}

export async function saveReliabilityTaskState(input: ReliabilityTaskStateWrite): Promise<ReliabilityTaskState> {
  const { data, error } = await supabase.rpc("amd_admin_set_reliability_task_state", {
    p_task_key: input.taskKey,
    p_task_revision: input.taskRevision,
    p_place_id: input.placeId,
    p_field_name: input.fieldName,
    p_status: input.status,
    p_snoozed_until: input.snoozedUntil ?? null,
    p_note: input.note?.trim() || null,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Reliability task state update returned no row");
  return mapReliabilityStateRow(row);
}

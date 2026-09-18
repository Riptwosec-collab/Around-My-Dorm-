import { getAdminAccessState } from "@/lib/admin-auth";
import { ensureCloudUser, supabase } from "@/lib/cloud/supabase";

export type PlaceReportType = "closed" | "opening_hours" | "price" | "moved" | "parking" | "phone" | "location" | "other";
export type PlaceReportStatus = "pending" | "reviewed" | "resolved" | "rejected";

export type SubmitPlaceReportInput = {
  placeId: string;
  reportType: PlaceReportType;
  message?: string | null;
};

export type SubmitPlaceReportResult = {
  status: "accepted" | "duplicate" | "rate_limited";
  reportId?: string;
};

export type PlaceReportWarning = {
  reportType: PlaceReportType;
  reportCount: number;
};

export type PlaceReportRow = {
  id: string;
  placeId: string;
  reportType: PlaceReportType;
  message: string | null;
  status: PlaceReportStatus;
  duplicateCount: number;
  createdAt: string;
  reviewedAt: string | null;
  resolvedAt: string | null;
  reviewedBy: string | null;
  resolutionNote: string | null;
};

const REPORT_TYPES = new Set<PlaceReportType>(["closed", "opening_hours", "price", "moved", "parking", "phone", "location", "other"]);

function assertReportType(value: string): asserts value is PlaceReportType {
  if (!REPORT_TYPES.has(value as PlaceReportType)) throw new Error("Unsupported place report type");
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function reportingFingerprint() {
  const user = await ensureCloudUser();
  const payload = new TextEncoder().encode(`amd-report:${user.id}`);
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error("Secure reporting fingerprint is unavailable in this browser");
  }
  const digest = await crypto.subtle.digest("SHA-256", payload);
  return bytesToHex(new Uint8Array(digest));
}

export async function submitPlaceReport(input: SubmitPlaceReportInput): Promise<SubmitPlaceReportResult> {
  const placeId = input.placeId.trim();
  if (!placeId) throw new Error("Place ID is required");
  assertReportType(input.reportType);
  const message = input.message?.trim() || null;
  if ((message?.length ?? 0) > 500) throw new Error("Report message must be 500 characters or fewer");
  const fingerprint = await reportingFingerprint();
  const { data, error } = await supabase.rpc("amd_submit_place_report", {
    p_place_id: placeId,
    p_report_type: input.reportType,
    p_message: message,
    p_reporter_fingerprint: fingerprint,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  const status = row?.status;
  if (status !== "accepted" && status !== "duplicate" && status !== "rate_limited") {
    throw new Error("Unexpected report submission response");
  }
  return {
    status,
    reportId: typeof row?.report_id === "string" ? row.report_id : undefined,
  };
}

export async function loadPlaceReportWarnings(placeId: string): Promise<PlaceReportWarning[]> {
  const normalized = placeId.trim();
  if (!normalized) return [];
  await ensureCloudUser();
  const { data, error } = await supabase.rpc("amd_place_report_warning", { p_place_id: normalized });
  if (error) throw error;
  return (Array.isArray(data) ? data : []).flatMap((row: any) => {
    if (!row || typeof row.report_type !== "string" || !REPORT_TYPES.has(row.report_type as PlaceReportType)) return [];
    return [{ reportType: row.report_type as PlaceReportType, reportCount: Math.max(0, Number(row.report_count ?? 0) || 0) }];
  });
}

async function requireReportAdmin() {
  const access = await getAdminAccessState();
  if (!access.authenticated || access.anonymous || !access.admin) {
    throw new Error("Around My Dorm admin authentication is required for report review");
  }
}

function mapReportRow(row: any): PlaceReportRow {
  assertReportType(String(row.report_type));
  const status = String(row.status) as PlaceReportStatus;
  if (!["pending", "reviewed", "resolved", "rejected"].includes(status)) throw new Error("Unknown report status");
  return {
    id: String(row.id),
    placeId: String(row.place_id),
    reportType: row.report_type,
    message: typeof row.message === "string" ? row.message : null,
    status,
    duplicateCount: Math.max(0, Number(row.duplicate_count ?? 0) || 0),
    createdAt: String(row.created_at),
    reviewedAt: typeof row.reviewed_at === "string" ? row.reviewed_at : null,
    resolvedAt: typeof row.resolved_at === "string" ? row.resolved_at : null,
    reviewedBy: typeof row.reviewed_by === "string" ? row.reviewed_by : null,
    resolutionNote: typeof row.resolution_note === "string" ? row.resolution_note : null,
  };
}

export async function loadPlaceReports(): Promise<PlaceReportRow[]> {
  await requireReportAdmin();
  const { data, error } = await supabase
    .from("amd_place_reports")
    .select("id,place_id,report_type,message,status,duplicate_count,created_at,reviewed_at,resolved_at,reviewed_by,resolution_note")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapReportRow);
}

export async function transitionPlaceReport(
  reportId: string,
  status: Exclude<PlaceReportStatus, "pending">,
  resolutionNote?: string | null,
): Promise<PlaceReportRow> {
  await requireReportAdmin();
  const { data, error } = await supabase.rpc("amd_admin_transition_place_report", {
    p_report_id: reportId,
    p_status: status,
    p_resolution_note: resolutionNote?.trim() || null,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Report transition returned no row");
  return mapReportRow(row);
}

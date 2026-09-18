import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/cloud/supabase", () => ({ supabase: { rpc: mocks.rpc } }));

import {
  loadPlaceVerificationHistory,
  rollbackPlaceVerification,
  verifyCanonicalPlaceField,
} from "@/lib/cloud/place-verification";

describe("canonical place verification cloud client", () => {
  beforeEach(() => mocks.rpc.mockReset());

  it("calls the verify RPC with typed field inputs", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ place_id: "place-1", event_id: "event-1", record: { id: "place-1" } }], error: null });
    await verifyCanonicalPlaceField({
      placeId: "place-1",
      fieldName: "phone",
      newValue: { phone: "02-123-4567" },
      verifyUnchanged: false,
      source: "manual_verified",
      sourceUrl: null,
      note: "Called the shop",
      linkedReportIds: [],
      reportOutcome: null,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("amd_admin_verify_place_field", {
      p_place_id: "place-1",
      p_field_name: "phone",
      p_new_value: { phone: "02-123-4567" },
      p_verify_unchanged: false,
      p_source: "manual_verified",
      p_source_url: null,
      p_note: "Called the shop",
      p_linked_report_ids: [],
      p_report_outcome: null,
    });
  });

  it("supports verify unchanged and atomic report outcomes", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ place_id: "place-1", event_id: "event-2", record: { id: "place-1" } }], error: null });
    await verifyCanonicalPlaceField({
      placeId: "place-1",
      fieldName: "openingHours",
      newValue: null,
      verifyUnchanged: true,
      source: "official",
      sourceUrl: "https://example.com/official",
      note: null,
      linkedReportIds: ["11111111-1111-1111-1111-111111111111"],
      reportOutcome: "rejected",
    });
    expect(mocks.rpc).toHaveBeenCalledWith("amd_admin_verify_place_field", expect.objectContaining({
      p_verify_unchanged: true,
      p_source: "official",
      p_report_outcome: "rejected",
    }));
  });

  it("loads append-only history and calls rollback RPC", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: [{ id: "event-1", place_id: "place-1", field_name: "phone", action: "updated_and_verified", before_value: null, after_value: "02", before_metadata: {}, after_metadata: {}, source: "manual_verified", source_url: null, note: null, linked_report_ids: [], verified_by: "user-1", created_at: "2026-09-18T09:00:00Z", rollback_of: null, rollback_eligible: true }], error: null })
      .mockResolvedValueOnce({ data: [{ place_id: "place-1", event_id: "event-2", record: { id: "place-1" } }], error: null });

    const history = await loadPlaceVerificationHistory("place-1");
    expect(history[0]).toEqual(expect.objectContaining({ id: "event-1", rollbackEligible: true }));
    await rollbackPlaceVerification("event-1", "restore previous phone");
    expect(mocks.rpc).toHaveBeenLastCalledWith("amd_admin_rollback_place_verification", {
      p_event_id: "event-1",
      p_note: "restore previous phone",
    });
  });
});

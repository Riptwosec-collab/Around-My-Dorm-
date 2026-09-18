import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/cloud/supabase", () => ({
  supabase: { from: mocks.from, rpc: mocks.rpc },
}));

import { loadReliabilityTaskState, saveReliabilityTaskState } from "@/lib/cloud/reliability";

describe("reliability operational cloud state", () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.rpc.mockReset();
  });

  it("loads only operational state columns", async () => {
    const select = vi.fn().mockResolvedValue({
      data: [{
        task_key: "place-1:phone",
        task_revision: "rev-2",
        place_id: "place-1",
        field_name: "phone",
        status: "open",
        snoozed_until: null,
        assigned_to: null,
        last_opened_at: null,
        note: null,
        updated_at: "2026-09-18T09:00:00.000Z",
      }],
      error: null,
    });
    mocks.from.mockReturnValue({ select });

    const rows = await loadReliabilityTaskState();
    expect(mocks.from).toHaveBeenCalledWith("amd_reliability_task_state");
    expect(select).toHaveBeenCalledWith("task_key,task_revision,place_id,field_name,status,snoozed_until,assigned_to,last_opened_at,note,updated_at");
    expect(rows[0]).toEqual(expect.objectContaining({ taskKey: "place-1:phone", taskRevision: "rev-2", status: "open" }));
    expect(rows[0]).not.toHaveProperty("freshnessStatus");
    expect(rows[0]).not.toHaveProperty("priority");
  });

  it("persists snooze state through the admin RPC without freshness or priority", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{
        task_key: "place-1:phone",
        task_revision: "rev-2",
        place_id: "place-1",
        field_name: "phone",
        status: "snoozed",
        snoozed_until: "2026-09-20T09:00:00.000Z",
        assigned_to: null,
        last_opened_at: null,
        note: "Call again after weekend",
        updated_at: "2026-09-18T09:01:00.000Z",
      }],
      error: null,
    });

    await saveReliabilityTaskState({
      taskKey: "place-1:phone",
      taskRevision: "rev-2",
      placeId: "place-1",
      fieldName: "phone",
      status: "snoozed",
      snoozedUntil: "2026-09-20T09:00:00.000Z",
      note: "Call again after weekend",
    });

    expect(mocks.rpc).toHaveBeenCalledWith("amd_admin_set_reliability_task_state", {
      p_task_key: "place-1:phone",
      p_task_revision: "rev-2",
      p_place_id: "place-1",
      p_field_name: "phone",
      p_status: "snoozed",
      p_snoozed_until: "2026-09-20T09:00:00.000Z",
      p_note: "Call again after weekend",
    });
  });
});

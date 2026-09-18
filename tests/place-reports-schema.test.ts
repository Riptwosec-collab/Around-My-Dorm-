import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/place-reports.sql", "utf8");

describe("place reports schema", () => {
  it("defines the private report table and constrained enums", () => {
    expect(sql).toContain("create table if not exists public.amd_place_reports");
    expect(sql).toContain("'closed','opening_hours','price','moved','parking','phone','location','other'");
    expect(sql).toContain("'pending','reviewed','resolved','rejected'");
    expect(sql).toContain("char_length(coalesce(message, '')) <= 500");
    expect(sql).toContain("enable row level security");
  });

  it("references the canonical Around My Dorm place table", () => {
    expect(sql).toContain("references public.amd_places(id) on delete cascade");
    expect(sql).toContain("select 1 from public.amd_places where id = p_place_id");
    expect(sql).not.toContain("references public.places(id)");
    expect(sql).not.toContain("select 1 from public.places where id = p_place_id");
  });

  it("uses the production JWT admin claim instead of a missing helper function", () => {
    expect(sql).toContain("auth.jwt() -> 'app_metadata'");
    expect(sql).toContain("'amd_admin'");
    expect(sql).toContain("auth.jwt() ->> 'is_anonymous'");
    expect(sql).not.toContain("public.amd_is_admin()");
  });

  it("exposes RPC boundaries rather than public table policies", () => {
    expect(sql).toContain("amd_submit_place_report");
    expect(sql).toContain("amd_place_report_warning");
    expect(sql).toContain("amd_admin_transition_place_report");
    expect(sql).toMatch(/revoke all on table public\.amd_place_reports from (?:public,\s*)?anon/i);
    expect(sql).not.toMatch(/create policy[^;]+amd_place_reports[^;]+to anon/i);
  });

  it("enforces duplicate and rate windows and safe warning output", () => {
    expect(sql).toContain("interval '10 minutes'");
    expect(sql).toContain("interval '24 hours'");
    expect(sql).toContain("duplicate_count");
    expect(sql).toContain("returns table(report_type text, report_count bigint)");
    expect(sql).not.toMatch(/returns table\([^)]*message/i);
  });
});

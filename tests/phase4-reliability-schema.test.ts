import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/phase-4-data-reliability.sql", "utf8");

describe("Phase 4 reliability migration", () => {
  it("targets the live canonical amd_places JSONB record and defines reliability objects", () => {
    expect(sql).toContain("public.amd_places");
    expect(sql).not.toMatch(/update\s+public\.places\b/i);
    expect(sql).toContain("amd_reliability_task_state");
    expect(sql).toContain("amd_place_verification_events");
    expect(sql).toContain("amd_admin_set_reliability_task_state");
    expect(sql).toContain("amd_admin_verify_place_field");
    expect(sql).toContain("amd_admin_rollback_place_verification");
    expect(sql).toContain("amd_admin_place_verification_history");
  });

  it("uses the established non-anonymous JWT admin boundary and row locking", () => {
    expect(sql).toContain("auth.jwt() -> 'app_metadata'");
    expect(sql).toContain("amd_admin");
    expect(sql).toContain("is_anonymous");
    expect(sql).toMatch(/for\s+update/i);
    expect(sql).not.toMatch(/grant\s+execute[^;]*\bto\s+anon\b/i);
  });

  it("restricts canonical verification to approved domains and append-only audit actions", () => {
    for (const field of ["openingHours", "price", "phone", "parking", "location"]) expect(sql).toContain(`'${field}'`);
    expect(sql).toContain("verified_unchanged");
    expect(sql).toContain("updated_and_verified");
    expect(sql).toContain("rollback");
    expect(sql).toContain("fieldProvenance");
    expect(sql).toContain("lastChecked");
    expect(sql).toContain("lastUpdated");
  });

  it("does not promote whole-place verification fields from a field verify", () => {
    const verifyBody = sql.split("create or replace function public.amd_admin_verify_place_field", 2)[1]?.split("create or replace function public.amd_admin_rollback_place_verification", 1)[0] ?? "";
    expect(verifyBody).not.toMatch(/jsonb_set\([^\n]*\{verified\}/i);
    expect(verifyBody).not.toMatch(/jsonb_set\([^\n]*\{dataStatus\}/i);
    expect(verifyBody).not.toMatch(/jsonb_set\([^\n]*\{lastVerified\}/i);
  });
});

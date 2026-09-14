import fs from "node:fs";
import { describe, expect, it } from "vitest";

const storagePath = "lib/storage/place-candidates.ts";
const migrationPath = "supabase/place-candidates.sql";

describe("place candidate cloud storage policy", () => {
  it("keeps staged candidates in Supabase and never localStorage", () => {
    const source = fs.readFileSync(storagePath, "utf8");
    expect(source).toContain("amd_place_candidates");
    expect(source).not.toContain("localStorage");
  });

  it("keeps candidate persistence out of public browsing modules", () => {
    const publicFiles = [
      "components/AroundMyDormApp.tsx",
      "lib/discovery/derive-visible-places.ts",
    ];
    for (const file of publicFiles) {
      const source = fs.readFileSync(file, "utf8");
      expect(source, file).not.toContain("@/lib/storage/place-candidates");
      expect(source, file).not.toContain("amd_place_candidates");
    }
  });

  it("requires database-level Admin authorization, not only user ownership", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all on table public.amd_place_candidates from anon");
    expect(sql).toContain("public.amd_is_admin()");
    expect(sql).toContain("auth.uid() = user_id and public.amd_is_admin()");
  });

  it("centralizes the existing Admin predicate in the bootstrap schema", () => {
    const schema = fs.readFileSync("supabase/schema.sql", "utf8");
    expect(schema).toContain("create or replace function public.amd_is_admin()");
    expect(schema).toContain("not coalesce(u.is_anonymous, false)");
    expect(schema).toContain("u.raw_app_meta_data -> 'amd_admin'");
    expect(schema).toContain("lower(coalesce(u.email, '')) = 'misuki2803@gmail.com'");
    expect(schema).toContain("u.email_confirmed_at is not null");
    expect(schema).toContain("public.amd_is_admin()");
  });
});

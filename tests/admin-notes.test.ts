import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("shared Admin Notes", () => {
  const placeDetail = fs.readFileSync(path.join(process.cwd(), "components", "PlaceDetail.tsx"), "utf8");
  const placeRouteClient = fs.readFileSync(path.join(process.cwd(), "components", "PlaceRouteClient.tsx"), "utf8");
  const placeTypes = fs.readFileSync(path.join(process.cwd(), "types", "place.ts"), "utf8");
  const workerIndex = fs.readFileSync(path.join(process.cwd(), "worker", "index.ts"), "utf8");
  const sqlPath = path.join(process.cwd(), "supabase", "admin-notes.sql");

  it("renders the shared admin note without relabeling legacy verification notes", () => {
    expect(placeTypes).toContain("adminNote?: string | null");
    expect(placeTypes).toContain("adminNoteUpdatedAt?: string | null");
    expect(placeDetail).toContain("place.adminNote");
    expect(placeDetail).toContain("place.notes");
    expect(placeDetail).toContain("adminAllowed");
    expect(placeDetail).toContain("Edit Admin Note");
    expect(placeDetail).toContain("โน้ตจากผู้ดูแล");
  });

  it("resolves admin access in the runtime place route and saves through the admin API", () => {
    expect(placeRouteClient).toContain("getAdminAccessState");
    expect(placeRouteClient).toContain("saveAdminPlaceNote");
    expect(placeRouteClient).toContain("adminAllowed={adminAccess.admin}");
    expect(placeRouteClient).toContain("adminNote: result.note");
  });

  it("protects the write endpoint with the existing worker admin verifier", () => {
    expect(workerIndex).toContain('url.pathname === "/api/admin-notes"');
    expect(workerIndex).toContain("requireWorkerAdmin(request, env)");
    expect(workerIndex).toContain("saveAdminNote");
  });

  it("ships a least-privilege RPC that writes only dedicated admin note fields", () => {
    expect(fs.existsSync(sqlPath)).toBe(true);
    if (!fs.existsSync(sqlPath)) return;
    const sql = fs.readFileSync(sqlPath, "utf8");
    expect(sql).toContain("amd_set_admin_note");
    expect(sql).toContain("security definer");
    expect(sql).toContain("revoke execute");
    expect(sql).toContain("grant execute");
    expect(sql).toContain("to authenticated");
    expect(sql).toContain("record");
    expect(sql).toContain("adminNote");
    expect(sql).toContain("adminNoteUpdatedAt");
    expect(sql).not.toContain("'{notes}'");
  });
});

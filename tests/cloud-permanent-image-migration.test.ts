import fs from "node:fs";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync("supabase/cloud-permanent-images.sql", "utf8").toLowerCase();

describe("cloud permanent image migration", () => {
  it("extends the existing live image registry and creates the dedicated bucket", () => {
    expect(sql).toContain("alter table public.amd_place_images");
    for (const column of ["storage_bucket", "storage_path", "rights_basis", "mime_type", "byte_size", "is_cover", "status", "created_by", "updated_at"]) {
      expect(sql).toContain(column);
    }
    expect(sql).toContain("amd-place-images");
    expect(sql).toContain("8388608");
    for (const mime of ["image/jpeg", "image/png", "image/webp", "image/avif"]) expect(sql).toContain(mime);
  });

  it("enforces active-only public reads and admin-only writes", () => {
    expect(sql).toContain("status = 'active'");
    expect(sql).toContain("auth.jwt() -> 'app_metadata' ->> 'amd_admin'");
    expect(sql).toContain("storage.objects");
    expect(sql).toContain("amd_set_place_image_cover");
    expect(sql).toContain("is_cover = true");
  });

  it("does not add a persistent Google photo cache", () => {
    expect(sql).not.toContain("google_photo_uri");
    expect(sql).not.toContain("google_photo_name");
    expect(sql).not.toContain("google_photo_blob");
  });
});

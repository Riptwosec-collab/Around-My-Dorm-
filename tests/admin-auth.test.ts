import { describe, expect, it } from "vitest";
import { isAuthorizedAdmin } from "@/lib/admin-auth";

describe("Google maintenance admin authorization", () => {
  it("rejects missing users", () => {
    expect(isAuthorizedAdmin(null)).toBe(false);
  });

  it("rejects anonymous Supabase users even if metadata is present", () => {
    expect(isAuthorizedAdmin({ is_anonymous: true, app_metadata: { amd_admin: true } } as any)).toBe(false);
  });

  it("rejects normal users without server-controlled amd_admin metadata", () => {
    expect(isAuthorizedAdmin({ is_anonymous: false, app_metadata: {} } as any)).toBe(false);
  });

  it("accepts a non-anonymous user with app_metadata.amd_admin=true", () => {
    expect(isAuthorizedAdmin({ is_anonymous: false, app_metadata: { amd_admin: true } } as any)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { isAuthorizedAdmin } from "@/lib/admin-auth";

describe("Google maintenance admin authorization", () => {
  it("rejects missing users", () => {
    expect(isAuthorizedAdmin(null)).toBe(false);
  });

  it("rejects anonymous Supabase users even if metadata is present", () => {
    expect(isAuthorizedAdmin({ is_anonymous: true, app_metadata: { amd_admin: true } } as any)).toBe(false);
  });

  it("rejects normal users without metadata or an allowlisted confirmed email", () => {
    expect(isAuthorizedAdmin({ is_anonymous: false, app_metadata: {}, email: "other@example.com", email_confirmed_at: "2026-09-12T00:00:00Z" } as any)).toBe(false);
  });

  it("accepts a non-anonymous user with app_metadata.amd_admin=true", () => {
    expect(isAuthorizedAdmin({ is_anonymous: false, app_metadata: { amd_admin: true } } as any)).toBe(true);
  });

  it("accepts the confirmed allowlisted bootstrap admin", () => {
    expect(isAuthorizedAdmin({ is_anonymous: false, app_metadata: {}, email: "misuki2803@gmail.com", email_confirmed_at: "2026-09-12T00:00:00Z" } as any)).toBe(true);
  });

  it("rejects the allowlisted email until Supabase confirms it", () => {
    expect(isAuthorizedAdmin({ is_anonymous: false, app_metadata: {}, email: "misuki2803@gmail.com", email_confirmed_at: null } as any)).toBe(false);
  });
});

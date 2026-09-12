import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function read(file: string) {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("Admin login + cloud-only runtime", () => {
  const adminAuth = read("lib/admin-auth.ts");
  const workerAuth = read("worker/admin-auth.ts");
  const adminAccess = read("components/AdminGoogleAccess.tsx");
  const placesDb = read("lib/database/places.ts");
  const app = read("components/AroundMyDormApp.tsx");

  it("logs into the existing confirmed allowlisted admin without retrying signup", () => {
    expect(adminAuth).toContain('ADMIN_EMAIL_ALLOWLIST');
    expect(adminAuth).toContain('supabase.auth.signInWithPassword');
    expect(adminAuth).not.toContain('supabase.auth.signUp');
    expect(adminAuth).not.toContain('ADMIN_EMAIL_CONFIRMATION_REQUIRED');
    expect(adminAuth).not.toContain('112233');
    expect(adminAccess).toContain('signInAdminWithPassword');
    expect(adminAccess).not.toContain('signInOrCreateAdminWithPassword');
    expect(adminAccess).not.toContain('เข้าสู่ระบบ / เปิดใช้');
    expect(adminAccess).not.toContain('Login / Activate');
  });

  it("uses the same allowlisted email rule in browser and Worker admin authorization", () => {
    expect(adminAuth).toContain('misuki2803@gmail.com');
    expect(workerAuth).toContain('misuki2803@gmail.com');
    expect(workerAuth).toContain('email_confirmed_at');
  });

  it("never falls back to embedded place data at runtime", () => {
    expect(placesDb).not.toContain('EMBEDDED_PLACES');
    expect(placesDb).not.toContain('source: PlaceDatabaseSource = "embedded"');
    expect(placesDb).toContain('Cloud place database is empty');
    expect(app).not.toContain('useState<Place[]>(PLACES)');
    expect(app).toContain('useState<Place[]>([])');
  });
});

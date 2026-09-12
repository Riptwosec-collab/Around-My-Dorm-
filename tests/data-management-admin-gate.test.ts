import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Data Management admin login gate", () => {
  const dataManagement = fs.readFileSync(path.join(process.cwd(), "components", "DataManagement.tsx"), "utf8");
  const googleBulk = fs.readFileSync(path.join(process.cwd(), "components", "GoogleCloudAutoEnrichment.tsx"), "utf8");
  const adminAccess = fs.readFileSync(path.join(process.cwd(), "components", "AdminGoogleAccess.tsx"), "utf8");
  const adminAuth = fs.readFileSync(path.join(process.cwd(), "lib", "admin-auth.ts"), "utf8");
  const appShell = fs.readFileSync(path.join(process.cwd(), "components", "AroundMyDormApp.tsx"), "utf8");

  it("owns one centralized Supabase admin login at the Data Management boundary", () => {
    expect(dataManagement).toContain('import { AdminGoogleAccess } from "@/components/AdminGoogleAccess";');
    expect(dataManagement).toContain('import type { AdminAccessState } from "@/lib/admin-auth";');
    expect(dataManagement).toContain('<AdminGoogleAccess language={language} onStateChange={setAdminAccess} />');
    expect(dataManagement).toContain('adminAccess.admin');
    expect(dataManagement).toContain('data-testid="data-management-admin-locked"');
  });

  it("shows a direct Admin Login entry in Settings instead of hiding login only behind Data Management", () => {
    expect(appShell).toContain('data-testid="settings-admin-login"');
    expect(appShell).toContain('Admin Login');
    expect(appShell).toContain('setDataManagementOpen(true)');
  });

  it("reacts to Supabase auth changes so the database gate opens immediately after login", () => {
    expect(adminAccess).toContain('supabase.auth.onAuthStateChange');
  });

  it("uses the preset admin-email dropdown with direct password login and no client-side signup fallback", () => {
    expect(adminAccess).toContain('ADMIN_EMAIL_ALLOWLIST');
    expect(adminAccess).toContain('<select');
    expect(adminAccess).toContain('type="password"');
    expect(adminAccess).toContain('signInAdminWithPassword');
    expect(adminAuth).toContain('supabase.auth.signInWithPassword');
    expect(adminAuth).not.toContain('supabase.auth.signUp');
    expect(adminAccess).not.toContain('112233');
    expect(adminAuth).not.toContain('112233');
  });

  it("passes the verified admin session to cost-bearing Google tools instead of rendering a second login", () => {
    expect(dataManagement).toContain('adminAccess={adminAccess}');
    expect(dataManagement).toContain('adminAllowed={adminAccess.admin}');
    expect(googleBulk).not.toContain('import { AdminGoogleAccess } from "@/components/AdminGoogleAccess";');
    expect(googleBulk).not.toContain('<AdminGoogleAccess');
  });
});

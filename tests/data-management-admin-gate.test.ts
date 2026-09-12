import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Data Management admin login gate", () => {
  const dataManagement = fs.readFileSync(path.join(process.cwd(), "components", "DataManagement.tsx"), "utf8");
  const googleBulk = fs.readFileSync(path.join(process.cwd(), "components", "GoogleCloudAutoEnrichment.tsx"), "utf8");
  const adminAccess = fs.readFileSync(path.join(process.cwd(), "components", "AdminGoogleAccess.tsx"), "utf8");

  it("owns one centralized Supabase admin login at the Data Management boundary", () => {
    expect(dataManagement).toContain('import { AdminGoogleAccess } from "@/components/AdminGoogleAccess";');
    expect(dataManagement).toContain('type AdminAccessState');
    expect(dataManagement).toContain('<AdminGoogleAccess language={language} onStateChange={setAdminAccess} />');
    expect(dataManagement).toContain('adminAccess.admin');
    expect(dataManagement).toContain('data-testid="data-management-admin-locked"');
  });

  it("reacts to Supabase auth changes so the database gate opens immediately after login", () => {
    expect(adminAccess).toContain('supabase.auth.onAuthStateChange');
  });

  it("passes the verified admin session to cost-bearing Google tools instead of rendering a second login", () => {
    expect(dataManagement).toContain('adminAccess={adminAccess}');
    expect(dataManagement).toContain('adminAllowed={adminAccess.admin}');
    expect(googleBulk).not.toContain('import { AdminGoogleAccess } from "@/components/AdminGoogleAccess";');
    expect(googleBulk).not.toContain('<AdminGoogleAccess');
  });
});

import type { User } from "@supabase/supabase-js";
import { resetCloudUserPromise, supabase } from "@/lib/cloud/supabase";

export const ADMIN_EMAIL_ALLOWLIST = ["misuki2803@gmail.com"] as const;

export type AdminAccessState = {
  authenticated: boolean;
  admin: boolean;
  anonymous: boolean;
  email: string | null;
};

function normalizedEmail(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

export function isAllowlistedAdminEmail(email: string | null | undefined): boolean {
  const normalized = normalizedEmail(email);
  return ADMIN_EMAIL_ALLOWLIST.some((candidate) => candidate === normalized);
}

function hasConfirmedEmail(user: User): boolean {
  const legacyConfirmedAt = (user as User & { confirmed_at?: string | null }).confirmed_at;
  return Boolean(user.email_confirmed_at || legacyConfirmedAt);
}

export function isAuthorizedAdmin(user: User | null): boolean {
  if (!user || user.is_anonymous) return false;
  if (user.app_metadata?.amd_admin === true) return true;
  return isAllowlistedAdminEmail(user.email) && hasConfirmedEmail(user);
}

export async function getAdminAccessState(): Promise<AdminAccessState> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const user = data.session?.user ?? null;
  return {
    authenticated: Boolean(user && !user.is_anonymous),
    admin: isAuthorizedAdmin(user),
    anonymous: Boolean(user?.is_anonymous),
    email: user?.email ?? null,
  };
}

export async function requireAdminSessionToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const session = data.session;
  if (!session?.access_token || !isAuthorizedAdmin(session.user)) {
    throw new Error("Admin authentication is required for this Google maintenance operation");
  }
  return session.access_token;
}

function accessState(user: User, fallbackEmail: string): AdminAccessState {
  return {
    authenticated: true,
    admin: true,
    anonymous: false,
    email: user.email ?? fallbackEmail,
  };
}

async function finalizeAdminUser(user: User | null, fallbackEmail: string): Promise<AdminAccessState> {
  if (!user || !isAuthorizedAdmin(user)) {
    await supabase.auth.signOut();
    resetCloudUserPromise();
    throw new Error("This Supabase account is not authorized as an Around My Dorm admin");
  }
  resetCloudUserPromise();
  return accessState(user, fallbackEmail);
}

export async function signInAdminWithPassword(email: string, password: string): Promise<AdminAccessState> {
  const normalized = normalizedEmail(email);
  if (!normalized || !normalized.includes("@")) throw new Error("Select a valid admin email address");
  if (!isAllowlistedAdminEmail(normalized)) throw new Error("This email is not in the Around My Dorm admin allowlist");
  if (!password) throw new Error("Enter the admin password");

  const { data, error } = await supabase.auth.signInWithPassword({ email: normalized, password });
  if (error) throw error;
  return finalizeAdminUser(data.user, normalized);
}

export async function requestAdminMagicLink(email: string): Promise<void> {
  const normalized = normalizedEmail(email);
  if (!normalized || !normalized.includes("@")) throw new Error("Enter a valid admin email address");
  if (!isAllowlistedAdminEmail(normalized)) throw new Error("This email is not in the Around My Dorm admin allowlist");
  const { error } = await supabase.auth.signInWithOtp({
    email: normalized,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
    },
  });
  if (error) throw error;
}

export async function signOutAdmin(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  resetCloudUserPromise();
}

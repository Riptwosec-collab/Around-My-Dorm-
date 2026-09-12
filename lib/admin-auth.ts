import type { User } from "@supabase/supabase-js";
import { resetCloudUserPromise, supabase } from "@/lib/cloud/supabase";

export type AdminAccessState = {
  authenticated: boolean;
  admin: boolean;
  anonymous: boolean;
  email: string | null;
};

export function isAuthorizedAdmin(user: User | null): boolean {
  if (!user || user.is_anonymous) return false;
  return user.app_metadata?.amd_admin === true;
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

export async function requestAdminMagicLink(email: string): Promise<void> {
  const normalized = email.trim();
  if (!normalized || !normalized.includes("@")) throw new Error("Enter a valid admin email address");
  const { error } = await supabase.auth.signInWithOtp({
    email: normalized,
    options: {
      shouldCreateUser: true,
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

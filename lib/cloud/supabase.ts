import { createClient, type User } from "@supabase/supabase-js";

const FALLBACK_SUPABASE_URL = "https://gfqkexnqbjtuwsyqacsw.supabase.co";
const FALLBACK_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_jsDnGIrAjuf0b9w9Hy1z8g_u9SXAfht";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_SUPABASE_URL;
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_SUPABASE_PUBLISHABLE_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: "amd-supabase-auth-session-v1",
  },
});

let cloudUserPromise: Promise<User> | null = null;

export function ensureCloudUser(): Promise<User> {
  if (cloudUserPromise) return cloudUserPromise;
  cloudUserPromise = (async () => {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (sessionData.session?.user) return sessionData.session.user;
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error || !data.user) {
      cloudUserPromise = null;
      throw error || new Error("Cloud session could not be created");
    }
    return data.user;
  })();
  return cloudUserPromise;
}

export function cloudOnlyPersistenceNote() {
  return "Application data is persisted in Supabase only. The browser keeps only the Supabase authentication session and transient PWA/runtime caches.";
}

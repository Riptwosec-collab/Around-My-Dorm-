import type { WorkerEnv } from "@/worker/google-routes";

export type WorkerAdminUser = {
  id: string;
  email: string | null;
  is_anonymous?: boolean;
  app_metadata?: Record<string, unknown>;
};

export function bearerToken(request: Request): string | null {
  const value = request.headers.get("authorization") || "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function requireWorkerAdmin(
  request: Request,
  env: WorkerEnv,
  fetchFn: typeof fetch = fetch,
): Promise<WorkerAdminUser> {
  const token = bearerToken(request);
  if (!token) throw Object.assign(new Error("Admin bearer token is required"), { status: 401 });
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) throw Object.assign(new Error("Supabase worker auth is not configured"), { status: 500 });

  const response = await fetchFn(`${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) throw Object.assign(new Error("Invalid admin session"), { status: 401 });

  const user = await response.json() as WorkerAdminUser;
  const authorized = Boolean(
    user?.id &&
      !user.is_anonymous &&
      user.app_metadata?.amd_admin === true,
  );
  if (!authorized) throw Object.assign(new Error("This account is not authorized for Google maintenance"), { status: 403 });
  return user;
}

import { describe, expect, it, vi } from "vitest";
import { handleRequest } from "@/worker/index";
import { computeRouteMatrix } from "@/worker/google-routes";

function env(overrides: Record<string, unknown> = {}) {
  return {
    ASSETS: { fetch: vi.fn(async () => new Response("asset", { status: 200 })) },
    GOOGLE_MAPS_SERVER_API_KEY: "server-secret-key",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "publishable-key",
    ...overrides,
  } as any;
}

describe("Cloudflare Routes worker", () => {
  it("serves static assets for non-API requests", async () => {
    const runtime = env();
    const response = await handleRequest(new Request("https://app.test/map/"), runtime);
    expect(await response.text()).toBe("asset");
    expect(runtime.ASSETS.fetch).toHaveBeenCalledOnce();
  });

  it("returns 401 for route refresh without bearer token", async () => {
    const response = await handleRequest(new Request("https://app.test/api/routes/refresh", { method: "POST" }), env());
    expect(response.status).toBe(401);
  });

  it("never exposes the server API key in Google error responses", async () => {
    const fakeFetch = vi.fn(async () => new Response(JSON.stringify({ error: { message: "bad key server-secret-key" } }), { status: 403 }));
    await expect(computeRouteMatrix(env(), {
      origin: { latitude: 13.82, longitude: 100.58 },
      destinations: [{ id: "p1", latitude: 13.83, longitude: 100.59 }],
      mode: "DRIVE",
    }, fakeFetch as any)).rejects.not.toThrow(/server-secret-key/);
  });
});

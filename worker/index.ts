import { requireWorkerAdmin } from "@/worker/admin-auth";
import { computeRouteMatrix, type RouteMatrixInput, type WorkerEnv } from "@/worker/google-routes";

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function safeMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Worker request failed";
  return message.replace(/AIza[0-9A-Za-z_-]{20,}/g, "[REDACTED]").replace(/server-secret-key/gi, "[REDACTED]").slice(0, 500);
}

function errorStatus(error: unknown) {
  const status = Number((error as any)?.status);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
}

export async function handleRequest(request: Request, env: WorkerEnv): Promise<Response> {
  const url = new URL(request.url);

  if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

  if (url.pathname === "/api/health" && request.method === "GET") {
    return json({ ok: true, routesConfigured: Boolean(env.GOOGLE_MAPS_SERVER_API_KEY) });
  }

  if (url.pathname === "/api/routes/refresh" && request.method === "POST") {
    try {
      await requireWorkerAdmin(request, env);
      const input = await request.json() as RouteMatrixInput;
      const results = await computeRouteMatrix(env, input);
      return json({ ok: true, results, generatedAt: new Date().toISOString() });
    } catch (error) {
      return json({ ok: false, error: safeMessage(error) }, errorStatus(error));
    }
  }

  return json({ ok: false, error: "API route not found" }, 404);
}

export default {
  fetch(request: Request, env: WorkerEnv) {
    return handleRequest(request, env);
  },
};

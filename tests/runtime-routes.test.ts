import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Place } from "@/types/place";
import { saveGoogleApiControlSettings } from "@/lib/google-api-control";

const recordTrackedGoogleRequest = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/google-api-budget", () => ({ recordTrackedGoogleRequest }));

import {
  RouteRuntimeError,
  calculateRoute,
  getCachedRoute,
  resetRuntimeRoutesForTests,
} from "@/lib/routes/runtime-routes";

const place = {
  id: "place-1",
  name: "Test Place",
  googlePlaceId: "google-place-1",
  latitude: 13.82,
  longitude: 100.59,
} as Place;

function routeResponse(distanceMeters = 850, duration = "420s") {
  return new Response(JSON.stringify({ routes: [{ distanceMeters, duration }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("runtime routes", () => {
  beforeEach(() => {
    resetRuntimeRoutesForTests();
    recordTrackedGoogleRequest.mockClear();
    saveGoogleApiControlSettings({ locked: false });
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-key");
  });

  it("makes one explicit request with the selected Google travel mode", async () => {
    const fetchMock = vi.fn().mockResolvedValue(routeResponse());
    const result = await calculateRoute(place, "walking", { fetchImpl: fetchMock as typeof fetch });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(body.travelMode).toBe("WALK");
    expect(body.origin.location.latLng).toEqual({ latitude: 13.81972, longitude: 100.58475 });
    expect(body.destination.location.latLng).toEqual({ latitude: 13.82, longitude: 100.59 });
    expect(result).toMatchObject({ mode: "walking", distanceMeters: 850, durationSeconds: 420, provider: "google_routes" });
    expect(recordTrackedGoogleRequest).toHaveBeenCalledWith(expect.objectContaining({ requestType: "routes", status: "success", resultCode: "route_loaded" }));
  });

  it.each([
    ["walking", "WALK"],
    ["motorcycle", "TWO_WHEELER"],
    ["driving", "DRIVE"],
  ] as const)("maps %s to %s", async (mode, googleMode) => {
    const fetchMock = vi.fn().mockResolvedValue(routeResponse());
    await calculateRoute(place, mode, { fetchImpl: fetchMock as typeof fetch });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.travelMode).toBe(googleMode);
  });

  it("reuses the session cache for the same place and mode", async () => {
    const fetchMock = vi.fn().mockResolvedValue(routeResponse());
    const first = await calculateRoute(place, "walking", { fetchImpl: fetchMock as typeof fetch });
    const second = await calculateRoute(place, "walking", { fetchImpl: fetchMock as typeof fetch });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
    expect(getCachedRoute(place.id, "walking")).toEqual(first);
  });

  it("force refresh bypasses the session cache", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(routeResponse(850, "420s"))
      .mockResolvedValueOnce(routeResponse(900, "480s"));

    await calculateRoute(place, "driving", { fetchImpl: fetchMock as typeof fetch });
    const refreshed = await calculateRoute(place, "driving", { force: true, fetchImpl: fetchMock as typeof fetch });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(refreshed.distanceMeters).toBe(900);
    expect(refreshed.durationSeconds).toBe(480);
  });

  it("fails before a provider request when destination coordinates are missing", async () => {
    const fetchMock = vi.fn();
    const missing = { ...place, latitude: null } as Place;

    await expect(calculateRoute(missing, "walking", { fetchImpl: fetchMock as typeof fetch })).rejects.toMatchObject({ code: "missing_coordinates" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(recordTrackedGoogleRequest).not.toHaveBeenCalled();
  });

  it("returns no_route without inventing a duration when Google returns no route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ routes: [] }), { status: 200 }));

    await expect(calculateRoute(place, "motorcycle", { fetchImpl: fetchMock as typeof fetch })).rejects.toMatchObject({ code: "no_route" });
    expect(getCachedRoute(place.id, "motorcycle")).toBeNull();
    expect(recordTrackedGoogleRequest).toHaveBeenCalledWith(expect.objectContaining({ requestType: "routes", status: "failed", resultCode: "no_route" }));
  });

  it("fails closed when Google network requests are locked", async () => {
    saveGoogleApiControlSettings({ locked: true });
    const fetchMock = vi.fn();

    await expect(calculateRoute(place, "driving", { fetchImpl: fetchMock as typeof fetch })).rejects.toBeInstanceOf(RouteRuntimeError);
    await expect(calculateRoute(place, "driving", { fetchImpl: fetchMock as typeof fetch })).rejects.toMatchObject({ code: "api_locked" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not infer minutes from straight-line distance on provider failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("boom", { status: 500 }));
    const withLocalDistance = { ...place, distanceKm: 0.2, straightLineDistanceKm: 0.2 } as Place;

    await expect(calculateRoute(withLocalDistance, "walking", { fetchImpl: fetchMock as typeof fetch })).rejects.toMatchObject({ code: "provider_error" });
    expect(getCachedRoute(place.id, "walking")).toBeNull();
  });
});

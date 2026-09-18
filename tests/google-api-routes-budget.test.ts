import { describe, expect, it } from "vitest";
import { recordTrackedGoogleRequest } from "@/lib/google-api-budget";

describe("Google API route request tracking", () => {
  it("accepts a successful routes request with a route result code", async () => {
    await expect(recordTrackedGoogleRequest({
      requestType: "routes",
      status: "success",
      resultCode: "route_loaded",
      placeId: "p1",
      attempted: 1,
    })).resolves.toBeUndefined();
  });

  it("accepts no-route and failed route result codes", async () => {
    await expect(recordTrackedGoogleRequest({
      requestType: "routes",
      status: "failed",
      resultCode: "no_route",
      placeId: "p1",
    })).resolves.toBeUndefined();

    await expect(recordTrackedGoogleRequest({
      requestType: "routes",
      status: "failed",
      resultCode: "failed",
      placeId: "p1",
    })).resolves.toBeUndefined();
  });
});

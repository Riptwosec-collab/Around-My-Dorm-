import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PLACES } from "@/data/places";
import { usePlaceDatabase } from "@/components/app-shell/usePlaceDatabase";

const seed = PLACES[0]!;

describe("usePlaceDatabase", () => {
  it("loads once, exposes warning state and supports explicit reload", async () => {
    const loader = vi.fn()
      .mockResolvedValueOnce({ places: [seed], source: "supabase", loadedAt: "2026-09-13T00:00:00Z", warning: "route cache unavailable" })
      .mockResolvedValueOnce({ places: [{ ...seed, id: "reloaded" }], source: "supabase", loadedAt: "2026-09-13T00:01:00Z", warning: null });

    const { result } = renderHook(() => usePlaceDatabase({ loader }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(loader).toHaveBeenCalledTimes(1);
    expect(result.current.places).toHaveLength(1);
    expect(result.current.warning).toBe("route cache unavailable");

    await act(async () => result.current.reload());
    expect(loader).toHaveBeenCalledTimes(2);
    expect(result.current.places[0]?.id).toBe("reloaded");
  });

  it("reports loader failure without fabricating fallback places", async () => {
    const loader = vi.fn().mockRejectedValue(new Error("Cloud database unavailable"));
    const { result } = renderHook(() => usePlaceDatabase({ loader }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.places).toEqual([]);
    expect(result.current.error).toContain("Cloud database unavailable");
  });
});

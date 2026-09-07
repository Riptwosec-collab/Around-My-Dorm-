import { describe, expect, it } from "vitest";
import { haversineKm } from "@/lib/place-utils";
describe("haversineKm", () => { it("returns zero for identical points", () => expect(haversineKm({lat:13.8,lng:100.5},{lat:13.8,lng:100.5})).toBe(0)); it("returns a positive distance", () => expect(haversineKm({lat:13.8,lng:100.5},{lat:13.81,lng:100.51})).toBeGreaterThan(1)); });

export type MapPoint = { lat: number; lng: number };
export type MapBounds = { north: number; south: number; east: number; west: number };
export type MapViewport = { center: MapPoint; bounds: MapBounds | null };

export function validMapBounds(value: MapBounds | null | undefined): value is MapBounds {
  if (!value) return false;
  return [value.north, value.south, value.east, value.west].every(Number.isFinite)
    && value.north >= value.south
    && value.north <= 90
    && value.south >= -90
    && value.east <= 180
    && value.east >= -180
    && value.west <= 180
    && value.west >= -180;
}

export function pointInMapBounds(point: MapPoint, bounds: MapBounds | null | undefined) {
  if (!validMapBounds(bounds) || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return false;
  if (point.lat < bounds.south || point.lat > bounds.north) return false;
  // Google Maps can express a viewport crossing the antimeridian as west > east.
  if (bounds.west <= bounds.east) return point.lng >= bounds.west && point.lng <= bounds.east;
  return point.lng >= bounds.west || point.lng <= bounds.east;
}

export function movedFromCenter(a: MapPoint, b: MapPoint, epsilon = 0.0008) {
  return Math.abs(a.lat - b.lat) > epsilon || Math.abs(a.lng - b.lng) > epsilon;
}

export function viewportLabel(bounds: MapBounds | null, language: "th" | "en") {
  if (!validMapBounds(bounds)) return language === "en" ? "Radius mode" : "โหมดรัศมี";
  return language === "en" ? "Visible map area" : "พื้นที่ที่เห็นบนแผนที่";
}

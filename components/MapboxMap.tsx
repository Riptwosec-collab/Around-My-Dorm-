"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Place } from "@/types/place";

type Point = { lat: number; lng: number };

type Props = {
  token: string;
  places: Place[];
  origin: Point;
  radiusMeters: number;
  selectedPlace: Place | null;
  center: Point;
  onSelectPlace: (place: Place) => void;
  onMoveEnd: (center: Point) => void;
  onStateChange?: (state: "loading" | "ready" | "error") => void;
};

const CATEGORY_COLORS: Record<string, string> = {
  food: "#ff9d3c",
  local_food: "#ff9d3c",
  noodle: "#ff9d3c",
  thai_food: "#ff9d3c",
  isan_food: "#ff8a3d",
  mookata: "#ff7043",
  japanese: "#f0f4ff",
  korean_food: "#ff875e",
  vietnamese_food: "#66dfbd",
  hotpot: "#ff7f50",
  bbq: "#ff7043",
  chinese_food: "#f59e0b",
  night_food: "#9b6cff",
  cafe: "#e8eef8",
  bar: "#9b6cff",
  convenience: "#8f6cff",
  supermarket: "#8f6cff",
  shopping: "#8f6cff",
  pharmacy: "#00e5c3",
  clinic: "#00d9ff",
  laundry: "#00d9ff",
  barber: "#00d9ff",
  salon: "#9b6cff",
  fitness: "#149cff",
  parking: "#007aff",
  monthly_parking: "#007aff",
  service: "#8ca0bb",
  other: "#8ca0bb",
};

function circlePolygon(center: Point, radiusMeters: number, steps = 72) {
  const earth = 6_378_137;
  const lat = (center.lat * Math.PI) / 180;
  const lng = (center.lng * Math.PI) / 180;
  const angular = radiusMeters / earth;
  const coordinates: number[][] = [];
  for (let index = 0; index <= steps; index += 1) {
    const bearing = (index / steps) * Math.PI * 2;
    const lat2 = Math.asin(Math.sin(lat) * Math.cos(angular) + Math.cos(lat) * Math.sin(angular) * Math.cos(bearing));
    const lng2 = lng + Math.atan2(Math.sin(bearing) * Math.sin(angular) * Math.cos(lat), Math.cos(angular) - Math.sin(lat) * Math.sin(lat2));
    coordinates.push([(lng2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
  }
  return {
    type: "Feature" as const,
    properties: {},
    geometry: { type: "Polygon" as const, coordinates: [coordinates] },
  };
}

export function MapboxMap({ token, places, origin, radiusMeters, selectedPlace, center, onSelectPlace, onMoveEnd, onStateChange }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const mapboxRef = useRef<any>(null);
  const loadedRef = useRef(false);
  const placesRef = useRef(places);
  const onSelectRef = useRef(onSelectPlace);
  const onMoveEndRef = useRef(onMoveEnd);

  placesRef.current = places;
  onSelectRef.current = onSelectPlace;
  onMoveEndRef.current = onMoveEnd;

  const geojson = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: places
      .filter((place) => place.latitude != null && place.longitude != null)
      .map((place) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [place.longitude as number, place.latitude as number] },
        properties: {
          id: place.id,
          category: place.category,
          name: place.name,
          color: CATEGORY_COLORS[place.category] || CATEGORY_COLORS.other,
        },
      })),
  }), [places]);

  useEffect(() => {
    if (!token || !containerRef.current) return;
    let cancelled = false;
    onStateChange?.("loading");

    void import("mapbox-gl")
      .then((module) => {
        if (cancelled || !containerRef.current) return;
        const mapboxgl = module.default;
        mapboxRef.current = mapboxgl;
        mapboxgl.accessToken = token;
        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: "mapbox://styles/mapbox/dark-v11",
          center: [center.lng, center.lat],
          zoom: radiusMeters <= 500 ? 15.7 : radiusMeters <= 1000 ? 14.8 : radiusMeters <= 3000 ? 13.8 : 12.8,
          attributionControl: true,
          logoPosition: "bottom-left",
          cooperativeGestures: false,
        });
        mapRef.current = map;

        map.on("load", () => {
          loadedRef.current = true;
          map.addSource("amd-places", { type: "geojson", data: geojson as any, cluster: true, clusterRadius: 46, clusterMaxZoom: 14 });
          map.addLayer({ id: "amd-clusters", type: "circle", source: "amd-places", filter: ["has", "point_count"], paint: { "circle-color": "#061424", "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 30, 24], "circle-stroke-color": "#008CFF", "circle-stroke-width": 2, "circle-opacity": 0.96 } });
          map.addLayer({ id: "amd-cluster-count", type: "symbol", source: "amd-places", filter: ["has", "point_count"], layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 11 }, paint: { "text-color": "#F7F9FC" } });
          map.addLayer({ id: "amd-points", type: "circle", source: "amd-places", filter: ["!", ["has", "point_count"]], paint: { "circle-color": ["get", "color"], "circle-radius": 7, "circle-stroke-color": "#d8e4f5", "circle-stroke-width": 2, "circle-opacity": 0.98 } });
          map.addLayer({ id: "amd-selected", type: "circle", source: "amd-places", filter: ["==", ["get", "id"], "__none__"], paint: { "circle-color": "#ffffff", "circle-radius": 11, "circle-stroke-color": "#00D9FF", "circle-stroke-width": 3, "circle-blur": 0.06 } });

          map.addSource("amd-radius", { type: "geojson", data: circlePolygon(origin, radiusMeters) as any });
          map.addLayer({ id: "amd-radius-fill", type: "fill", source: "amd-radius", paint: { "fill-color": "#007AFF", "fill-opacity": 0.055 } });
          map.addLayer({ id: "amd-radius-line", type: "line", source: "amd-radius", paint: { "line-color": "#00D9FF", "line-opacity": 0.36, "line-width": 1.2 } });

          map.addSource("amd-home", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [origin.lng, origin.lat] } } as any });
          map.addLayer({ id: "amd-home-glow", type: "circle", source: "amd-home", paint: { "circle-radius": 15, "circle-color": "#007AFF", "circle-opacity": 0.18, "circle-blur": 0.4 } });
          map.addLayer({ id: "amd-home", type: "circle", source: "amd-home", paint: { "circle-radius": 8, "circle-color": "#007AFF", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2.4 } });

          map.addSource("amd-route", { type: "geojson", data: { type: "FeatureCollection", features: [] } as any });
          map.addLayer({ id: "amd-route", type: "line", source: "amd-route", paint: { "line-color": "#00D9FF", "line-opacity": 0.74, "line-width": 2, "line-dasharray": [1.2, 2.2] } });

          map.on("click", "amd-points", (event: any) => {
            const id = event.features?.[0]?.properties?.id;
            const place = placesRef.current.find((item) => item.id === id);
            if (place) onSelectRef.current(place);
          });
          map.on("click", "amd-clusters", (event: any) => {
            const feature = event.features?.[0];
            if (!feature?.geometry || feature.geometry.type !== "Point") return;
            map.easeTo({ center: feature.geometry.coordinates as [number, number], zoom: Math.min((map.getZoom() || 13) + 2, 17), duration: 450 });
          });
          for (const layer of ["amd-points", "amd-clusters"]) {
            map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
            map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
          }
          map.on("moveend", () => {
            const next = map.getCenter();
            onMoveEndRef.current({ lat: next.lat, lng: next.lng });
          });
          onStateChange?.("ready");
        });
        map.on("error", () => onStateChange?.("error"));
      })
      .catch(() => onStateChange?.("error"));

    return () => {
      cancelled = true;
      loadedRef.current = false;
      mapRef.current?.remove?.();
      mapRef.current = null;
    };
  }, [token]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    (map.getSource("amd-places") as any)?.setData(geojson);
  }, [geojson]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    (map.getSource("amd-radius") as any)?.setData(circlePolygon(origin, radiusMeters));
    (map.getSource("amd-home") as any)?.setData({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [origin.lng, origin.lat] } });
  }, [origin, radiusMeters]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const id = selectedPlace?.id || "__none__";
    map.setFilter("amd-selected", ["==", ["get", "id"], id]);
    const routeSource = map.getSource("amd-route") as any;
    if (selectedPlace?.latitude != null && selectedPlace.longitude != null) {
      routeSource?.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[origin.lng, origin.lat], [selectedPlace.longitude, selectedPlace.latitude]] } });
      map.easeTo({ center: [selectedPlace.longitude, selectedPlace.latitude], zoom: Math.max(map.getZoom(), 16), duration: 450 });
    } else {
      routeSource?.setData({ type: "FeatureCollection", features: [] });
    }
  }, [selectedPlace, origin]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current || selectedPlace) return;
    map.easeTo({ center: [center.lng, center.lat], duration: 350 });
  }, [center, selectedPlace]);

  return <div ref={containerRef} className="absolute inset-0 bg-[#02060D]" aria-label="Around My Dorm Mapbox map" />;
}

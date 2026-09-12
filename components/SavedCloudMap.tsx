"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Cloud, Home, LoaderCircle, MapPin } from "lucide-react";
import type { Place } from "@/types/place";

type Point = { lat: number; lng: number };
type CloudMapState = "idle" | "loading" | "ready" | "error";

const MAPLIBRE_JS = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js";
const MAPLIBRE_CSS = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css";
const OSM_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
let mapLibrePromise: Promise<any> | null = null;

function loadMapLibre(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("Map is only available in the browser"));
  const existing = (window as any).maplibregl;
  if (existing) return Promise.resolve(existing);
  if (mapLibrePromise) return mapLibrePromise;

  mapLibrePromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${MAPLIBRE_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = MAPLIBRE_CSS;
      document.head.appendChild(link);
    }

    const prior = document.querySelector(`script[src="${MAPLIBRE_JS}"]`) as HTMLScriptElement | null;
    const script = prior || document.createElement("script");
    const done = () => {
      const lib = (window as any).maplibregl;
      if (lib) resolve(lib);
      else reject(new Error("MapLibre loaded without a global map object"));
    };
    const failed = () => reject(new Error("Could not load the saved cloud map library"));
    script.addEventListener("load", done, { once: true });
    script.addEventListener("error", failed, { once: true });
    if (!prior) {
      script.src = MAPLIBRE_JS;
      script.async = true;
      script.crossOrigin = "anonymous";
      document.head.appendChild(script);
    }
  }).catch((error) => {
    mapLibrePromise = null;
    throw error;
  });

  return mapLibrePromise;
}

function categoryColor(place: Place): string {
  if (place.categories.includes("cafe")) return "#8B5CF6";
  if (place.categories.includes("parking") || place.categories.includes("monthly_parking")) return "#22C55E";
  if (place.categories.includes("service")) return "#06B6D4";
  if (place.categories.includes("food")) return "#F97316";
  return "#149CFF";
}

function placeFeatureCollection(places: Place[], selectedPlace: Place | null) {
  return {
    type: "FeatureCollection",
    features: places
      .filter((place) => Number.isFinite(place.latitude) && Number.isFinite(place.longitude))
      .map((place) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [place.longitude, place.latitude] },
        properties: {
          id: place.id,
          name: place.name,
          color: categoryColor(place),
          selected: selectedPlace?.id === place.id ? 1 : 0,
        },
      })),
  };
}

function circleFeature(center: Point, radiusMeters: number) {
  const earthRadius = 6378137;
  const lat = center.lat * Math.PI / 180;
  const lng = center.lng * Math.PI / 180;
  const angular = radiusMeters / earthRadius;
  const coordinates: number[][] = [];
  for (let index = 0; index <= 72; index += 1) {
    const bearing = index / 72 * Math.PI * 2;
    const nextLat = Math.asin(Math.sin(lat) * Math.cos(angular) + Math.cos(lat) * Math.sin(angular) * Math.cos(bearing));
    const nextLng = lng + Math.atan2(Math.sin(bearing) * Math.sin(angular) * Math.cos(lat), Math.cos(angular) - Math.sin(lat) * Math.sin(nextLat));
    coordinates.push([nextLng * 180 / Math.PI, nextLat * 180 / Math.PI]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [coordinates] } };
}

export function SavedCloudMap({
  active,
  places,
  origin,
  radiusMeters,
  selectedPlace,
  center,
  language,
  onSelectPlace,
  onMoveEnd,
  onStateChange,
}: {
  active: boolean;
  places: Place[];
  origin: Point;
  radiusMeters: number;
  selectedPlace: Place | null;
  center: Point;
  language: "th" | "en";
  onSelectPlace: (place: Place) => void;
  onMoveEnd: (center: Point) => void;
  onStateChange?: (state: CloudMapState) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const homeMarkerRef = useRef<any>(null);
  const placesRef = useRef(places);
  const onSelectRef = useRef(onSelectPlace);
  const onMoveEndRef = useRef(onMoveEnd);
  const [state, setState] = useState<CloudMapState>("idle");
  const [error, setError] = useState<string | null>(null);
  const coordinatePlaces = useMemo(() => places.filter((place) => Number.isFinite(place.latitude) && Number.isFinite(place.longitude)), [places]);

  useEffect(() => { placesRef.current = places; }, [places]);
  useEffect(() => { onSelectRef.current = onSelectPlace; }, [onSelectPlace]);
  useEffect(() => { onMoveEndRef.current = onMoveEnd; }, [onMoveEnd]);

  useEffect(() => {
    if (!active || !containerRef.current || mapRef.current) return;
    let disposed = false;
    setState("loading");
    setError(null);
    onStateChange?.("loading");

    void loadMapLibre().then((maplibregl) => {
      if (disposed || !containerRef.current) return;
      const map = new maplibregl.Map({
        container: containerRef.current,
        center: [center.lng, center.lat],
        zoom: 15,
        attributionControl: true,
        style: {
          version: 8,
          sources: {
            osm: {
              type: "raster",
              tiles: [OSM_TILES],
              tileSize: 256,
              attribution: "© OpenStreetMap contributors",
            },
          },
          layers: [{ id: "osm", type: "raster", source: "osm" }],
        },
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

      map.on("load", () => {
        if (disposed) return;
        map.addSource("radius", { type: "geojson", data: circleFeature(origin, radiusMeters) });
        map.addLayer({ id: "radius-fill", type: "fill", source: "radius", paint: { "fill-color": "#149CFF", "fill-opacity": 0.08 } });
        map.addLayer({ id: "radius-line", type: "line", source: "radius", paint: { "line-color": "#19E6FF", "line-width": 1.5, "line-opacity": 0.75 } });

        map.addSource("places", {
          type: "geojson",
          data: placeFeatureCollection(placesRef.current, selectedPlace),
          cluster: true,
          clusterRadius: 46,
          clusterMaxZoom: 15,
        });
        map.addLayer({
          id: "clusters",
          type: "circle",
          source: "places",
          filter: ["has", "point_count"],
          paint: { "circle-color": "#071827", "circle-radius": ["step", ["get", "point_count"], 18, 10, 22, 30, 27], "circle-stroke-color": "#19E6FF", "circle-stroke-width": 2 },
        });
        map.addLayer({ id: "cluster-count", type: "symbol", source: "places", filter: ["has", "point_count"], layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12 }, paint: { "text-color": "#FFFFFF" } });
        map.addLayer({
          id: "saved-places",
          type: "circle",
          source: "places",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": ["get", "color"],
            "circle-radius": ["case", ["==", ["get", "selected"], 1], 10, 7],
            "circle-stroke-color": "#FFFFFF",
            "circle-stroke-width": ["case", ["==", ["get", "selected"], 1], 3, 1.5],
          },
        });

        map.on("click", "clusters", (event: any) => {
          const coordinates = event.features?.[0]?.geometry?.coordinates;
          if (!coordinates) return;
          map.easeTo({ center: coordinates, zoom: Math.min(map.getZoom() + 2, 17) });
        });
        map.on("click", "saved-places", (event: any) => {
          const id = String(event.features?.[0]?.properties?.id || "");
          const place = placesRef.current.find((item) => item.id === id);
          if (place) onSelectRef.current(place);
        });
        map.on("mouseenter", "clusters", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "clusters", () => { map.getCanvas().style.cursor = ""; });
        map.on("mouseenter", "saved-places", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "saved-places", () => { map.getCanvas().style.cursor = ""; });
        map.on("moveend", () => {
          const next = map.getCenter();
          onMoveEndRef.current({ lat: next.lat, lng: next.lng });
        });

        const homeElement = document.createElement("div");
        homeElement.setAttribute("aria-label", language === "en" ? "HOME" : "บ้านสุภาอพาร์ทเม้นต์");
        homeElement.style.width = "40px";
        homeElement.style.height = "40px";
        homeElement.style.borderRadius = "999px";
        homeElement.style.display = "grid";
        homeElement.style.placeItems = "center";
        homeElement.style.background = "#149CFF";
        homeElement.style.border = "3px solid white";
        homeElement.style.boxShadow = "0 8px 22px rgba(20,156,255,.42)";
        homeElement.innerHTML = "<span style='font-size:18px;line-height:1'>⌂</span>";
        homeMarkerRef.current = new maplibregl.Marker({ element: homeElement, anchor: "center" }).setLngLat([origin.lng, origin.lat]).addTo(map);

        setState("ready");
        onStateChange?.("ready");
      });
    }).catch((caught) => {
      if (disposed) return;
      const message = caught instanceof Error ? caught.message : "Saved cloud map unavailable";
      setError(message);
      setState("error");
      onStateChange?.("error");
    });

    return () => {
      disposed = true;
      homeMarkerRef.current?.remove?.();
      homeMarkerRef.current = null;
      mapRef.current?.remove?.();
      mapRef.current = null;
    };
  }, [active]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded?.()) return;
    const source = map.getSource("places") as any;
    source?.setData?.(placeFeatureCollection(places, selectedPlace));
  }, [places, selectedPlace]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded?.()) return;
    const source = map.getSource("radius") as any;
    source?.setData?.(circleFeature(origin, radiusMeters));
    homeMarkerRef.current?.setLngLat?.([origin.lng, origin.lat]);
  }, [origin, radiusMeters]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedPlace || selectedPlace.latitude == null || selectedPlace.longitude == null) return;
    map.easeTo({ center: [selectedPlace.longitude, selectedPlace.latitude], duration: 350 });
  }, [selectedPlace]);

  return (
    <div className="absolute inset-0" data-testid="saved-cloud-map" data-map-state={state}>
      <div ref={containerRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-2 rounded-xl border border-emerald-300/15 bg-[#02060D]/78 px-3 py-2 text-[8px] text-white/65 backdrop-blur-md">
        <Cloud className="h-3.5 w-3.5 text-emerald-200" />
        <span><strong className="text-emerald-100">Saved Cloud Map</strong> • Supabase {coordinatePlaces.length} • OpenStreetMap • no Google request</span>
      </div>
      {state === "loading" && <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-[#02060D]/35"><div className="amd-glass flex items-center gap-2 rounded-xl px-4 py-3 text-[10px]"><LoaderCircle className="h-4 w-4 animate-spin text-[#19E6FF]" />{language === "en" ? "Loading saved places…" : "กำลังโหลดสถานที่ที่บันทึกบน Cloud…"}</div></div>}
      {error && <div className="absolute inset-x-4 top-16 z-20 rounded-xl border border-rose-300/15 bg-[#12070b]/90 p-3 text-[9px] text-rose-100">{error}</div>}
      <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#02060D]/78 px-3 py-2 text-[8px] text-white/55 backdrop-blur-md"><Home className="h-3.5 w-3.5 text-[#149CFF]" /> HOME <span>•</span><MapPin className="h-3.5 w-3.5" /> {coordinatePlaces.length} places</div>
    </div>
  );
}

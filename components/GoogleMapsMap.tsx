"use client";

import { useCallback, useEffect, useRef } from "react";
import { loadGoogleMaps } from "@/lib/google-maps";
import { LEGACY_DARK_MAP_STYLES } from "@/lib/map-style";
import type { Place } from "@/types/place";

type Point = { lat: number; lng: number };

type Props = {
  apiKey: string;
  mapId: string;
  places: Place[];
  origin: Point;
  radiusMeters: number;
  selectedPlace: Place | null;
  center: Point;
  onSelectPlace: (place: Place) => void;
  onMoveEnd: (center: Point) => void;
  onStateChange?: (state: "loading" | "ready" | "error") => void;
};

type Cluster = {
  id: string;
  lat: number;
  lng: number;
  places: Place[];
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

function mapZoomForRadius(radiusMeters: number) {
  if (radiusMeters <= 250) return 16.8;
  if (radiusMeters <= 500) return 15.8;
  if (radiusMeters <= 1000) return 14.9;
  if (radiusMeters <= 2000) return 14.1;
  if (radiusMeters <= 3000) return 13.6;
  return 12.8;
}

function markerContent(place: Place, selected: boolean) {
  const el = document.createElement("button");
  el.type = "button";
  el.setAttribute("aria-label", place.name);
  const color = CATEGORY_COLORS[place.category] || CATEGORY_COLORS.other;
  Object.assign(el.style, {
    width: selected ? "30px" : "20px",
    height: selected ? "30px" : "20px",
    borderRadius: "999px",
    border: selected ? "3px solid #00D9FF" : "2px solid rgba(235,245,255,.92)",
    background: selected ? "#ffffff" : color,
    boxShadow: selected ? "0 0 0 5px rgba(0,217,255,.16),0 8px 24px rgba(0,0,0,.42)" : "0 5px 15px rgba(0,0,0,.36)",
    cursor: "pointer",
    padding: "0",
  });
  return el;
}

function clusterContent(count: number) {
  const el = document.createElement("button");
  el.type = "button";
  el.setAttribute("aria-label", `${count} places`);
  el.textContent = count > 99 ? "99+" : String(count);
  Object.assign(el.style, {
    minWidth: count > 99 ? "42px" : "36px",
    width: count > 99 ? "42px" : "36px",
    height: "36px",
    borderRadius: "999px",
    border: "2px solid #149CFF",
    background: "rgba(5,17,32,.96)",
    color: "#F7F9FC",
    fontSize: "11px",
    fontWeight: "800",
    boxShadow: "0 0 0 5px rgba(0,122,255,.11),0 8px 24px rgba(0,0,0,.38)",
    cursor: "pointer",
  });
  return el;
}

function homeContent() {
  const el = document.createElement("div");
  el.setAttribute("aria-label", "Baan Supar Apartment / Home");
  el.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="white" d="M3 10.8 12 3l9 7.8v9.7a.5.5 0 0 1-.5.5H15v-6H9v6H3.5a.5.5 0 0 1-.5-.5v-9.7Z"/></svg>';
  Object.assign(el.style, {
    width: "38px",
    height: "38px",
    display: "grid",
    placeItems: "center",
    borderRadius: "999px",
    border: "2px solid #00D9FF",
    background: "#007AFF",
    boxShadow: "0 0 0 8px rgba(0,122,255,.16),0 0 28px rgba(0,217,255,.44)",
  });
  return el;
}

function clusterPlaces(places: Place[], zoom: number, selectedId: string | null): Cluster[] {
  const usable = places.filter((place) => place.latitude != null && place.longitude != null);
  if (zoom >= 17) {
    return usable.map((place) => ({ id: place.id, lat: place.latitude as number, lng: place.longitude as number, places: [place] }));
  }

  const cellPixels = zoom <= 12 ? 92 : zoom <= 14 ? 78 : 62;
  const degreePerPixel = 360 / (256 * 2 ** zoom);
  const latCell = degreePerPixel * cellPixels;
  const buckets = new Map<string, Place[]>();
  const singles: Cluster[] = [];

  for (const place of usable) {
    if (selectedId && place.id === selectedId) {
      singles.push({ id: place.id, lat: place.latitude as number, lng: place.longitude as number, places: [place] });
      continue;
    }
    const cos = Math.max(0.28, Math.cos(((place.latitude as number) * Math.PI) / 180));
    const lngCell = latCell / cos;
    const key = `${Math.floor((place.latitude as number) / latCell)}:${Math.floor((place.longitude as number) / lngCell)}`;
    const current = buckets.get(key) || [];
    current.push(place);
    buckets.set(key, current);
  }

  const clustered = Array.from(buckets.entries()).map(([key, bucket]) => ({
    id: `cluster-${key}`,
    lat: bucket.reduce((sum, place) => sum + (place.latitude as number), 0) / bucket.length,
    lng: bucket.reduce((sum, place) => sum + (place.longitude as number), 0) / bucket.length,
    places: bucket,
  }));
  return [...clustered, ...singles];
}

export function GoogleMapsMap({
  apiKey,
  mapId,
  places,
  origin,
  radiusMeters,
  selectedPlace,
  center,
  onSelectPlace,
  onMoveEnd,
  onStateChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const radiusRef = useRef<any>(null);
  const homeMarkerRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const listenersRef = useRef<any[]>([]);
  const readyRef = useRef(false);
  const suppressIdleRef = useRef(false);
  const placesRef = useRef(places);
  const selectedRef = useRef(selectedPlace);
  const onSelectRef = useRef(onSelectPlace);
  const onMoveEndRef = useRef(onMoveEnd);

  placesRef.current = places;
  selectedRef.current = selectedPlace;
  onSelectRef.current = onSelectPlace;
  onMoveEndRef.current = onMoveEnd;

  const clearBusinessMarkers = useCallback(() => {
    for (const marker of markersRef.current) {
      if ("map" in marker) marker.map = null;
      marker.setMap?.(null);
    }
    markersRef.current = [];
  }, []);

  const renderBusinessMarkers = useCallback(() => {
    const map = mapRef.current;
    const google = window.google;
    if (!map || !google?.maps || !readyRef.current) return;
    clearBusinessMarkers();

    const zoom = Number(map.getZoom?.() ?? 14);
    const clusters = clusterPlaces(placesRef.current, zoom, selectedRef.current?.id || null);
    const AdvancedMarkerElement = google.maps.marker?.AdvancedMarkerElement;

    for (const cluster of clusters) {
      if (cluster.places.length > 1) {
        if (AdvancedMarkerElement) {
          const marker = new AdvancedMarkerElement({
            map,
            position: { lat: cluster.lat, lng: cluster.lng },
            content: clusterContent(cluster.places.length),
            title: `${cluster.places.length} places`,
            gmpClickable: true,
            zIndex: 80 + cluster.places.length,
          });
          marker.addListener("click", () => {
            suppressIdleRef.current = true;
            map.panTo({ lat: cluster.lat, lng: cluster.lng });
            map.setZoom(Math.min(18, zoom + 2));
          });
          markersRef.current.push(marker);
        } else {
          const marker = new google.maps.Marker({
            map,
            position: { lat: cluster.lat, lng: cluster.lng },
            label: { text: cluster.places.length > 99 ? "99+" : String(cluster.places.length), color: "#ffffff", fontWeight: "700" },
            icon: { path: google.maps.SymbolPath.CIRCLE, scale: 18, fillColor: "#061424", fillOpacity: 0.96, strokeColor: "#149CFF", strokeWeight: 2 },
            zIndex: 80 + cluster.places.length,
          });
          marker.addListener("click", () => {
            suppressIdleRef.current = true;
            map.panTo({ lat: cluster.lat, lng: cluster.lng });
            map.setZoom(Math.min(18, zoom + 2));
          });
          markersRef.current.push(marker);
        }
        continue;
      }

      const place = cluster.places[0];
      const selected = selectedRef.current?.id === place.id;
      if (AdvancedMarkerElement) {
        const marker = new AdvancedMarkerElement({
          map,
          position: { lat: cluster.lat, lng: cluster.lng },
          content: markerContent(place, selected),
          title: place.name,
          gmpClickable: true,
          zIndex: selected ? 1000 : 100,
        });
        marker.addListener("click", () => onSelectRef.current(place));
        markersRef.current.push(marker);
      } else {
        const color = selected ? "#ffffff" : CATEGORY_COLORS[place.category] || CATEGORY_COLORS.other;
        const marker = new google.maps.Marker({
          map,
          position: { lat: cluster.lat, lng: cluster.lng },
          title: place.name,
          icon: { path: google.maps.SymbolPath.CIRCLE, scale: selected ? 11 : 7, fillColor: color, fillOpacity: 1, strokeColor: selected ? "#00D9FF" : "#e8f2ff", strokeWeight: selected ? 3 : 2 },
          zIndex: selected ? 1000 : 100,
        });
        marker.addListener("click", () => onSelectRef.current(place));
        markersRef.current.push(marker);
      }
    }
  }, [clearBusinessMarkers]);

  useEffect(() => {
    if (!apiKey || !containerRef.current) return;
    let cancelled = false;
    onStateChange?.("loading");

    void loadGoogleMaps(apiKey)
      .then(async () => {
        if (cancelled || !containerRef.current || !window.google?.maps) return;
        const google = window.google;
        try { await google.maps.importLibrary?.("marker"); } catch {}
        if (cancelled || !containerRef.current) return;

        const options: Record<string, unknown> = {
          center,
          zoom: mapZoomForRadius(radiusMeters),
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
          gestureHandling: "greedy",
          backgroundColor: "#02060D",
          keyboardShortcuts: true,
          streetViewControl: false,
          fullscreenControl: false,
          mapTypeControl: false,
        };
        if (mapId) options.mapId = mapId;
        else options.styles = LEGACY_DARK_MAP_STYLES;

        const map = new google.maps.Map(containerRef.current, options);
        mapRef.current = map;

        radiusRef.current = new google.maps.Circle({
          map,
          center: origin,
          radius: radiusMeters,
          strokeColor: "#00D9FF",
          strokeOpacity: 0.42,
          strokeWeight: 1.25,
          fillColor: "#007AFF",
          fillOpacity: 0.055,
          clickable: false,
          zIndex: 1,
        });

        const AdvancedMarkerElement = google.maps.marker?.AdvancedMarkerElement;
        if (AdvancedMarkerElement) {
          homeMarkerRef.current = new AdvancedMarkerElement({
            map,
            position: origin,
            content: homeContent(),
            title: "Baan Supar Apartment / Home",
            zIndex: 1500,
          });
        } else {
          homeMarkerRef.current = new google.maps.Marker({
            map,
            position: origin,
            title: "Baan Supar Apartment / Home",
            icon: { path: google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: "#007AFF", fillOpacity: 1, strokeColor: "#00D9FF", strokeWeight: 3 },
            zIndex: 1500,
          });
        }

        readyRef.current = true;
        renderBusinessMarkers();

        listenersRef.current.push(
          map.addListener("zoom_changed", () => {
            window.setTimeout(() => renderBusinessMarkers(), 40);
          }),
          map.addListener("idle", () => {
            if (suppressIdleRef.current) {
              suppressIdleRef.current = false;
              return;
            }
            const next = map.getCenter?.();
            if (next) onMoveEndRef.current({ lat: next.lat(), lng: next.lng() });
          }),
        );
        onStateChange?.("ready");
      })
      .catch(() => onStateChange?.("error"));

    return () => {
      cancelled = true;
      readyRef.current = false;
      clearBusinessMarkers();
      for (const listener of listenersRef.current) listener?.remove?.();
      listenersRef.current = [];
      if (homeMarkerRef.current) {
        if ("map" in homeMarkerRef.current) homeMarkerRef.current.map = null;
        homeMarkerRef.current.setMap?.(null);
      }
      homeMarkerRef.current = null;
      radiusRef.current?.setMap?.(null);
      radiusRef.current = null;
      mapRef.current = null;
    };
  }, [apiKey, mapId]);

  useEffect(() => {
    if (!readyRef.current) return;
    renderBusinessMarkers();
  }, [places, selectedPlace, renderBusinessMarkers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    radiusRef.current?.setCenter?.(origin);
    radiusRef.current?.setRadius?.(radiusMeters);
    if (homeMarkerRef.current) {
      if ("position" in homeMarkerRef.current) homeMarkerRef.current.position = origin;
      homeMarkerRef.current.setPosition?.(origin);
    }
  }, [origin, radiusMeters]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !selectedPlace || selectedPlace.latitude == null || selectedPlace.longitude == null) return;
    suppressIdleRef.current = true;
    map.panTo({ lat: selectedPlace.latitude, lng: selectedPlace.longitude });
    if ((map.getZoom?.() ?? 0) < 16) map.setZoom(16);
    renderBusinessMarkers();
  }, [selectedPlace, renderBusinessMarkers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || selectedPlace) return;
    const current = map.getCenter?.();
    if (current && Math.abs(current.lat() - center.lat) < 0.00008 && Math.abs(current.lng() - center.lng) < 0.00008) return;
    suppressIdleRef.current = true;
    map.panTo(center);
  }, [center, selectedPlace]);

  return <div ref={containerRef} className="absolute inset-0 bg-[#02060D]" aria-label="Around My Dorm Google map" />;
}

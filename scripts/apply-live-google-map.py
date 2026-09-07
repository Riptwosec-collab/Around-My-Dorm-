from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"Patch target not found: {label}")
    return text.replace(old, new, 1)


def patch_app() -> None:
    path = ROOT / "components/AroundMyDormApp.tsx"
    text = path.read_text(encoding="utf-8")

    if 'type MapLoadState = "idle" | "loading" | "ready" | "missing" | "error";' not in text:
        text = replace_once(
            text,
            'type QuickFilter = "open" | "near" | "cafe" | "late" | "parking" | null;\n',
            'type QuickFilter = "open" | "near" | "cafe" | "late" | "parking" | null;\ntype MapLoadState = "idle" | "loading" | "ready" | "missing" | "error";\n',
            "map load state type",
        )

    text = replace_once(
        text,
        '  DORM_NAME,\n  dedupePlaces,',
        '  DORM_NAME,\n  dedupePlaces,\n  haversineKm,',
        "haversine import",
    )

    old_match = '    const live = livePlaces.find((candidate) => normalizeText(candidate.name) === normalizeText(seed.name));'
    new_match = '''    const live = livePlaces.find((candidate) => {
      if (seed.googlePlaceId && candidate.googlePlaceId && seed.googlePlaceId === candidate.googlePlaceId) return true;
      const seedName = normalizeText(seed.name);
      const candidateName = normalizeText(candidate.name);
      if (seedName === candidateName) return true;
      if (!seedName || !candidateName || (!seedName.includes(candidateName) && !candidateName.includes(seedName))) return false;
      if (seed.latitude == null || seed.longitude == null || candidate.latitude == null || candidate.longitude == null) return false;
      return haversineKm({ lat: seed.latitude, lng: seed.longitude }, { lat: candidate.latitude, lng: candidate.longitude }) <= 0.12;
    });'''
    text = replace_once(text, old_match, new_match, "live duplicate matching")

    replacements = {
        '      latitude: live.latitude,': '      latitude: live.latitude ?? seed.latitude,',
        '      longitude: live.longitude,': '      longitude: live.longitude ?? seed.longitude,',
        '      distanceKm: live.distanceKm,': '      distanceKm: live.distanceKm ?? seed.distanceKm,',
        '      walkingMinutes: live.walkingMinutes,': '      walkingMinutes: live.walkingMinutes ?? seed.walkingMinutes,',
        '      drivingMinutes: live.drivingMinutes,': '      drivingMinutes: live.drivingMinutes ?? seed.drivingMinutes,',
        '      liveOpenNow: live.liveOpenNow,': '      liveOpenNow: live.liveOpenNow ?? seed.liveOpenNow ?? null,\n      structuredOpeningHours: live.structuredOpeningHours ?? seed.structuredOpeningHours,\n      openingHoursText: live.openingHoursText ?? seed.openingHoursText ?? null,\n      is24Hours: seed.is24Hours || live.is24Hours,',
        '      rating: live.rating,': '      rating: live.rating ?? seed.rating,',
        '      reviewCount: live.reviewCount,': '      reviewCount: live.reviewCount ?? seed.reviewCount,',
        '      verified: true,': '      verified: seed.verified || live.verified,',
        '      notes: live.notes || seed.notes,': '      notes: seed.notes || live.notes,',
    }
    for old, new in replacements.items():
        if old in text:
            text = text.replace(old, new, 1)

    text = replace_once(
        text,
        '  const [apiReady, setApiReady] = useState(false);\n',
        '  const [apiReady, setApiReady] = useState(false);\n  const [mapLoadState, setMapLoadState] = useState<MapLoadState>(apiKey ? "idle" : "missing");\n',
        "map load state",
    )
    text = replace_once(
        text,
        '  const radiusCircleRef = useRef<any>(null);\n  const mapIdleListenerRef = useRef<any>(null);\n',
        '  const radiusCircleRef = useRef<any>(null);\n  const routeLineRef = useRef<any>(null);\n  const mapIdleListenerRef = useRef<any>(null);\n  const programmaticMapMoveRef = useRef(false);\n',
        "map runtime refs",
    )

    old_loader = '''  useEffect(() => {
    if (!apiKey || !navigator.onLine) return;
    const shouldLoad = tab === "map" || Boolean(debouncedQuery) || category !== "all" || quickFilter != null;
    if (!shouldLoad) return;
    loadGoogleMaps(apiKey).then(() => setApiReady(true)).catch(() => setApiReady(false));
  }, [apiKey, tab, debouncedQuery, category, quickFilter]);'''
    new_loader = '''  useEffect(() => {
    const shouldLoad = tab === "map" || Boolean(debouncedQuery) || category !== "all" || quickFilter != null;
    if (!shouldLoad) return;
    if (!apiKey) {
      setApiReady(false);
      setMapLoadState("missing");
      return;
    }
    if (!navigator.onLine) {
      setApiReady(false);
      setMapLoadState("error");
      return;
    }
    if (window.google?.maps) {
      setApiReady(true);
      setMapLoadState("ready");
      return;
    }
    setMapLoadState("loading");
    loadGoogleMaps(apiKey)
      .then(() => { setApiReady(true); setMapLoadState("ready"); })
      .catch(() => { setApiReady(false); setMapLoadState("error"); });
  }, [apiKey, tab, debouncedQuery, category, quickFilter]);'''
    text = replace_once(text, old_loader, new_loader, "maps loader state")

    visible_anchor = '''  const favoritePlaces = useMemo(() => {
    return favorites.map((saved) => allPlaces.find((place) => place.id === saved.id || (saved.googlePlaceId && place.googlePlaceId === saved.googlePlaceId)) || saved);
  }, [favorites, allPlaces]);'''
    map_visible = '''  const mapVisiblePlaces = useMemo(() => {
    const data = allPlaces.filter((place) => {
      if (category !== "all" && !place.categories.includes(category)) return false;
      if (!matchesSearch(place, debouncedQuery)) return false;
      if (!passesFilters(place, filters, settings.verifiedOnly)) return false;
      if (place.latitude == null || place.longitude == null) return false;
      const fromMapCenter = haversineKm(mapSearchCenter, { lat: place.latitude, lng: place.longitude });
      return fromMapCenter * 1000 <= radiusMeters;
    });
    return sortPlaces(data, sortMode, new Set(settings.preferredCategories || []));
  }, [allPlaces, category, debouncedQuery, filters, radiusMeters, mapSearchCenter, sortMode, settings.verifiedOnly, settings.preferredCategories]);

  const favoritePlaces = useMemo(() => {
    return favorites.map((saved) => allPlaces.find((place) => place.id === saved.id || (saved.googlePlaceId && place.googlePlaceId === saved.googlePlaceId)) || saved);
  }, [favorites, allPlaces]);'''
    text = replace_once(text, visible_anchor, map_visible, "map-centered visible places")

    dorm_fn = '''  function useDormLocation() {
    setOrigin(DORM_CENTER); setMapSearchCenter(DORM_CENTER);
    setOriginMode("dorm"); setSettings((current) => ({ ...current, homeMode: "dorm" }));
    setLocationError(null);
  }
'''
    dorm_new = dorm_fn + '''
  function handleMapLocate() {
    setPendingMapCenter(null);
    setShowSearchArea(false);
    if (originMode !== "me") {
      useMyLocation();
      return;
    }
    programmaticMapMoveRef.current = true;
    mapRef.current?.panTo(origin);
    mapRef.current?.setZoom(radiusMeters <= 500 ? 16 : radiusMeters <= 1000 ? 15 : radiusMeters <= 3000 ? 14 : 13);
    setMapSearchCenter(origin);
    setSelectedPlace(null);
  }
'''
    text = replace_once(text, dorm_fn, dorm_new, "map locate handler")

    old_idle = '        mapIdleListenerRef.current = mapRef.current.addListener("idle", () => { const center = mapRef.current?.getCenter?.(); if (!center) return; const next = { lat: center.lat(), lng: center.lng() }; const moved = Math.abs(next.lat - mapSearchCenter.lat) > 0.0008 || Math.abs(next.lng - mapSearchCenter.lng) > 0.0008; if (moved) { setPendingMapCenter(next); setShowSearchArea(true); } });'
    new_idle = '        mapIdleListenerRef.current = mapRef.current.addListener("idle", () => { if (programmaticMapMoveRef.current) { programmaticMapMoveRef.current = false; return; } const center = mapRef.current?.getCenter?.(); if (!center) return; const next = { lat: center.lat(), lng: center.lng() }; const moved = Math.abs(next.lat - mapSearchCenter.lat) > 0.0008 || Math.abs(next.lng - mapSearchCenter.lng) > 0.0008; if (moved) { setPendingMapCenter(next); setShowSearchArea(true); } });'
    text = replace_once(text, old_idle, new_idle, "programmatic map move guard")

    text = replace_once(
        text,
        '      mapRef.current.setCenter(target);\n      mapRef.current.setZoom(selectedPlace?.latitude != null ? 17 : radiusMeters <= 500 ? 16 : radiusMeters <= 1000 ? 15 : radiusMeters <= 3000 ? 14 : 13);',
        '      programmaticMapMoveRef.current = true;\n      mapRef.current.setCenter(target);\n      mapRef.current.setZoom(selectedPlace?.latitude != null ? 17 : radiusMeters <= 500 ? 16 : radiusMeters <= 1000 ? 15 : radiusMeters <= 3000 ? 14 : 13);',
        "programmatic target focus",
    )

    circle_anchor = '''      if (!radiusCircleRef.current) radiusCircleRef.current = new window.google.maps.Circle({ map: mapRef.current, center: origin, radius: radiusMeters, strokeColor: "#00D9FF", strokeOpacity: .38, strokeWeight: 1, fillColor: "#007AFF", fillOpacity: .07, clickable: false });
      else { radiusCircleRef.current.setCenter(origin); radiusCircleRef.current.setRadius(radiusMeters); }
'''
    circle_new = circle_anchor + '''      routeLineRef.current?.setMap?.(null);
      routeLineRef.current = null;
      if (selectedPlace?.latitude != null && selectedPlace.longitude != null) {
        routeLineRef.current = new window.google.maps.Polyline({
          map: mapRef.current,
          path: [origin, { lat: selectedPlace.latitude, lng: selectedPlace.longitude }],
          strokeOpacity: 0,
          clickable: false,
          icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: .75, strokeColor: "#00D9FF", scale: 2.2 }, offset: "0", repeat: "12px" }],
        });
      }
'''
    text = replace_once(text, circle_anchor, circle_new, "selected route hint")

    old_marker_loop = '      visiblePlaces.forEach((place) => { if (place.latitude == null || place.longitude == null) return; const marker = makeMarker({lat:place.latitude,lng:place.longitude}, place.name, MARKER_COLORS[place.category] || "#8ca0bb", selectedPlace?.id === place.id); marker.addListener("click", () => { addRecent(place); setSelectedPlace(place); }); placeMarkers.push(marker); markersRef.current.push(marker); });'
    new_marker_loop = '''      mapVisiblePlaces.forEach((place) => { if (place.latitude == null || place.longitude == null) return; const position = {lat:place.latitude,lng:place.longitude}; const marker = makeMarker(position, place.name, MARKER_COLORS[place.category] || "#8ca0bb", selectedPlace?.id === place.id); marker.addListener("click", () => { addRecent(place); setSelectedPlace(place); programmaticMapMoveRef.current = true; mapRef.current?.panTo(position); const zoom = mapRef.current?.getZoom?.() ?? 16; if (zoom < 16) mapRef.current?.setZoom(16); }); placeMarkers.push(marker); markersRef.current.push(marker); });'''
    text = replace_once(text, old_marker_loop, new_marker_loop, "real marker selection behavior")

    cluster_anchor = '''      if (placeMarkers.length) {
        const renderer: any = { render: ({ count, position }: any) => new window.google.maps.Marker({ position, icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 17, fillColor: "#061424", fillOpacity: .96, strokeColor: "#008CFF", strokeOpacity: .92, strokeWeight: 2 }, label: { text: String(count), color: "#F7F9FC", fontSize: "11px", fontWeight: "700" }, zIndex: 1000 + count }) };
        clustererRef.current = new MarkerClusterer({ map: mapRef.current, markers: placeMarkers, renderer });
      }
    })();'''
    cluster_new = '''      if (placeMarkers.length) {
        const renderer: any = { render: ({ count, position }: any) => new window.google.maps.Marker({ position, icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 17, fillColor: "#061424", fillOpacity: .96, strokeColor: "#008CFF", strokeOpacity: .92, strokeWeight: 2 }, label: { text: String(count), color: "#F7F9FC", fontSize: "11px", fontWeight: "700" }, zIndex: 1000 + count }) };
        clustererRef.current = new MarkerClusterer({ map: mapRef.current, markers: placeMarkers, renderer });
      }
      if (!selectedPlace) {
        const coordinates = mapVisiblePlaces.filter((place) => place.latitude != null && place.longitude != null).slice(0, 40);
        if (coordinates.length >= 2) {
          const bounds = new window.google.maps.LatLngBounds();
          coordinates.forEach((place) => bounds.extend({ lat: place.latitude, lng: place.longitude }));
          bounds.extend(origin);
          programmaticMapMoveRef.current = true;
          mapRef.current.fitBounds(bounds, 44);
          window.google.maps.event.addListenerOnce(mapRef.current, "idle", () => { if ((mapRef.current?.getZoom?.() ?? 0) > 16) mapRef.current?.setZoom(16); });
        }
      }
    })().catch(() => { if (!cancelled) { setApiReady(false); setMapLoadState("error"); } });'''
    text = replace_once(text, cluster_anchor, cluster_new, "bounds and map init failure")

    text = text.replace(
        '[tab, apiReady, mapId, origin, originMode, radiusMeters, visiblePlaces, selectedPlace, mapSearchCenter, copy.yourLocation]',
        '[tab, apiReady, mapId, origin, originMode, radiusMeters, mapVisiblePlaces, selectedPlace, mapSearchCenter, copy.yourLocation]',
        1,
    )

    old_map_render = '''                {apiReady ? <div ref={mapEl} className="absolute inset-0 bg-[#02060D]" /> : (
                  <div className="amd-hero-map amd-map-fallback rounded-none border-0">
                    <MiniMapArtwork />
                    <div className="absolute inset-0 grid place-items-center p-8 text-center"><div className="amd-glass amd-card max-w-[280px] p-5"><MapIcon className="mx-auto h-9 w-9 text-[#00D9FF]" /><p className="mt-3 text-[14px] font-semibold">Google Maps Preview</p><p className="mt-2 text-[10px] leading-5 text-[var(--amd-text-2)]">ตั้งค่า NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ใน Cloudflare เพื่อเปิดแผนที่สดและหมุดจริง</p><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(DORM_NAME)}`} target="_blank" rel="noreferrer" className="amd-btn amd-btn-primary mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[10px] font-bold"><Navigation className="h-4 w-4" /> เปิด Google Maps</a></div></div>
                  </div>
                )}'''
    new_map_render = '''                {mapLoadState === "ready" ? <div ref={mapEl} className="absolute inset-0 bg-[#02060D]" /> : mapLoadState === "loading" ? (
                  <div className="absolute inset-0 overflow-hidden bg-[#02060D]">
                    <div className="amd-skeleton absolute inset-0 opacity-70" />
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(0,95,220,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(0,95,220,.06)_1px,transparent_1px)] bg-[size:32px_32px]" />
                    <div className="absolute inset-0 grid place-items-center"><div className="amd-glass flex items-center gap-2 rounded-full px-4 py-2 text-[10px] text-[var(--amd-text-2)]"><LoaderCircle className="h-4 w-4 animate-spin text-[#00D9FF]" />{settings.language === "en" ? "Loading live map" : "กำลังโหลดแผนที่สด"}</div></div>
                  </div>
                ) : (
                  <div className="amd-hero-map amd-map-fallback rounded-none border-0">
                    <MiniMapArtwork />
                    <div className="absolute bottom-5 left-4 right-4 z-10"><div className="amd-glass-strong amd-card max-w-[310px] p-4 text-left"><div className="flex items-start gap-3"><MapIcon className="mt-0.5 h-6 w-6 shrink-0 text-[#00D9FF]" /><div><p className="text-[12px] font-semibold">{mapLoadState === "missing" ? (settings.language === "en" ? "Google Maps is not configured" : "ยังไม่ได้ตั้งค่า Google Maps") : (settings.language === "en" ? "Live map could not load" : "โหลดแผนที่สดไม่ได้")}</p><p className="mt-1 text-[9px] leading-4 text-[var(--amd-text-2)]">{mapLoadState === "missing" ? "Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to enable live maps." : (settings.language === "en" ? "Using fallback data mode." : "กำลังใช้โหมดข้อมูลสำรอง")}</p></div></div><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(DORM_NAME)}`} target="_blank" rel="noreferrer" className="amd-btn mt-3 inline-flex items-center gap-2 rounded-xl border border-[rgba(20,156,255,.35)] px-3 py-2 text-[9px] font-semibold text-[#8ecbff]"><Navigation className="h-3.5 w-3.5" /> เปิด Google Maps</a></div></div>
                  </div>
                )}'''
    text = replace_once(text, old_map_render, new_map_render, "real map loading/failure states")

    old_radius = '<option value={250}>250 ม.</option><option value={500}>500 ม.</option><option value={1000}>1 กม.</option><option value={2000}>2 กม.</option>'
    new_radius = '<option value={250}>250 ม.</option><option value={500}>500 ม.</option><option value={1000}>1 กม.</option><option value={2000}>2 กม.</option><option value={3000}>3 กม.</option><option value={5000}>5 กม.</option>'
    text = replace_once(text, old_radius, new_radius, "full radius options")

    old_search_area = 'onClick={() => { setMapSearchCenter(pendingMapCenter); setShowSearchArea(false); }}'
    new_search_area = 'onClick={() => { programmaticMapMoveRef.current = true; setMapSearchCenter(pendingMapCenter); setPendingMapCenter(null); setSelectedPlace(null); setShowSearchArea(false); }}'
    text = replace_once(text, old_search_area, new_search_area, "search this area behavior")

    old_recenter = '<button type="button" onClick={() => { mapRef.current?.setCenter(origin); setSelectedPlace(null); }} className="amd-glass absolute bottom-5 right-4 z-20 grid h-12 w-12 place-items-center rounded-full text-[#149CFF]"><LocateFixed className="h-5 w-5" /></button>'
    new_recenter = '<button type="button" aria-label={settings.language === "en" ? "Use current location" : "ใช้ตำแหน่งปัจจุบัน"} onClick={handleMapLocate} className={`amd-glass absolute right-4 z-20 grid h-12 w-12 place-items-center rounded-full text-[#149CFF] transition-[bottom] duration-[var(--motion-normal)] ${selectedPlace ? "bottom-[340px]" : "bottom-5"}`}><LocateFixed className="h-5 w-5" /></button>'
    text = replace_once(text, old_recenter, new_recenter, "live location recenter control")

    location_insert = '                {selectedPlace && <MapBottomSheet place={selectedPlace} language={settings.language} onDetails={() => openDetail(selectedPlace)} />}\n'
    location_new = '                {locationError && <div className="amd-glass absolute left-4 top-[72px] z-20 max-w-[280px] rounded-xl border border-amber-300/15 px-3 py-2 text-[9px] leading-4 text-amber-100">{locationError}</div>}\n                {selectedPlace && <MapBottomSheet place={selectedPlace} language={settings.language} onDetails={() => openDetail(selectedPlace)} />}\n'
    text = replace_once(text, location_insert, location_new, "map geolocation inline error")

    text = text.replace(
        '{filterOpen && <FilterSheet value={filters} onChange={setFilters} onClose={() => setFilterOpen(false)} resultCount={visiblePlaces.length} />}',
        '{filterOpen && <FilterSheet value={filters} onChange={setFilters} onClose={() => setFilterOpen(false)} resultCount={tab === "map" ? mapVisiblePlaces.length : visiblePlaces.length} />}',
        1,
    )

    path.write_text(text, encoding="utf-8")


def patch_google_maps() -> None:
    path = ROOT / "lib/google-maps.ts"
    text = path.read_text(encoding="utf-8")
    text = text.replace('import type { CategoryId, OpeningHours, Place } from "@/types/place";', 'import type { CategoryId, DayKey, OpeningHours, OpeningPeriod, Place, StructuredOpeningHours } from "@/types/place";', 1)
    text = replace_once(
        text,
        '    script.onload = () => resolve();\n    script.onerror = () => reject(new Error("Google Maps load failed"));',
        '    script.onload = () => { if (window.google?.maps) resolve(); else { delete window.__aroundDormMapsPromise; reject(new Error("Google Maps initialized without maps library")); } };\n    script.onerror = () => { delete window.__aroundDormMapsPromise; reject(new Error("Google Maps load failed")); };',
        "retryable maps loader",
    )

    helper_anchor = '''function locationLiteral(location: any) {
  if (!location) return null;
  const lat = typeof location.lat === "function" ? location.lat() : location.lat;
  const lng = typeof location.lng === "function" ? location.lng() : location.lng;
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}
'''
    helper_new = helper_anchor + '''
const GOOGLE_DAY_KEYS: DayKey[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function googleTime(value: any) {
  if (!value || !Number.isFinite(value.hour)) return null;
  const hour = String(value.hour).padStart(2, "0");
  const minute = String(Number.isFinite(value.minute) ? value.minute : 0).padStart(2, "0");
  return `${hour}:${minute}`;
}

function structuredHoursFromGoogle(hours: any): StructuredOpeningHours | undefined {
  const periods = Array.isArray(hours?.periods) ? hours.periods : [];
  if (!periods.length) return undefined;
  const result: StructuredOpeningHours = {};
  for (const period of periods) {
    const openDay = Number(period?.open?.day);
    const open = googleTime(period?.open);
    const close = googleTime(period?.close);
    if (!Number.isInteger(openDay) || openDay < 0 || openDay > 6 || !open || !close) continue;
    const key = GOOGLE_DAY_KEYS[openDay];
    const current = result[key] || [];
    (current as OpeningPeriod[]).push({ open, close });
    result[key] = current;
  }
  return Object.keys(result).length ? result : undefined;
}

function isGoogle24Hours(hours: any) {
  const descriptions = Array.isArray(hours?.weekdayDescriptions) ? hours.weekdayDescriptions.map(String) : [];
  return descriptions.length >= 7 && descriptions.every((line: string) => /24\s*(hours?|hrs?|ชม\.?)/i.test(line));
}
'''
    text = replace_once(text, helper_anchor, helper_new, "google opening hours helpers")

    text = replace_once(
        text,
        '  const primaryType = raw.primaryType || "";\n  const category = categoryFromGoogleType(primaryType);',
        '  const primaryType = raw.primaryType || "";\n  const category = categoryFromGoogleType(primaryType);\n  const structuredOpeningHours = structuredHoursFromGoogle(raw.currentOpeningHours);\n  const openingHoursText = Array.isArray(raw.currentOpeningHours?.weekdayDescriptions) ? raw.currentOpeningHours.weekdayDescriptions.join(" | ") : null;',
        "live opening hour mapping",
    )
    text = replace_once(text, '    is24Hours: false,', '    is24Hours: isGoogle24Hours(raw.currentOpeningHours),\n    structuredOpeningHours,\n    openingHoursText,', "live 24 hour mapping")
    path.write_text(text, encoding="utf-8")


def patch_place_utils() -> None:
    path = ROOT / "lib/place-utils.ts"
    text = path.read_text(encoding="utf-8")
    old = '''export function googleMapsDirectionsUrl(place: Place) {
  const destination =
    place.latitude != null && place.longitude != null
      ? `${place.latitude},${place.longitude}`
      : [place.name, place.address || place.area].filter(Boolean).join(" ");
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}'''
    new = '''export function googleMapsDirectionsUrl(place: Place) {
  const destination =
    place.latitude != null && place.longitude != null
      ? `${place.latitude},${place.longitude}`
      : [place.name, place.address || place.area].filter(Boolean).join(" ");
  const placeId = place.googlePlaceId || place.googleMaps?.placeId || null;
  const placeIdPart = placeId ? `&destination_place_id=${encodeURIComponent(placeId)}` : "";
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}${placeIdPart}`;
}'''
    text = replace_once(text, old, new, "precise directions URL")
    path.write_text(text, encoding="utf-8")


def patch_map_sheet() -> None:
    path = ROOT / "components/MapBottomSheet.tsx"
    text = path.read_text(encoding="utf-8")
    text = replace_once(
        text,
        '  const category = CATEGORY_MAP[place.category];\n',
        '  const category = CATEGORY_MAP[place.category];\n  const typeBadge = place.placeType === "chain" || place.placeType === "franchise" ? "CHAIN" : place.placeType === "local" || place.placeType === "independent" ? "LOCAL" : null;\n  const hiddenGem = place.tags.some((tag) => /hidden[ _-]?gem/i.test(tag));\n',
        "map sheet factual badges",
    )
    old_top = '''          <div className="flex items-start gap-2">
            <h3 className="min-w-0 flex-1 truncate text-[17px] font-bold tracking-[-0.015em]">{place.name}</h3>
            {place.verified && size !== "collapsed" && <span className="flex items-center gap-1 rounded-md border border-[rgba(0,229,195,.22)] px-2 py-1 text-[8px] font-bold text-[#00E5C3]"><ShieldCheck className="h-3 w-3" /> VERIFIED</span>}
          </div>'''
    new_top = '''          <div className="flex items-start gap-2">
            <h3 className="min-w-0 flex-1 line-clamp-2 text-[17px] font-bold leading-5 tracking-[-0.015em]">{place.name}</h3>
          </div>
          {size !== "collapsed" && (typeBadge || place.verified || hiddenGem) && <div className="mt-1.5 flex flex-wrap gap-1">{typeBadge && <span className="rounded-md border border-[rgba(20,156,255,.24)] px-1.5 py-0.5 text-[7px] font-bold text-[#62baff]">{typeBadge}</span>}{place.verified && <span className="flex items-center gap-1 rounded-md border border-[rgba(0,229,195,.22)] px-1.5 py-0.5 text-[7px] font-bold text-[#00E5C3]"><ShieldCheck className="h-2.5 w-2.5" /> VERIFIED</span>}{hiddenGem && <span className="rounded-md border border-[rgba(155,108,255,.28)] px-1.5 py-0.5 text-[7px] font-bold text-[#b995ff]">HIDDEN GEM</span>}</div>}'''
    text = replace_once(text, old_top, new_top, "map sheet badge hierarchy")
    path.write_text(text, encoding="utf-8")


def patch_env_example() -> None:
    path = ROOT / ".env.example"
    if not path.exists():
      path.write_text("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=\nNEXT_PUBLIC_GOOGLE_MAP_ID=\n", encoding="utf-8")
      return
    text = path.read_text(encoding="utf-8")
    if "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=" not in text:
      text += "\nNEXT_PUBLIC_GOOGLE_MAPS_API_KEY=\n"
    if "NEXT_PUBLIC_GOOGLE_MAP_ID=" not in text:
      text += "NEXT_PUBLIC_GOOGLE_MAP_ID=\n"
    text = text.replace("DEMO_MAP_ID", "YOUR_GOOGLE_MAP_ID")
    path.write_text(text, encoding="utf-8")


def write_map_test() -> None:
    path = ROOT / "e2e/map-functional.spec.ts"
    path.write_text(r'''import { expect, test } from "@playwright/test";

test("map keeps premium layout and exposes full radius controls without API key", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/map/");
  await expect(page.getByRole("heading", { name: "แผนที่", exact: true })).toBeVisible();
  const radius = page.getByLabel("รัศมีแผนที่");
  await expect(radius).toBeVisible();
  await expect(radius.locator("option[value='5000']")).toHaveCount(1);
  await expect(page.getByText(/ยังไม่ได้ตั้งค่า Google Maps|Google Maps is not configured/)).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
''', encoding="utf-8")


if __name__ == "__main__":
    patch_app()
    patch_google_maps()
    patch_place_utils()
    patch_map_sheet()
    patch_env_example()
    write_map_test()
    print("Live Google Map upgrade applied without changing the premium page architecture.")

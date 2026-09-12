from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing anchor: {label}")
    return text.replace(old, new, 1)

# Data Management: wire Routes + platform diagnostics into the existing manual admin surface.
data_path = Path("components/DataManagement.tsx")
data = data_path.read_text()

data = replace_once(
    data,
    'import { GoogleCloudAutoEnrichment } from "@/components/GoogleCloudAutoEnrichment";\n',
    'import { GoogleCloudAutoEnrichment } from "@/components/GoogleCloudAutoEnrichment";\nimport { GoogleRouteRefresh } from "@/components/GoogleRouteRefresh";\nimport { AdminPlatformDiagnostics } from "@/components/AdminPlatformDiagnostics";\n',
    "data imports",
)

data = replace_once(
    data,
    '        <GoogleCloudAutoEnrichment places={places} language={language} onReload={onReload} />\n\n        <GooglePlaceIdManager places={places} language={language} onReload={onReload} />',
    '        <GoogleCloudAutoEnrichment places={places} language={language} onReload={onReload} />\n\n        <GoogleRouteRefresh places={places} language={language} onReload={onReload} />\n\n        <AdminPlatformDiagnostics places={places} language={language} />\n\n        <GooglePlaceIdManager places={places} language={language} onReload={onReload} />',
    "data panels",
)

data_path.write_text(data)

# Main app: one visiblePlaces source for list and map, manual search-area commit,
# approved radii, and marker/card two-way selection.
app_path = Path("components/AroundMyDormApp.tsx")
app = app_path.read_text()

app = replace_once(
    app,
    'import { ManualGoogleMap } from "@/components/ManualGoogleMap";\n',
    'import { ManualGoogleMap } from "@/components/ManualGoogleMap";\nimport { MapPlaceRail } from "@/components/MapPlaceRail";\n',
    "map rail import",
)
app = replace_once(
    app,
    'import { loadPlacesFromDatabase } from "@/lib/database/places";\n',
    'import { loadPlacesFromDatabase } from "@/lib/database/places";\nimport { filterPlacesInSearchArea } from "@/lib/hybrid-map-platform";\n',
    "hybrid helper import",
)

old_visibility = '''  const visiblePlaces = useMemo(() => {\n    const data = allPlaces.filter((place) => {\n      if (category !== "all" && !place.categories.includes(category)) return false;\n      if (!matchesSearch(place, debouncedQuery)) return false;\n      if (!passesFilters(place, filters, settings.verifiedOnly)) return false;\n      if (place.distanceKm != null && place.distanceKm * 1000 > radiusMeters) return false;\n      if (originMode === "me" && place.distanceKm == null) return false;\n      return true;\n    });\n    return sortPlaces(data, sortMode, recommendationContext);\n  }, [allPlaces, category, debouncedQuery, filters, radiusMeters, originMode, sortMode, settings.verifiedOnly, recommendationContext]);\n\n  const mapVisiblePlaces = useMemo(() => {\n    const data = allPlaces.filter((place) => {\n      if (category !== "all" && !place.categories.includes(category)) return false;\n      if (!matchesSearch(place, debouncedQuery)) return false;\n      if (!passesFilters(place, filters, settings.verifiedOnly)) return false;\n      if (place.latitude == null || place.longitude == null) return false;\n      const fromMapCenter = haversineKm(mapSearchCenter, { lat: place.latitude, lng: place.longitude });\n      return fromMapCenter * 1000 <= radiusMeters;\n    });\n    return sortPlaces(data, sortMode, recommendationContext);\n  }, [allPlaces, category, debouncedQuery, filters, radiusMeters, mapSearchCenter, sortMode, settings.verifiedOnly, recommendationContext]);'''
new_visibility = '''  const visiblePlaces = useMemo(() => {\n    const base = allPlaces.filter((place) => {\n      if (category !== "all" && !place.categories.includes(category)) return false;\n      if (!matchesSearch(place, debouncedQuery)) return false;\n      if (!passesFilters(place, filters, settings.verifiedOnly)) return false;\n      if (originMode === "me" && place.distanceKm == null) return false;\n      return true;\n    });\n    const inArea = new Set(filterPlacesInSearchArea(base, mapSearchCenter, radiusMeters).map((place) => place.id));\n    const data = base.filter((place) => place.latitude == null || place.longitude == null || inArea.has(place.id));\n    return sortPlaces(data, sortMode, recommendationContext);\n  }, [allPlaces, category, debouncedQuery, filters, radiusMeters, mapSearchCenter, originMode, sortMode, settings.verifiedOnly, recommendationContext]);'''
app = replace_once(app, old_visibility, new_visibility, "single visiblePlaces")

app = app.replace('RADII.slice(0, 4).map((radius) =>', 'RADII.map((radius) =>', 1)
app = app.replace('places={mapVisiblePlaces}', 'places={visiblePlaces}', 1)

old_radius = '<select aria-label="รัศมีแผนที่" value={radiusMeters} onChange={(event) => setRadiusMeters(Number(event.target.value))} className="amd-map-control amd-map-radius-control amd-chip h-11 appearance-none bg-[#07111f]/90 px-5 pr-9 text-[12px] font-semibold text-white outline-none"><option value={250}>250 ม.</option><option value={500}>500 ม.</option><option value={1000}>1 กม.</option><option value={2000}>2 กม.</option><option value={3000}>3 กม.</option><option value={5000}>5 กม.</option></select>'
new_radius = '<select aria-label="รัศมีแผนที่" value={radiusMeters} onChange={(event) => setRadiusMeters(Number(event.target.value))} className="amd-map-control amd-map-radius-control amd-chip h-11 appearance-none bg-[#07111f]/90 px-5 pr-9 text-[12px] font-semibold text-white outline-none">{RADII.map((radius) => <option key={radius.value} value={radius.value}>{radius.label}</option>)}</select>'
app = replace_once(app, old_radius, new_radius, "map radius select")

rail_anchor = '''                {selectedPlace && <MapBottomSheet place={selectedPlace} language={settings.language} onDetails={() => openDetail(selectedPlace)} />}\n              </div>\n            </div>\n\n\n          {tab === "favorites" && ('''
rail_replacement = '''                {selectedPlace && <MapBottomSheet place={selectedPlace} language={settings.language} onDetails={() => openDetail(selectedPlace)} />}\n              </div>\n              <MapPlaceRail\n                places={visiblePlaces}\n                selectedPlace={selectedPlace}\n                language={settings.language}\n                onSelectPlace={(place) => { addRecent(place); setSelectedPlace(place); }}\n              />\n            </div>\n\n\n          {tab === "favorites" && ('''
app = replace_once(app, rail_anchor, rail_replacement, "map card rail")

# haversine is no longer used for a second map-only collection.
app = app.replace('  haversineKm,\n', '', 1)

app_path.write_text(app)

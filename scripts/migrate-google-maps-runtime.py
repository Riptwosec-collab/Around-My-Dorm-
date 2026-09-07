from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Migration anchor not found: {label}")
    return text.replace(old, new, 1)


# 1) Main app: Mapbox -> Google Maps while preserving database-first filtering and UI.
p = Path("components/AroundMyDormApp.tsx")
s = p.read_text()

s = replace_once(
    s,
    'import { MapboxMap } from "@/components/MapboxMap";',
    'import { GoogleMapsMap } from "@/components/GoogleMapsMap";\nimport { GoogleDiscoverySheet } from "@/components/GoogleDiscoverySheet";',
    "main map import",
)
s = replace_once(
    s,
    '  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "";',
    '  const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";\n  const googleMapId = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID ?? "";',
    "map environment",
)
s = replace_once(
    s,
    '  const [mapLoadState, setMapLoadState] = useState<MapLoadState>(mapboxToken ? "idle" : "missing");',
    '  const [mapLoadState, setMapLoadState] = useState<MapLoadState>(googleMapsApiKey ? "idle" : "missing");',
    "map state",
)

state_anchor = '  const [dataManagementOpen, setDataManagementOpen] = useState(false);\n'
if 'googleDiscoveryOpen' not in s:
    s = replace_once(
        s,
        state_anchor,
        state_anchor + '  const [googleDiscoveryOpen, setGoogleDiscoveryOpen] = useState(false);\n',
        "discovery state",
    )

old_more = '<button type="button" onClick={() => setDataManagementOpen(true)} className="ml-3 mt-4 text-[11px] font-semibold text-[#00D9FF]">{settings.language === "en" ? "Search more places" : "ค้นหาเพิ่มเติม"}</button>'
new_more = '<button type="button" onClick={() => setGoogleDiscoveryOpen(true)} className="ml-3 mt-4 text-[11px] font-semibold text-[#00D9FF]">{settings.language === "en" ? "Search more places" : "ค้นหาเพิ่มเติม"}</button>'
if old_more in s:
    s = s.replace(old_more, new_more, 1)

start_marker = '                {mapboxToken ? ('
next_marker = '\n\n                <div className="absolute left-1/2 top-4 z-20 -translate-x-1/2">'
if start_marker not in s or next_marker not in s:
    raise SystemExit("Migration anchor not found: map runtime block")
start = s.index(start_marker)
end = s.index(next_marker, start)
google_block = '''                {googleMapsApiKey ? (
                  <>
                    <GoogleMapsMap
                      apiKey={googleMapsApiKey}
                      mapId={googleMapId}
                      places={mapVisiblePlaces}
                      origin={origin}
                      radiusMeters={radiusMeters}
                      selectedPlace={selectedPlace}
                      center={mapSearchCenter}
                      onSelectPlace={(place) => { addRecent(place); setSelectedPlace(place); }}
                      onMoveEnd={(next) => {
                        const moved = Math.abs(next.lat - mapSearchCenter.lat) > 0.0008 || Math.abs(next.lng - mapSearchCenter.lng) > 0.0008;
                        if (moved) { setPendingMapCenter(next); setShowSearchArea(true); }
                      }}
                      onStateChange={(state) => setMapLoadState(state)}
                    />
                    {(mapLoadState === "idle" || mapLoadState === "loading") && <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-[#02060D]/55 backdrop-blur-[2px]"><div className="amd-glass flex items-center gap-2 rounded-full px-4 py-2 text-[10px] text-[var(--amd-text-2)]"><LoaderCircle className="h-4 w-4 animate-spin text-[#00D9FF]" />{settings.language === "en" ? "Loading Google Maps" : "กำลังโหลด Google Maps"}</div></div>}
                    {mapLoadState === "error" && <div className="absolute bottom-5 left-4 right-4 z-10"><div className="amd-glass-strong amd-card max-w-[320px] p-4 text-left"><p className="text-[12px] font-semibold">{settings.language === "en" ? "Google Maps could not load" : "โหลด Google Maps ไม่สำเร็จ"}</p><p className="mt-1 text-[9px] leading-4 text-[var(--amd-text-2)]">{settings.language === "en" ? "Stored place data remains available from the Around My Dorm database." : "ข้อมูลร้านที่บันทึกไว้ยังใช้งานได้จากฐานข้อมูล Around My Dorm"}</p></div></div>}
                  </>
                ) : (
                  <div className="amd-hero-map amd-map-fallback rounded-none border-0">
                    <MiniMapArtwork />
                    <div className="absolute bottom-5 left-4 right-4 z-10"><div className="amd-glass-strong amd-card max-w-[320px] p-4 text-left"><div className="flex items-start gap-3"><MapIcon className="mt-0.5 h-6 w-6 shrink-0 text-[#00D9FF]" /><div><p className="text-[12px] font-semibold">{settings.language === "en" ? "Google Maps is not configured" : "ยังไม่ได้ตั้งค่า Google Maps"}</p><p className="mt-1 text-[9px] leading-4 text-[var(--amd-text-2)]">Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY and NEXT_PUBLIC_GOOGLE_MAP_ID to Cloudflare build variables.</p></div></div></div></div>
                  </div>
                )}'''
s = s[:start] + google_block + s[end:]

search_area_anchor = '{showSearchArea && pendingMapCenter && <button type="button" onClick={() => { setMapSearchCenter(pendingMapCenter); setPendingMapCenter(null); setSelectedPlace(null); setShowSearchArea(false); }} className="amd-btn amd-btn-primary absolute left-1/2 top-[64px] z-20 -translate-x-1/2 rounded-full px-4 py-2 text-[10px] font-bold shadow-xl">{copy.searchThisArea}</button>}'
if search_area_anchor in s and 'Search Google for more places' not in s:
    s = s.replace(
        search_area_anchor,
        search_area_anchor + '{showSearchArea && <button type="button" onClick={() => setGoogleDiscoveryOpen(true)} className="amd-glass absolute left-1/2 top-[108px] z-20 -translate-x-1/2 whitespace-nowrap rounded-full px-4 py-2 text-[9px] font-semibold text-[#8ecbff]">{settings.language === "en" ? "Search Google for more places" : "ค้นหา Google เพิ่มเติม"}</button>}',
        1,
    )

bottom_anchor = '      {dataManagementOpen && <DataManagement places={allPlaces} databaseSource={databaseSource} language={settings.language} onClose={() => setDataManagementOpen(false)} onReload={() => { void reloadDatabase(); }} />}\n'
discovery = '      {googleDiscoveryOpen && <GoogleDiscoverySheet initialQuery={query || (category !== "all" ? CATEGORY_MAP[category]?.name || "" : "")} center={mapSearchCenter} radiusMeters={radiusMeters} language={settings.language} onClose={() => setGoogleDiscoveryOpen(false)} onReviewCandidate={(candidate) => { try { sessionStorage.setItem("around-dorm-google-candidate-review-v1", JSON.stringify(candidate)); } catch {} setGoogleDiscoveryOpen(false); setDataManagementOpen(true); showToast(settings.language === "en" ? "Candidate opened for admin review" : "ส่ง Candidate ไปหน้า Data Management แล้ว"); }} />}\n'
if 'around-dorm-google-candidate-review-v1' not in s:
    s = replace_once(s, bottom_anchor, discovery + bottom_anchor, "discovery sheet mount")

p.write_text(s)


# 2) Place Detail: optional live enrichment only, never required for local data.
p = Path("components/PlaceDetail.tsx")
s = p.read_text()
if 'GoogleLiveEnrichment' not in s:
    s = replace_once(
        s,
        'import { PlacePhoto, PlacePhotoAttribution } from "@/components/PlacePhoto";',
        'import { PlacePhoto, PlacePhotoAttribution } from "@/components/PlacePhoto";\nimport { GoogleLiveEnrichment } from "@/components/GoogleLiveEnrichment";',
        "detail live import",
    )
    s = replace_once(
        s,
        '            {gallery.length > 1 && (\n',
        '            <GoogleLiveEnrichment place={place} language={language} />\n\n            {gallery.length > 1 && (\n',
        "detail live panel",
    )
p.write_text(s)


# 3) Data Management: 30/60/90 scopes, explicit Google-ID check and temp candidate review.
p = Path("components/DataManagement.tsx")
s = p.read_text()
if 'GoogleMaintenancePanel' not in s:
    s = replace_once(
        s,
        'import { CATEGORIES } from "@/data/categories";',
        'import { CATEGORIES } from "@/data/categories";\nimport { GoogleMaintenancePanel } from "@/components/GoogleMaintenancePanel";',
        "maintenance panel import",
    )

candidate_state_anchor = '  const [selectedPlaceIds, setSelectedPlaceIds] = useState<string[]>([]);\n'
if 'googleCandidate' not in s:
    candidate_state = candidate_state_anchor + '''  const [googleCandidate, setGoogleCandidate] = useState<any>(() => {
    if (typeof window === "undefined") return null;
    try { return JSON.parse(sessionStorage.getItem("around-dorm-google-candidate-review-v1") || "null"); } catch { return null; }
  });
'''
    s = replace_once(s, candidate_state_anchor, candidate_state, "candidate review state")

s = s.replace(
    '{ label: language === "en" ? "Stale" : "ข้อมูลเก่า", value: summary.stale }',
    '{ label: language === "en" ? "Stale" : "ข้อมูลเก่า", value: summary.stale + summary.staleSoon }',
    1,
)

old_options = '<option value="all">{language === "en" ? "All places" : "ทุกสถานที่"}</option><option value="older14">{language === "en" ? "Older than 14 days" : "เก่ากว่า 14 วัน"}</option><option value="older30">{language === "en" ? "Older than 30 days" : "เก่ากว่า 30 วัน"}</option><option value="older90">{language === "en" ? "Older than 90 days" : "เก่ากว่า 90 วัน"}</option><option value="restaurants_cafes">{language === "en" ? "Restaurants & cafes" : "ร้านอาหารและคาเฟ่"}</option><option value="parking">{language === "en" ? "Parking only" : "ที่จอดรถเท่านั้น"}</option><option value="category">{language === "en" ? "Selected category" : "เลือกหมวด"}</option><option value="area">{language === "en" ? "Selected area" : "เลือกพื้นที่"}</option><option value="selected">{language === "en" ? "Selected places only" : "เลือกเฉพาะร้าน"}</option>'
new_options = '<option value="all">{language === "en" ? "All places" : "ทุกสถานที่"}</option><option value="older30">{language === "en" ? "Older than 30 days" : "เก่ากว่า 30 วัน"}</option><option value="older60">{language === "en" ? "Older than 60 days" : "เก่ากว่า 60 วัน"}</option><option value="older90">{language === "en" ? "Older than 90 days" : "เก่ากว่า 90 วัน"}</option><option value="restaurants">{language === "en" ? "Restaurants only" : "ร้านอาหารเท่านั้น"}</option><option value="cafes">{language === "en" ? "Cafes only" : "คาเฟ่เท่านั้น"}</option><option value="restaurants_cafes">{language === "en" ? "Restaurants & cafes" : "ร้านอาหารและคาเฟ่"}</option><option value="parking">{language === "en" ? "Parking only" : "ที่จอดรถเท่านั้น"}</option><option value="category">{language === "en" ? "Selected category" : "เลือกหมวด"}</option><option value="area">{language === "en" ? "Selected area" : "เลือกพื้นที่"}</option><option value="selected">{language === "en" ? "Selected places only" : "เลือกเฉพาะร้าน"}</option>'
s = replace_once(s, old_options, new_options, "30/60/90 options")

audit_anchor = '        {auditDone && <section className="amd-glass amd-card mt-4 p-4">'
if '<GoogleMaintenancePanel places={selected}' not in s:
    candidate_panel = '''        {googleCandidate && <section className="amd-glass amd-card mt-4 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#00D9FF]">NEW PLACE CANDIDATE</p><p className="mt-1 text-[13px] font-semibold">{googleCandidate.name || "Google candidate"}</p><p className="mt-1 text-[8px] leading-4 text-[var(--amd-text-3)]">{googleCandidate.address || "—"}</p><p className="mt-1 text-[8px] text-[var(--amd-text-3)]">Google Place ID: {googleCandidate.googlePlaceId || "—"}</p></div><button type="button" onClick={() => { try { sessionStorage.removeItem("around-dorm-google-candidate-review-v1"); } catch {} setGoogleCandidate(null); }} className="amd-chip h-9 min-h-0 px-3 text-[8px]">{language === "en" ? "Ignore" : "ไม่ใช้"}</button></div><div className="mt-3 rounded-xl border border-amber-300/10 bg-amber-300/[0.05] p-3 text-[8px] leading-4 text-amber-100">{language === "en" ? "Temporary Google discovery candidate. Verify with an owned/authorized source before creating or updating a permanent internal record. Google Place ID may remain as the external identity link." : "Candidate ชั่วคราวจาก Google • ให้ตรวจด้วยแหล่ง Owned/Authorized ก่อนเพิ่มหรือแก้ข้อมูลถาวร โดยเก็บ Google Place ID เป็นตัวเชื่อมภายนอกได้"}</div></section>}

        <GoogleMaintenancePanel places={selected} language={language} />

'''
    s = replace_once(s, audit_anchor, candidate_panel + audit_anchor, "maintenance panel mount")

p.write_text(s)


# 4) Normal Google map load only includes marker library. Places is dynamically imported
# only by explicit discovery/live-enrichment actions.
p = Path("lib/google-maps.ts")
s = p.read_text()
s = s.replace("&v=weekly&libraries=places,marker&language=th&region=TH", "&v=weekly&libraries=marker&language=th&region=TH", 1)
p.write_text(s)

print("Google Maps runtime migration patches applied")

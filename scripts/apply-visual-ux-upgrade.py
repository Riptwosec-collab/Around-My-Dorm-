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

    text = replace_once(
        text,
        '  LocateFixed,\n  Map as MapIcon,',
        '  LocateFixed,\n  LoaderCircle,\n  Map as MapIcon,',
        "LoaderCircle import",
    )
    text = replace_once(
        text,
        'import { MapBottomSheet } from "@/components/MapBottomSheet";',
        'import { MapBottomSheet } from "@/components/MapBottomSheet";\nimport { Toast, type ToastTone } from "@/components/Toast";',
        "Toast import",
    )

    text = replace_once(
        text,
        '<div className="absolute left-[12%] top-[18%] grid h-8 w-8 place-items-center rounded-full border border-[rgba(0,229,195,.28)] bg-[#061424]/90 text-[15px]">☕</div>\n      <div className="absolute bottom-[15%] right-[15%] grid h-8 w-8 place-items-center rounded-full border border-[rgba(155,108,255,.34)] bg-[#07111f]/90 text-[15px]">🛍️</div>',
        '<div className="absolute left-[12%] top-[18%] grid h-8 w-8 place-items-center rounded-full border border-[rgba(232,238,248,.22)] bg-[#061424]/90 text-[#e8eef8]"><Coffee className="h-4 w-4" /></div>\n      <div className="absolute bottom-[17%] left-[38%] grid h-8 w-8 place-items-center rounded-full border border-[rgba(255,157,60,.24)] bg-[#07111f]/90 text-[#ff9d3c]"><Utensils className="h-4 w-4" /></div>\n      <div className="absolute bottom-[15%] right-[15%] grid h-8 w-8 place-items-center rounded-full border border-[rgba(0,122,255,.3)] bg-[#07111f]/90 text-[#149CFF]"><Car className="h-4 w-4" /></div>',
        "hero category icons",
    )

    text = replace_once(
        text,
        '  const [foodNowOpen, setFoodNowOpen] = useState(false);',
        '  const [foodNowOpen, setFoodNowOpen] = useState(false);\n  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);',
        "toast state",
    )

    text = replace_once(
        text,
        '  function isFavorite(place: Place) {',
        '  function showToast(message: string, tone: ToastTone = "success") {\n    setToast({ message, tone });\n  }\n\n  function isFavorite(place: Place) {',
        "toast helper",
    )

    old_toggle = '''  function toggleFavorite(place: Place) {
    setFavorites((current) => {
      const exists = current.some((saved) => saved.id === place.id || (saved.googlePlaceId && place.googlePlaceId === saved.googlePlaceId));
      const next = exists
        ? current.filter((saved) => !(saved.id === place.id || (saved.googlePlaceId && place.googlePlaceId === saved.googlePlaceId)))
        : [place, ...current].slice(0, 100);
      localStorage.setItem("around-dorm-favorites-v2", JSON.stringify(next));
      setCollections((currentCollections) => currentCollections.map((collection) => {
        if (exists) return { ...collection, placeIds: collection.placeIds.filter((id) => id !== place.id) };
        if (collection.id === "wishlist") return { ...collection, placeIds: Array.from(new Set([place.id, ...collection.placeIds])) };
        return collection;
      }));
      return next;
    });
  }'''
    new_toggle = '''  function toggleFavorite(place: Place) {
    const removing = isFavorite(place);
    setFavorites((current) => {
      const exists = current.some((saved) => saved.id === place.id || (saved.googlePlaceId && place.googlePlaceId === saved.googlePlaceId));
      const next = exists
        ? current.filter((saved) => !(saved.id === place.id || (saved.googlePlaceId && place.googlePlaceId === saved.googlePlaceId)))
        : [place, ...current].slice(0, 100);
      localStorage.setItem("around-dorm-favorites-v2", JSON.stringify(next));
      setCollections((currentCollections) => currentCollections.map((collection) => {
        if (exists) return { ...collection, placeIds: collection.placeIds.filter((id) => id !== place.id) };
        if (collection.id === "wishlist") return { ...collection, placeIds: Array.from(new Set([place.id, ...collection.placeIds])) };
        return collection;
      }));
      return next;
    });
    showToast(removing ? (settings.language === "en" ? "Removed from Saved" : "นำออกจากบันทึกแล้ว") : (settings.language === "en" ? "Saved" : "บันทึกแล้ว"), removing ? "removed" : "success");
  }'''
    text = replace_once(text, old_toggle, new_toggle, "favorite feedback")

    old_collection = '''  function toggleFavoriteCollection(place: Place, collectionId: string) {
    setCollections((current) => current.map((collection) => collection.id !== collectionId ? collection : { ...collection, placeIds: collection.placeIds.includes(place.id) ? collection.placeIds.filter((id) => id !== place.id) : Array.from(new Set([place.id, ...collection.placeIds])) }));
  }'''
    new_collection = '''  function toggleFavoriteCollection(place: Place, collectionId: string) {
    const target = collections.find((collection) => collection.id === collectionId);
    const adding = !target?.placeIds.includes(place.id);
    setCollections((current) => current.map((collection) => collection.id !== collectionId ? collection : { ...collection, placeIds: collection.placeIds.includes(place.id) ? collection.placeIds.filter((id) => id !== place.id) : Array.from(new Set([place.id, ...collection.placeIds])) }));
    if (target) showToast(adding ? `✓ ${settings.language === "en" ? "Added to" : "เพิ่มไปยัง"} ${target.title}` : `${settings.language === "en" ? "Removed from" : "นำออกจาก"} ${target.title}`, adding ? "success" : "removed");
  }'''
    text = replace_once(text, old_collection, new_collection, "collection feedback")

    # Native page entrance across all real tabs.
    text = text.replace('className="amd-page"', 'className="amd-page amd-page-enter"')

    # Explore search: preserve results while refreshing, add activity + clear controls.
    text = replace_once(
        text,
        'className="h-14 w-full rounded-[20px] bg-transparent pl-12 pr-14 text-[13px] font-medium text-[var(--amd-text)] outline-none placeholder:text-[var(--amd-text-3)]"',
        'className="h-14 w-full rounded-[20px] bg-transparent pl-12 pr-[118px] text-[13px] font-medium text-[var(--amd-text)] outline-none placeholder:text-[var(--amd-text-3)]"',
        "explore search padding",
    )
    old_explore_filter = '''                <button type="button" onClick={() => setFilterOpen(true)} className="amd-btn absolute right-2 top-1/2 grid h-10 w-10 min-h-0 -translate-y-1/2 place-items-center rounded-xl border border-[rgba(120,160,210,.18)] bg-white/[0.035] text-[var(--amd-text-2)]">
                  <SlidersHorizontal className="h-[18px] w-[18px]" />
                  {filtersCount > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#007AFF] px-1 text-[8px] font-bold text-white">{filtersCount}</span>}
                </button>'''
    new_explore_filter = '''                <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                  {loadingPlaces && <LoaderCircle aria-label={settings.language === "en" ? "Updating" : "กำลังอัปเดต"} className="h-4 w-4 animate-spin text-[#00D9FF]" />}
                  {query && <button type="button" aria-label={settings.language === "en" ? "Clear search" : "ล้างคำค้นหา"} onClick={() => setQuery("")} className="amd-btn grid h-9 w-9 min-h-0 place-items-center rounded-xl text-[var(--amd-text-3)]"><X className="h-4 w-4" /></button>}
                  <button type="button" aria-label={settings.language === "en" ? "Filters" : "ตัวกรอง"} onClick={() => setFilterOpen(true)} className="amd-btn relative grid h-10 w-10 min-h-0 place-items-center rounded-xl border border-[rgba(120,160,210,.18)] bg-white/[0.035] text-[var(--amd-text-2)]">
                    <SlidersHorizontal className="h-[18px] w-[18px]" />
                    {filtersCount > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#007AFF] px-1 text-[8px] font-bold text-white">{filtersCount}</span>}
                  </button>
                </div>'''
    text = replace_once(text, old_explore_filter, new_explore_filter, "explore search controls")

    text = replace_once(
        text,
        '{locationError && <div className="mt-3 rounded-xl border border-rose-300/15 bg-rose-300/[0.05] px-3 py-2 text-[10px] text-rose-200">{locationError}</div>}',
        '{locationError && <div className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.05] px-3 py-2 text-[10px] text-amber-100">{locationError}</div>}\n              {loadingPlaces && visiblePlaces.length > 0 && <div className="mt-2 flex items-center gap-2 text-[10px] text-[var(--amd-text-3)]"><LoaderCircle className="h-3.5 w-3.5 animate-spin text-[#00D9FF]" />{settings.language === "en" ? "Updating live data" : "กำลังอัปเดตข้อมูล"}</div>}',
        "smart refresh indicator",
    )

    old_empty = '{!visiblePlaces.length && !loadingPlaces && <div className="amd-glass amd-card p-8 text-center"><Search className="mx-auto h-8 w-8 text-[var(--amd-text-3)]" /><p className="mt-3 text-[14px] font-semibold">{copy.noMatches}</p><button type="button" onClick={() => { setFilters(EMPTY_FILTERS); setCategory("all"); setQuery(""); setQuickFilter(null); }} className="mt-3 text-[11px] font-semibold text-[#149CFF]">{copy.clearFilters}</button></div>}'
    new_empty = '''{!visiblePlaces.length && !loadingPlaces && <div className="amd-glass amd-card p-7 text-center"><Search className="mx-auto h-7 w-7 text-[var(--amd-text-3)]" /><p className="mt-3 text-[14px] font-semibold">{copy.noMatches}</p><p className="mt-1 text-[10px] leading-5 text-[var(--amd-text-3)]">{settings.language === "en" ? "Try cafe, mookata or parking" : "ลองค้นหา: ร้านกาแฟ • หมูกระทะ • ที่จอดรถ"}</p><div className="mt-4 flex flex-wrap justify-center gap-2"><button type="button" onClick={() => { setQuery(""); setCategory("cafe"); setFilters(EMPTY_FILTERS); }} className="amd-chip px-3 text-[10px]">ร้านกาแฟ</button><button type="button" onClick={() => { setQuery("หมูกระทะ"); setCategory("all"); setFilters(EMPTY_FILTERS); }} className="amd-chip px-3 text-[10px]">หมูกระทะ</button><button type="button" onClick={() => { setQuery(""); setCategory("parking"); setFilters(EMPTY_FILTERS); }} className="amd-chip px-3 text-[10px]">ที่จอดรถ</button></div><button type="button" onClick={() => { setFilters(EMPTY_FILTERS); setCategory("all"); setQuery(""); setQuickFilter(null); }} className="mt-4 text-[11px] font-semibold text-[#149CFF]">{copy.clearFilters}</button></div>}'''
    text = replace_once(text, old_empty, new_empty, "empty state suggestions")

    # Map search clear affordance.
    map_input = 'className="h-14 w-full rounded-[20px] bg-transparent pl-12 pr-14 text-[13px] outline-none placeholder:text-[var(--amd-text-3)]"'
    text = replace_once(text, map_input, 'className="h-14 w-full rounded-[20px] bg-transparent pl-12 pr-[104px] text-[13px] outline-none placeholder:text-[var(--amd-text-3)]"', "map search padding")
    old_map_filter = '<button type="button" onClick={() => setFilterOpen(true)} className="absolute right-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-xl border border-[rgba(120,160,210,.18)] bg-white/[0.035]"><SlidersHorizontal className="h-4 w-4" /></button>'
    new_map_filter = '<div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">{loadingPlaces && <LoaderCircle className="h-4 w-4 animate-spin text-[#00D9FF]" />}{query && <button type="button" aria-label={settings.language === "en" ? "Clear search" : "ล้างคำค้นหา"} onClick={() => setQuery("")} className="amd-btn grid h-9 w-9 min-h-0 place-items-center rounded-xl text-[var(--amd-text-3)]"><X className="h-4 w-4" /></button>}<button type="button" aria-label={settings.language === "en" ? "Filters" : "ตัวกรอง"} onClick={() => setFilterOpen(true)} className="amd-btn grid h-10 w-10 min-h-0 place-items-center rounded-xl border border-[rgba(120,160,210,.18)] bg-white/[0.035]"><SlidersHorizontal className="h-4 w-4" /></button></div>'
    text = replace_once(text, old_map_filter, new_map_filter, "map search controls")

    # Selected AdvancedMarker pulses once; clusters use Midnight custom renderer.
    old_marker = 'if (mapId && markerLib) { const pin = new markerLib.PinElement({ background: selected ? "#ffffff" : color, borderColor: selected ? "#00D9FF" : "#d8e4f5", glyphColor: selected ? "#007AFF" : "#07101b", scale: selected ? 1.2 : .9 }); return new markerLib.AdvancedMarkerElement({ map: mapRef.current, position, title, content: pin.element }); }'
    new_marker = 'if (mapId && markerLib) { const pin = new markerLib.PinElement({ background: selected ? "#ffffff" : color, borderColor: selected ? "#00D9FF" : "#d8e4f5", glyphColor: selected ? "#007AFF" : "#07101b", scale: selected ? 1.2 : .9 }); if (selected) pin.element.classList.add("amd-marker-selected"); return new markerLib.AdvancedMarkerElement({ map: mapRef.current, position, title, content: pin.element }); }'
    text = replace_once(text, old_marker, new_marker, "selected marker motion")

    text = replace_once(
        text,
        'if (placeMarkers.length) clustererRef.current = new MarkerClusterer({ map: mapRef.current, markers: placeMarkers });',
        '''if (placeMarkers.length) {
        const renderer: any = { render: ({ count, position }: any) => new window.google.maps.Marker({ position, icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 17, fillColor: "#061424", fillOpacity: .96, strokeColor: "#008CFF", strokeOpacity: .92, strokeWeight: 2 }, label: { text: String(count), color: "#F7F9FC", fontSize: "11px", fontWeight: "700" }, zIndex: 1000 + count }) };
        clustererRef.current = new MarkerClusterer({ map: mapRef.current, markers: placeMarkers, renderer });
      }''',
        "cluster renderer",
    )

    # Nav micro-motion and consistent active indicator.
    text = replace_once(
        text,
        'className={`relative flex min-w-0 flex-col items-center justify-center gap-1 text-[9px] font-semibold transition ${active ? "amd-nav-active" : "text-[var(--amd-text-3)]"}`}',
        'className={`amd-nav-item relative flex min-w-0 flex-col items-center justify-center gap-1 text-[9px] font-semibold ${active ? "amd-nav-item-active amd-nav-active" : "text-[var(--amd-text-3)]"}`}',
        "nav motion class",
    )
    text = replace_once(
        text,
        '{active && <span className="absolute top-0 h-[2px] w-8 rounded-full bg-[#19E6FF] shadow-[0_0_16px_rgba(25,230,255,.95)]" />}',
        '{active && <span className="amd-nav-indicator absolute top-0 h-[2px] w-8 rounded-full bg-[#19E6FF] shadow-[0_0_14px_rgba(25,230,255,.72)]" />}',
        "nav indicator",
    )

    text = replace_once(
        text,
        '{filterOpen && <FilterSheet value={filters} onChange={setFilters} onClose={() => setFilterOpen(false)} />}',
        '{filterOpen && <FilterSheet value={filters} onChange={setFilters} onClose={() => setFilterOpen(false)} resultCount={visiblePlaces.length} />}',
        "filter result count",
    )

    text = replace_once(
        text,
        '{foodNowOpen && <FoodNowSheet language={settings.language} defaultRadius={radiusMeters} onClose={() => setFoodNowOpen(false)} onSubmit={recommendFoodNow} />}\n    </main>',
        '{foodNowOpen && <FoodNowSheet language={settings.language} defaultRadius={radiusMeters} onClose={() => setFoodNowOpen(false)} onSubmit={recommendFoodNow} />}\n      {toast && <Toast message={toast.message} tone={toast.tone} onDone={() => setToast(null)} />}\n    </main>',
        "toast render",
    )

    path.write_text(text, encoding="utf-8")


def patch_detail() -> None:
    path = ROOT / "components/PlaceDetail.tsx"
    text = path.read_text(encoding="utf-8")
    text = replace_once(
        text,
        '<div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/65 backdrop-blur-sm">',
        '<div className="amd-sheet-backdrop">',
        "detail backdrop",
    )
    text = replace_once(
        text,
        '<section className="relative max-h-[92dvh] w-full max-w-[520px] overflow-y-auto rounded-t-[34px] border border-white/10 bg-[#08111d]/98 shadow-2xl">',
        '<section className="amd-sheet amd-glass-strong relative max-h-[92dvh] w-full max-w-[520px] overflow-y-auto rounded-t-[34px] border-b-0 shadow-2xl">',
        "detail surface",
    )
    text = text.replace('bg-[#08111d]/90', 'bg-[var(--amd-glass-strong)]')
    text = text.replace('font-black', 'font-bold')
    text = text.replace('fill-pink-400 text-pink-300', 'amd-heart-saved fill-[#008CFF] text-[#149CFF]')
    text = text.replace('className={`h-5 w-5 ${saved ?', 'className={`amd-heart h-5 w-5 ${saved ?')
    text = text.replace('border-pink-300/15 bg-pink-300/[0.08] px-2.5 py-2 text-[10px] font-bold text-pink-100', 'border-[rgba(0,140,255,.24)] bg-[rgba(0,122,255,.07)] px-2.5 py-2 text-[10px] font-bold text-[#8ecbff]')
    text = text.replace('🔥 Local Pick', 'Local Pick')
    text = text.replace('fill-cyan-300 text-cyan-300', 'fill-[#FFC341] text-[#FFC341]')
    path.write_text(text, encoding="utf-8")


def write_responsive_tests() -> None:
    path = ROOT / "e2e/visual-regression.spec.ts"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(r'''import { expect, test } from "@playwright/test";

const viewports = [
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 393, height: 852 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1280, height: 900 },
];

test("major responsive widths do not overflow and primary controls remain reachable", async ({ page }) => {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "สำรวจ", exact: true })).toBeVisible();
    await expect(page.getByRole("navigation")).toBeVisible();
    const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.innerWidth + 1);
  }
});

test("map, saved, recent and settings real routes remain viewport safe", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["/map/", "/saved/", "/recent/", "/settings/"]) {
    await page.goto(route);
    await expect(page.getByRole("navigation")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }
});

test("light theme and reduced motion keep the same usable layout", async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await page.goto("/");
  await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
  const lightBg = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--amd-bg").trim());
  expect(lightBg.toLowerCase()).toBe("#eef5ff");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const duration = await page.locator(".amd-page").first().evaluate((element) => getComputedStyle(element).animationDuration);
  expect(["0s", "0.00001s", "0.001s"]).toContain(duration);
});
''', encoding="utf-8")


if __name__ == "__main__":
    patch_app()
    patch_detail()
    write_responsive_tests()
    print("Visual / graphics / motion / UX-UI finishing upgrade applied.")

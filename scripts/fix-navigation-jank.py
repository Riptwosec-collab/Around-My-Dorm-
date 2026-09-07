from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"Patch anchor not found: {label}")
    return text.replace(old, new, 1)


app = Path("components/AroundMyDormApp.tsx")
s = app.read_text()

old = 'import { loadPlacesFromDatabase } from "@/lib/database/places";'
new = old + '\nimport { loadGoogleMaps } from "@/lib/google-maps";'
s = replace_once(s, old, new, "google maps preload import")

helper_anchor = 'export function AroundMyDormApp({ initialTab = "explore" }: { initialTab?: Tab }) {'
helper = '''const TAB_ROUTES: Record<Tab, string> = {
  explore: "/",
  map: "/map/",
  favorites: "/saved/",
  recent: "/recent/",
  settings: "/settings/",
};

function tabFromPath(pathname: string): Tab {
  if (pathname.startsWith("/map")) return "map";
  if (pathname.startsWith("/saved") || pathname.startsWith("/favorites")) return "favorites";
  if (pathname.startsWith("/recent")) return "recent";
  if (pathname.startsWith("/settings")) return "settings";
  return "explore";
}

'''
if "const TAB_ROUTES:" not in s:
    if helper_anchor not in s:
        raise SystemExit("Patch anchor not found: tab route helper")
    s = s.replace(helper_anchor, helper + helper_anchor, 1)

copy_anchor = '  const copy = getCopy(settings.language);\n\n'
effects = '''  const copy = getCopy(settings.language);

  // Warm the Maps JavaScript bundle after first paint so opening Map does not
  // compete with the initial UI render. This does not create a map instance.
  useEffect(() => {
    if (!googleMapsApiKey || typeof window === "undefined" || window.google?.maps) return;
    const timer = window.setTimeout(() => {
      void loadGoogleMaps(googleMapsApiKey).catch(() => {});
    }, 900);
    return () => window.clearTimeout(timer);
  }, [googleMapsApiKey]);

  // Keep bottom-tab navigation inside the mounted app. router.push here used to
  // remount the full shell, reload the database, and replay page entry animation.
  useEffect(() => {
    const syncTabFromUrl = () => {
      setSelectedPlace(null);
      setTab(tabFromPath(window.location.pathname));
    };
    window.addEventListener("popstate", syncTabFromUrl);
    return () => window.removeEventListener("popstate", syncTabFromUrl);
  }, []);

'''
if "Keep bottom-tab navigation inside the mounted app" not in s:
    if copy_anchor not in s:
        raise SystemExit("Patch anchor not found: navigation effects")
    s = s.replace(copy_anchor, effects, 1)

old_change = '''  function changeTab(next: Tab) {
    setSelectedPlace(null); setTab(next);
    const routes: Record<Tab, string> = { explore: "/", map: "/map/", favorites: "/saved/", recent: "/recent/", settings: "/settings/" };
    router.push(routes[next]);
  }

  function openMap(place: Place) {
    addRecent(place); setTab("map"); setSelectedPlace(place); router.push(`/map/?place=${encodeURIComponent(place.slug)}`);
  }
'''
new_change = '''  function changeTab(next: Tab) {
    if (next === tab) return;
    setSelectedPlace(null);
    setTab(next);
    if (typeof window !== "undefined") {
      const route = TAB_ROUTES[next];
      if (window.location.pathname !== route || window.location.search) {
        window.history.pushState({ amdTab: next }, "", route);
      }
    }
  }

  function openMap(place: Place) {
    addRecent(place);
    setTab("map");
    setSelectedPlace(place);
    if (typeof window !== "undefined") {
      window.history.pushState({ amdTab: "map", place: place.slug }, "", `/map/?place=${encodeURIComponent(place.slug)}`);
    }
  }
'''
s = replace_once(s, old_change, new_change, "tab navigation functions")
s = s.replace('(mapLoadState === "idle" || mapLoadState === "loading")', 'mapLoadState === "loading"')
app.write_text(s)

maps = Path("components/GoogleMapsMap.tsx")
s = maps.read_text()
old = '''    if (!apiKey || !containerRef.current) return;
    let cancelled = false;
    onStateChange?.("loading");

    void loadGoogleMaps(apiKey)
'''
new = '''    if (!apiKey || !containerRef.current) return;
    let cancelled = false;
    const mapsAlreadyLoaded = Boolean(window.google?.maps);
    if (!mapsAlreadyLoaded) onStateChange?.("loading");

    void loadGoogleMaps(apiKey)
'''
s = replace_once(s, old, new, "map loading state")
maps.write_text(s)

css = Path("app/globals.css")
s = css.read_text()
old = '''.amd-page-enter {
  animation: amd-page-in var(--motion-normal) var(--ease-standard) both;
}
'''
new = '''.amd-page-enter {
  animation: none;
}
'''
s = replace_once(s, old, new, "page entry animation")

mobile_anchor = "@media (max-width: 430px) {"
mobile_perf = '''@media (max-width: 767px) {
  /* Reduce mobile GPU composition cost while preserving the glass look. */
  .amd-glass,
  .amd-input,
  .amd-chip {
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }

  .amd-glass-strong,
  .amd-nav {
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
  }
}

'''
if "Reduce mobile GPU composition cost" not in s:
    if mobile_anchor not in s:
        raise SystemExit("Patch anchor not found: mobile performance media query")
    s = s.replace(mobile_anchor, mobile_perf + mobile_anchor, 1)
css.write_text(s)

print("Navigation performance patches applied")

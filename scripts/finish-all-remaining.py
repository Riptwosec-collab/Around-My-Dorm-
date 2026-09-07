from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "components" / "AroundMyDormApp.tsx"
BUILD = ROOT / ".github" / "workflows" / "build.yml"

text = APP.read_text(encoding="utf-8")
original = text

anchor = 'import type { CategoryId, Place, SortMode } from "@/types/place";\n'
imports = '''import { PageHeader, Toggle, SettingRow, MiniMapArtwork, LoadingCards } from "@/components/AppShellPrimitives";
import {
  COLLECTIONS_KEY,
  DEFAULT_COLLECTIONS,
  DEFAULT_SETTINGS,
  FOOD_CATEGORIES,
  RADII,
  RECENT_META_KEY,
  SETTINGS_KEY,
  SORT_OPTIONS,
  TAB_ROUTES,
  tabFromPath,
  type AppSettings,
  type Language,
  type MapLoadState,
  type OriginMode,
  type QuickFilter,
  type SavedCollection,
  type Tab,
} from "@/lib/app-shell-config";
import {
  activeFilterCount,
  explicitPriceCeiling,
  passesFilters,
  recommendationReasons,
  smartLocalPicks,
  sortPlaces,
  type RecommendationContext,
} from "@/lib/place-ranking";
'''
if imports not in text:
    if anchor not in text:
        raise SystemExit("Could not find AroundMyDormApp import anchor")
    text = text.replace(anchor, anchor + imports, 1)

# Move shell types/constants to lib/app-shell-config.ts.
text, count = re.subn(
    r'type Tab = "explore".*?const SORT_OPTIONS: \{ id: SortMode; label: string \}\[] = \[.*?\n\];\n\n',
    '',
    text,
    count=1,
    flags=re.S,
)
if count != 1 and 'type Tab = "explore"' in text:
    raise SystemExit("Failed to extract app shell config block")

# Move filter/ranking logic to lib/place-ranking.ts while keeping date-label helper local.
text, count = re.subn(
    r'function activeFilterCount\(.*?\n}\n\nfunction relativeViewedLabel',
    'function relativeViewedLabel',
    text,
    count=1,
    flags=re.S,
)
if count != 1 and 'function activeFilterCount' in text:
    raise SystemExit("Failed to extract place ranking block")

# Move reusable shell UI primitives and route helpers out of the monolith.
text, count = re.subn(
    r'function PageHeader\(.*?\nexport function AroundMyDormApp',
    'export function AroundMyDormApp',
    text,
    count=1,
    flags=re.S,
)
if count != 1 and 'function PageHeader' in text:
    raise SystemExit("Failed to extract app shell primitive block")

all_places = '  const allPlaces = useMemo(() => databasePlaces.map((place) => withDistance(place, origin)), [databasePlaces, origin]);\n'
context = '''  const recommendationContext = useMemo<RecommendationContext>(() => ({
    preferredCategories: new Set(settings.preferredCategories || []),
    favoriteIds: new Set(favorites.map((place) => place.id)),
    recentIds: new Set(recentViews.map((view) => view.placeId)),
  }), [settings.preferredCategories, favorites, recentViews]);
'''
if context not in text:
    if all_places not in text:
        raise SystemExit("Could not find allPlaces memo anchor")
    text = text.replace(all_places, all_places + "\n" + context, 1)

text = text.replace(
    'return sortPlaces(data, sortMode, new Set(settings.preferredCategories || []));',
    'return sortPlaces(data, sortMode, recommendationContext);',
)
text = text.replace(
    'sortMode, settings.verifiedOnly, settings.preferredCategories]);',
    'sortMode, settings.verifiedOnly, recommendationContext]);',
)

local_old = '  const localPicks = useMemo(() => visiblePlaces.filter((place) => place.localFavorite || place.placeType === "local" || place.placeType === "independent").slice(0, 4), [visiblePlaces]);'
local_new = '  const localPicks = useMemo(() => smartLocalPicks(visiblePlaces, recommendationContext, 4), [visiblePlaces, recommendationContext]);'
if local_old in text:
    text = text.replace(local_old, local_new, 1)
elif local_new not in text:
    raise SystemExit("Could not find localPicks memo")

# Surface one concise explanation on smart local recommendation cards using the existing contextMeta slot.
marker = '(localPicks.length ? localPicks : visiblePlaces.slice(0, 4)).map((place) => <PlaceCard'
idx = text.find(marker)
if idx >= 0:
    end = text.find('/>)}', idx)
    if end > idx:
        segment = text[idx:end]
        needle = 'language={settings.language}'
        if needle in segment and 'recommendationReasons(' not in segment:
            segment = segment.replace(needle, 'language={settings.language} contextMeta={recommendationReasons(place, recommendationContext, settings.language)[0]}', 1)
            text = text[:idx] + segment + text[end:]

# Remove imports that became unused only after extraction.
for icon in ['  Home,\n']:
    # Home can still be used elsewhere; only remove it when no JSX/function reference remains.
    if icon in text and '<Home ' not in text:
        text = text.replace(icon, '')

if text == original:
    print("AroundMyDormApp already migrated")
else:
    APP.write_text(text, encoding="utf-8")
    print(f"Refactored AroundMyDormApp.tsx: {len(original.splitlines())} -> {len(text.splitlines())} lines")

BUILD.write_text('''name: Build Check

on:
  push:
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: build-${{ github.ref }}
  cancel-in-progress: true

jobs:
  quality:
    runs-on: ubuntu-latest
    timeout-minutes: 18
    env:
      NEXT_TELEMETRY_DISABLED: 1
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci --no-audit --no-fund

      - name: Type check
        run: npm run typecheck

      - name: Lint
        run: npm run lint

      - name: Unit and architecture tests
        run: npm test

      - name: Validate place data
        run: npm run validate:data

      - name: Build production
        run: npm run build

      - name: Validate Cloudflare Workers bundle
        run: npx wrangler deploy --dry-run
''', encoding="utf-8")
print("Upgraded stable CI workflow")

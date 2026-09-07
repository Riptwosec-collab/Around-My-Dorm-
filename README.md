# Around My Dorm Premium

Premium local-discovery web app centered on **บ้านสุภาอพาร์ทเม้นต์ / Baan Supar Apartment** around Lat Phrao 35, Lat Phrao 41 / Phawana, Ratchada 36, Chandrakasem and nearby areas.

## Runtime architecture

```text
AUTHORIZED / OWN PLACE DATA
        ↓
PERIODIC IMPORT / REVIEW
        ↓
AROUND MY DORM DATABASE
        ↓
NORMAL APP USAGE
        ↓
GOOGLE MAPS
```

Google Maps is the **map renderer**. Around My Dorm remains the source of normal place discovery. Opening Explore, Map, Saved, Recent or Settings does not perform bulk Google Places discovery.

Stored places are searched, filtered, sorted and rendered locally. Google Places is used only after an explicit user/admin action for temporary discovery or optional live enrichment.

## Core features

- iPhone 16 Pro-first Premium iOS / glass UI
- Safe Area, Dynamic Island, `100dvh`, touch targets >= 44px
- Responsive Mobile / Tablet / Desktop layouts
- Central place schema in `types/place.ts`
- Database-first place loader with Supabase support and embedded fallback
- Existing business records, Local / Chain, Hidden Gem, parking, pricing, notes and verification metadata preserved
- Search by name, English name, category, type, tags, soi, area, description and menu fields
- Radius: 250 m / 500 m / 1 km / 2 km / 3 km / 5 km
- Baan Supar default origin, current location and custom saved location
- Filters and sorting operate on stored Around My Dorm data
- Saved, Collections and Recently Viewed
- Place Detail and Parking flows preserved
- Google Maps JavaScript API map renderer
- dark map via Google Map ID, with legacy dark styling fallback when no Map ID is supplied
- stored-coordinate business markers with category colors
- distinct Baan Supar / Home marker
- marker clustering
- Google Maps radius circle
- selected-place focus
- Search This Area searches stored data first
- optional explicit “Search Google for more places” flow
- optional live Google Place Detail enrichment when a stored `googlePlaceId` exists
- Data Management with 30 / 60 / 90-day scopes, category/place scopes, progress, diff review, history and rollback
- manual Google Place ID update checks with batching/retry and no automatic persistence of Google live content

## Data and provider policy

Permanent Around My Dorm records should primarily contain user-owned, manually collected, licensed, authorized imported and internal metadata.

`googlePlaceId` may be stored as the stable external identity link where permitted. Google live data is kept conceptually separate from persistent Around My Dorm data.

Normal browsing does **not** copy Google Places into the local database. Temporary Google discovery candidates are reviewed before any internal record is created, and Google live detail enrichment is short-lived and opt-in.

The app does not replace reliable stored information with missing incoming information. High-risk identity changes require review.

## Freshness cycle

Around My Dorm is designed for manual database refresh cycles of roughly **1–3 months**.

Internal freshness states:

- 0–30 days: `FRESH`
- 31–60 days: `AGING`
- 61–90 days: `STALE_SOON`
- 90+ days: `STALE`
- unverified records: `UNVERIFIED`

Default refresh recommendations can vary by category; normal users do not trigger bulk refreshes.

## Environment

Copy `.env.example` to `.env.local` for local development.

```env
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
NEXT_PUBLIC_GOOGLE_MAP_ID=

# Optional persistent database
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Optional server/admin maintenance credential only
GOOGLE_PLACES_API_KEY=
```

Do not hardcode API keys or Map IDs. Restrict the browser key to authorized localhost/production domains in Google Cloud.

Google Cloud configuration normally needs Maps JavaScript API. Places API (New) is needed only for the explicit discovery/live-enrichment features that use it.

## Run locally

```bash
npm install
npm run dev
```

Validation:

```bash
npm run lint
npm run typecheck
npm run validate:data
npm test
npm run build
npx wrangler deploy --dry-run
```

## Cloudflare Workers deployment

This repo uses **Next.js Static Export → Cloudflare Workers Static Assets**.

```bash
npm run build
npm run deploy
```

Recommended Cloudflare Build settings:

```text
Build command: npm run build
Deploy command: npx wrangler deploy
Node.js: 20 or 22
```

Set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and `NEXT_PUBLIC_GOOGLE_MAP_ID` in Cloudflare **Build Variables and Secrets** because `NEXT_PUBLIC_*` values are embedded during the Next.js build.

If Google Maps cannot load, stored Around My Dorm place lists remain available; Google Places failures do not prevent stored place browsing.

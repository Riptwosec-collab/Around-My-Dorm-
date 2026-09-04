# Around My Dorm Premium

Premium local-discovery web app centered on **บ้านสุภาอพาร์ทเม้นต์ / Baan Supar Apartment** around Lat Phrao 35, Lat Phrao 41 / Phawana, Ratchada 36, Chandrakasem and nearby areas.

## Core features

- iPhone 16 Pro-first Premium iOS / glass UI
- Safe Area, Dynamic Island, `100dvh`, touch targets >= 44px
- Responsive Mobile / Tablet / Desktop layouts
- Central place schema in `types/place.ts`
- Single seed dataset in `data/places.ts`
- 18 main place categories
- Search by name, English name, category, type, tags, soi, area, description and menu fields
- 250 ms debounced search
- Radius: 500 m / 1 km / 2 km / 3 km / 5 km
- Use Baan Supar as default origin or switch to the user's real mobile location
- Filters: open now, 24 hours, late night, price, parking, Wi-Fi, power outlet, air-con, delivery, takeaway, work-friendly, student-friendly and verified data
- Sort: recommended, nearest, farthest, rating, reviews, price, open now, local, late night
- Smart Collections
- Place detail bottom sheet
- Google Maps markers colored by category
- `/map/` route
- `/favorites/` route
- Favorites stored in Local Storage
- Recently Viewed: last 10 places without login
- Open-status helper with Bangkok timezone
- Haversine distance + estimated walk/drive time when coordinates are available
- Google Maps search/directions links
- Google Places API (New): Nearby Search + Text Search
- Seed/live data merge and duplicate protection

## Data quality policy

This project does **not** invent prices, ratings, opening hours, phone numbers, coordinates, menus, social links, or parking details.

Seed records that have not been externally confirmed use:

- `verified: false`
- `lastVerified: null`
- unknown fields as `null`
- UI text such as `ยังไม่มีข้อมูลยืนยัน`

When the same place is returned by Google Places, verified live fields such as coordinates, rating, review count, address and open/closed state can be merged into the seed record.

Every place supports `verified`, `lastVerified`, and `source`.

## Main project structure

```text
app/
  page.tsx
  map/page.tsx
  favorites/page.tsx
components/
  AroundMyDormApp.tsx
  FilterSheet.tsx
  PlaceCard.tsx
  PlaceDetail.tsx
data/
  categories.ts
  places.ts
lib/
  google-maps.ts
  place-utils.ts
types/
  place.ts
```

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Add the browser Google Maps key:

```env
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=YOUR_GOOGLE_MAPS_API_KEY
```

Enable in Google Cloud:

- Maps JavaScript API
- Places API (New)
- Billing

Restrict the browser key to your localhost and production domains.

## Cloudflare Workers deployment

This repo uses **Next.js Static Export -> Cloudflare Workers Static Assets**.

```bash
npm run build
npm run deploy
```

`next.config.ts` exports to `out/` and `wrangler.jsonc` deploys `./out`.

Recommended Cloudflare Build settings:

```text
Build command: npm run build
Deploy command: npx wrangler deploy
Node.js: 20 or 22
```

Set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in Cloudflare **Build Variables and Secrets** because `NEXT_PUBLIC_*` values are embedded during the Next.js build.

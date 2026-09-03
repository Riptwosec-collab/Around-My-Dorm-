# Around My Dorm Premium

Mobile-first nearby-place explorer for **บ้านสุภาอพาร์ทเม้นต์ / Soi Lat Phrao 35**, designed around the iPhone 16 Pro viewport.

## Features

- Premium dark / liquid-glass UI
- iPhone safe-area + `100dvh` support
- Nearby search radius: 500 m, 1 km, 2 km, 3 km, 5 km
- Categories: food, cafe, convenience store, laundry, fitness, parking
- Search, rating filters, open-now filter, sort by distance/rating/reviews
- Google Maps full-screen tab with place markers
- Google Places (New) nearby/text search integration
- Saved places with `localStorage`
- Google Maps navigation links
- Fallback nearby places when no API key is configured

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Then add your browser Google Maps key to `.env.local`:

```env
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=YOUR_GOOGLE_MAPS_API_KEY
```

In Google Cloud enable:

- Maps JavaScript API
- Places API (New)
- Billing

Restrict the browser API key to localhost during development and to your production domain when deployed.

## Production

```bash
npm run build
npm start
```

For Vercel, add `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in Project Settings → Environment Variables.

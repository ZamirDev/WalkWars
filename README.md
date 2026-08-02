# WalkWars

Walk. Claim. Conquer the streets.

A territory-conquest fitness game: walk in the real world to claim map tiles as your own. Walk over someone else's tiles to steal them. Territory is color-coded live on an OpenStreetMap map.

Built for **Shipaton 2026** (RevenueCat's global mobile hackathon) with React Native + Expo.

## How it works

- **Claim** — every GPS fix (speed-filtered to ≤8 m/s so vehicles can't cheat) marks tiles within your claim radius as yours. Walking adds strength to your claim.
- **Steal** — walking over another player's tiles adds your strength against theirs; whoever has the most strength owns the tile.
- **Decay** — unvisited territory weakens over time (Pro stops decay).
- **Fitness** — steps, distance, and speed tracked from the same walk. Walking is the whole game.

## Screens

| Route | Screen |
| --- | --- |
| `/` | Live map + walk HUD (start/stop walking, live stats) |
| `/auth` | Sign up / sign in / guest entry |
| `/leaderboard` | Territory score ranking |
| `/profile` | Stats, Pro upsell, sign out |
| `/paywall` | Free vs Pro comparison (RevenueCat subscription — integrated in store build) |

## Stack

- **Expo SDK 57** + React Native (TypeScript)
- **Map:** custom `WebView` + Leaflet over OpenStreetMap tiles (free, no API key)
- **Backend:** Firebase (Auth + Firestore) — anonymous + email/password auth; tiles/users/leaderboard in Firestore
- **Anti-cheat:** speed filter (8 m/s max), mock-location rejection (`loc.mocked`), tile claim radius
- **Monetization (planned):** RevenueCat Pro subscription — 2× claim radius, no tile cap, no decay

## Setup

1. `npm install`
2. Create a Firebase project (see `src/lib/firebase.config.ts`) and paste your web-app config.
   - Enable **Email/Password** + **Anonymous** sign-in (Build → Authentication → Sign-in method).
   - Enable **Firestore Database** and publish the rules in `firestore.rules`.
3. `npm run android` (or `npx expo start` and open in Expo Go on your phone).

## Architecture

```
src/
  app/            expo-router screens
  components/     LeafletMap (WebView + Leaflet bridge)
  lib/
    geo.ts        tile grid, haversine, geohash
    location.ts   GPS tracking + speed filter + claim engine
    db.ts         Firestore data layer (users/tiles/leaderboard)
    firebase.ts   Firebase init + auth helpers
    auth-context.tsx  auth provider
    colors.ts     territory color assignment
```

## Shipaton notes

- Ship Kit milestones: Registration ✅ · RevenueCat project ✅ · first test purchase (in progress) → store API call → first real purchase.
- Winner path: Shipaton regular track (Google Play launch) or Next Gen Award (video + open-source code) — this repo is the open-source half.

import * as Location from 'expo-location';
import { claimTiles, flushWalkStats } from './db';
import { haversine, lerp, tilesInRadius, type LatLng, type TilePoint } from './geo';
import type { WalkStats } from './types';

const MAX_SPEED = 8; // m/s — faster than any runner
const MIN_SPEED = 0.4; // m/s — ignore stationary jitter
const MIN_DISTANCE = 3; // m between accepted fixes
const SAMPLE_STEP = 10; // m between claim sample points along a segment
const FLUSH_MS = 30000;

let subscription: Location.LocationSubscription | null = null;
let lastFix: { coords: LatLng; ts: number } | null = null;

let pendingTiles = new Map<string, TilePoint>();
let sessionDistance = 0;
let sessionSteps = 0;
let flushTimer: ReturnType<typeof setInterval> | null = null;

export async function requestLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

export async function getCurrentPosition(): Promise<LatLng | null> {
  try {
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    return { lat: loc.coords.latitude, lng: loc.coords.longitude };
  } catch {
    return null;
  }
}

function queueFlush(uid: string) {
  if (flushTimer) return;
  flushTimer = setInterval(async () => {
    const tiles = [...pendingTiles.values()];
    pendingTiles.clear();
    if (tiles.length > 0) {
      await claimTiles(uid, tiles).catch(() => {
        tiles.forEach((t) => pendingTiles.set(t.key, t));
      });
    }
    if (sessionDistance > 0) {
      await flushWalkStats(uid, {
        distanceM: sessionDistance,
        steps: sessionSteps,
        newTiles: tiles.length,
      }).catch(() => {});
      sessionDistance = 0;
      sessionSteps = 0;
    }
  }, FLUSH_MS);
}

export async function startTracking(
  uid: string,
  claimRadius: number,
  onStats: (s: WalkStats) => void
): Promise<boolean> {
  if (!(await requestLocationPermission())) return false;

  await stopTracking();
  pendingTiles.clear();
  sessionDistance = 0;
  sessionSteps = 0;

  subscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Highest,
      distanceInterval: 5,
      timeInterval: 3000,
    },
    (loc) => {
      if (loc.mocked) return; // Android mock-location detection
      const coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      const now = loc.timestamp;
      if (lastFix) {
        const dt = (now - lastFix.ts) / 1000;
        const dist = haversine(lastFix.coords, coords);
        const speed = dist / dt;
        if (dt > 0 && dist >= MIN_DISTANCE && speed <= MAX_SPEED && speed >= MIN_SPEED) {
          const steps = Math.max(1, Math.round(dist / 0.76)); // ~0.76m per step
          const pts: LatLng[] = [];
          const n = Math.max(1, Math.ceil(dist / SAMPLE_STEP));
          for (let i = 0; i <= n; i++) pts.push(lerp(lastFix.coords, coords, i / n));
          for (const p of pts) {
            for (const t of tilesInRadius(p, claimRadius)) {
              pendingTiles.set(t.key, t);
            }
          }
          sessionDistance += dist;
          sessionSteps += steps;
          onStats({ distanceM: sessionDistance, steps: sessionSteps, speedMps: speed, claimedTiles: pendingTiles.size, lat: coords.lat, lng: coords.lng });
          lastFix = { coords, ts: now };
        }
      } else {
        lastFix = { coords, ts: now };
      }
    }
  );

  queueFlush(uid);
  return true;
}

export async function stopTracking(): Promise<void> {
  if (subscription) {
    subscription.remove();
    subscription = null;
  }
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  lastFix = null;
}

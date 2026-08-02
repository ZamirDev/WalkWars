import * as Location from 'expo-location';
import { claimTiles, flushWalkStats } from './db';
import { haversine, lerp, tilesInRadius, type LatLng, type TilePoint } from './geo';
import type { WalkStats } from './types';

const MAX_SPEED = 8; // m/s — faster than any runner
const MIN_SPEED = 0.05; // m/s — ignore near-static jitter (kept tiny so indoor walks count)
const MIN_DISTANCE = 1; // m between accepted fixes
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

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('location timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

export async function getCurrentPosition(): Promise<LatLng | null> {
  for (const accuracy of [Location.Accuracy.High, Location.Accuracy.Balanced]) {
    try {
      const loc = await withTimeout(
        Location.getCurrentPositionAsync({ accuracy, mayShowUserSettingsDialog: true }),
        8000
      );
      if (loc.mocked) continue; // Android mock-location detection
      if (loc.coords.latitude !== 0 && loc.coords.longitude !== 0) {
        return {
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
          accuracy: loc.coords.accuracy ?? undefined,
        };
      }
    } catch (e) {
      console.log('[walkwars] getCurrentPosition failed', accuracy, String(e));
    }
  }
  return null;
}

/** Flush pending tile claims + walk stats right now (called on stop). */
export async function flushNow(uid: string): Promise<void> {
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
}

function queueFlush(uid: string) {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    void flushNow(uid);
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
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 2000,
      distanceInterval: 0,
    },
    (loc) => {
      console.log(
        '[walkwars] fix',
        JSON.stringify({
          mocked: loc.mocked,
          acc: Math.round(loc.coords.accuracy ?? -1),
          ageMs: Math.round(Date.now() - loc.timestamp),
          lat: loc.coords.latitude.toFixed(5),
          lng: loc.coords.longitude.toFixed(5),
        })
      );
      const coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      const fixAcc = loc.coords.accuracy ?? undefined;
      if (loc.mocked) {
        onStats({
          distanceM: sessionDistance,
          steps: sessionSteps,
          speedMps: 0,
          claimedTiles: pendingTiles.size,
          lat: coords.lat,
          lng: coords.lng,
          accuracy: fixAcc,
          mocked: true,
        });
        return;
      }
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
          onStats({
            distanceM: sessionDistance,
            steps: sessionSteps,
            speedMps: speed,
            claimedTiles: pendingTiles.size,
            lat: coords.lat,
            lng: coords.lng,
            accuracy: fixAcc,
          });
          lastFix = { coords, ts: now };
        } else {
          onStats({
            distanceM: sessionDistance,
            steps: sessionSteps,
            speedMps: 0,
            claimedTiles: pendingTiles.size,
            lat: coords.lat,
            lng: coords.lng,
            accuracy: fixAcc,
          });
        }
      } else {
        lastFix = { coords, ts: now };
        onStats({
          distanceM: 0,
          steps: 0,
          speedMps: 0,
          claimedTiles: 0,
          lat: coords.lat,
          lng: coords.lng,
          accuracy: fixAcc,
        });
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

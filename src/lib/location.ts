import * as Location from 'expo-location';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { claimTiles, flushWalkStats } from './db';
import { haversine, lerp, tilesInRadius, type LatLng, type TilePoint } from './geo';
import type { WalkStats } from './types';

const MAX_SPEED = 30; // m/s (~108 km/h) — relaxed for scooter testing; anti-cheat was 8 m/s, restore before ship
const MIN_SPEED = 0.05; // m/s — ignore near-static jitter (kept tiny so indoor walks count)
const MIN_DISTANCE = 1; // m between accepted fixes
const SAMPLE_STEP = 10; // m between claim sample points along a segment
const FLUSH_MS = 30000;

let subscription: Location.LocationSubscription | null = null;
let lastFix: { coords: LatLng; ts: number } | null = null;

let pendingTiles = new Map<string, TilePoint>();
let sessionDistance = 0;
let sessionSteps = 0;
let sessionPath: LatLng[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;

export type LocationPermissionState =
  | { state: 'granted' }
  | { state: 'askable' } // denied, but the system dialog can be shown again
  | { state: 'blocked' }; // permanently denied -> must open app settings

export async function ensureLocationPermission(): Promise<LocationPermissionState> {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted) return { state: 'granted' };
  if (current.canAskAgain) {
    const req = await Location.requestForegroundPermissionsAsync();
    if (req.granted) return { state: 'granted' };
    return req.canAskAgain ? { state: 'askable' } : { state: 'blocked' };
  }
  return { state: 'blocked' };
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

/**
 * Get a reliable one-shot fix. Android's first GPS fix right after enabling
 * location can be off by tens of km (e.g. out at sea), so we poll for up to
 * ~12s and keep the best fix; we return immediately once accuracy is good.
 */
export async function getCurrentPosition(options?: {
  minAccuracy?: number;
}): Promise<LatLng | null> {
  const minAccuracy = options?.minAccuracy ?? 150; // meters
  const deadline = Date.now() + 12000;
  let best: LatLng | null = null;
  let attempt = 0;
  while (Date.now() < deadline && attempt < 8) {
    attempt++;
    try {
      const loc = await withTimeout(
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
          mayShowUserSettingsDialog: true,
        }),
        3000
      );
      if (loc.mocked || (loc.coords.latitude === 0 && loc.coords.longitude === 0)) continue;
      const acc = loc.coords.accuracy ?? undefined;
      const candidate: LatLng = {
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        accuracy: acc,
      };
      if (!best || (acc ?? Infinity) < (best.accuracy ?? Infinity)) best = candidate;
      console.log(
        '[walkwars] locate',
        JSON.stringify({
          attempt,
          acc: Math.round(acc ?? -1),
          lat: candidate.lat.toFixed(5),
          lng: candidate.lng.toFixed(5),
        })
      );
      if (acc != null && acc <= minAccuracy) return candidate;
    } catch (e) {
      console.log('[walkwars] locate attempt failed', attempt, String(e));
    }
  }
  return best;
}

/** Flush pending tile claims + walk stats right now (called on stop). */
export async function flushNow(uid: string): Promise<void> {
  const tiles = [...pendingTiles.values()];
  pendingTiles.clear();
  if (tiles.length > 0) {
    console.log('[walkwars] flushing', tiles.length, 'tiles');
    try {
      await claimTiles(uid, tiles);
    } catch (e) {
      console.log('[walkwars] claimTiles FAILED', String(e));
      tiles.forEach((t) => pendingTiles.set(t.key, t));
    }
  }
  if (sessionDistance > 0) {
    try {
      await flushWalkStats(uid, {
        distanceM: sessionDistance,
        steps: sessionSteps,
        newTiles: tiles.length,
      });
    } catch (e) {
      console.log('[walkwars] flushWalkStats FAILED', String(e));
    }
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
  const perm = await ensureLocationPermission();
  if (perm.state !== 'granted') return false;

  await stopTracking();
  pendingTiles.clear();
  sessionDistance = 0;
  sessionSteps = 0;
  sessionPath = [];

  await activateKeepAwakeAsync('walkwars-tracking'); // screen off in pocket suspends GPS callbacks

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
      if (fixAcc != null && fixAcc > 300) {
        // GPS still settling / bad fix — don't jump the dot or claim from it.
        onStats({
          distanceM: sessionDistance,
          steps: sessionSteps,
          speedMps: 0,
          claimedTiles: pendingTiles.size,
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
          sessionPath.push(coords);
          onStats({
            distanceM: sessionDistance,
            steps: sessionSteps,
            speedMps: speed,
            claimedTiles: pendingTiles.size,
            lat: coords.lat,
            lng: coords.lng,
            accuracy: fixAcc,
            path: [...sessionPath],
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
        sessionPath = [coords];
        onStats({
          distanceM: 0,
          steps: 0,
          speedMps: 0,
          claimedTiles: 0,
          lat: coords.lat,
          lng: coords.lng,
          accuracy: fixAcc,
          path: [...sessionPath],
        });
      }
    }
  );

  queueFlush(uid);
  return true;
}

export async function stopTracking(): Promise<void> {
  deactivateKeepAwake('walkwars-tracking');
  if (subscription) {
    subscription.remove();
    subscription = null;
  }
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  lastFix = null;
  sessionPath = [];
}

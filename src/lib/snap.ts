import { haversine, type LatLng } from './geo';

const OSRM_MATCH_URL = 'https://router.project-osrm.org/match/v1/driving';
const OSRM_NEAREST_URL = 'https://router.project-osrm.org/nearest/v1/driving';
const CHUNK = 90; // OSRM caps match requests around ~100 coordinates
const MAX_ACCURACY = 300; // meters — search radius per coordinate

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('osrm timeout')), ms);
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

async function matchChunk(pts: LatLng[]): Promise<LatLng[]> {
  const coords = pts.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
  const radiuses = pts
    .map((p) => Math.max(5, Math.min(MAX_ACCURACY, p.accuracy ?? 25)))
    .join(';');
  const url = `${OSRM_MATCH_URL}/${coords}?radiuses=${radiuses}&steps=false&overview=full&geometries=geojson`;
  const res = await withTimeout(fetch(url), 20000);
  if (!res.ok) throw new Error(`osrm ${res.status}`);
  const data = await res.json();
  if (data.code !== 'Ok' || !Array.isArray(data.matchings) || data.matchings.length === 0) {
    throw new Error('osrm no match');
  }
  const geom = data.matchings[0].geometry?.coordinates as [number, number][] | undefined;
  if (!geom || geom.length < 2) throw new Error('osrm empty geometry');
  return geom.map(([lng, lat]) => ({ lat, lng }));
}

/** Dedupe consecutive points that are ~identical (OSRM chunk seams). */
function dedupe(points: LatLng[]): LatLng[] {
  const out: LatLng[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last.lat - p.lat) > 1e-7 || Math.abs(last.lng - p.lng) > 1e-7) {
      out.push(p);
    }
  }
  return out;
}

/**
 * Snap a walk trail onto the road network via OSRM's map-matching service.
 * On any failure (offline, no road nearby, server hiccup) the raw trail is
 * returned so the map/territory logic still works with un-snapped points.
 */
export async function snapToRoads(points: LatLng[]): Promise<LatLng[]> {
  const clean = points.filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (clean.length < 2) return points;

  try {
    const out: LatLng[] = [];
    for (let i = 0; i < clean.length; i += CHUNK - 1) {
      const chunk = clean.slice(i, i + CHUNK);
      const snapped = await matchChunk(chunk);
      out.push(...snapped);
    }
    return dedupe(out).length >= 2 ? out : points;
  } catch (e) {
    console.log('[walkwars] snap FAILED', String(e));
    return points;
  }
}

// --- Live single-point road snapping (user marker / trail stays on roads) ---

const SNAP_MIN_MOVE = 3; // meters — don't re-snap if we barely moved
let lastSnapInput: LatLng | null = null;
let lastSnapOutput: LatLng | null = null;

export function resetSnap(): void {
  lastSnapInput = null;
  lastSnapOutput = null;
}

/**
 * Snap a single GPS fix to the nearest road (OSRM /nearest). Falls back to
 * the raw point when off-road beyond the search radius or on any error.
 */
export async function snapPoint(p: LatLng): Promise<LatLng> {
  if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return p;
  if (lastSnapInput && haversine(lastSnapInput, p) < SNAP_MIN_MOVE) return lastSnapOutput ?? p;

  lastSnapInput = p;
  const radius = Math.max(15, Math.min(50, p.accuracy ?? 30));
  const url = `${OSRM_NEAREST_URL}/${p.lng.toFixed(6)},${p.lat.toFixed(6)}?radiuses=${radius}`;
  try {
    const res = await withTimeout(fetch(url), 1500);
    if (!res.ok) throw new Error(`osrm nearest ${res.status}`);
    const data = await res.json();
    if (data.code !== 'Ok' || !Array.isArray(data.waypoints) || data.waypoints.length === 0) {
      return p; // NoSegment — no road within radius
    }
    const [lng, lat] = data.waypoints[0].location as [number, number];
    lastSnapOutput = { lat, lng };
    return lastSnapOutput;
  } catch (e) {
    console.log('[walkwars] snapPoint FAILED', String(e));
    return p;
  }
}

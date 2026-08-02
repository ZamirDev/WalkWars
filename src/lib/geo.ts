export interface LatLng {
  lat: number;
  lng: number;
  accuracy?: number;
}

export interface TilePoint {
  key: string;
  lat: number;
  lng: number;
}

export const CELL = 0.00025; // ~27.7m at the equator

export function haversine(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function tileKey(lat: number, lng: number): string {
  const ix = Math.round(lat / CELL);
  const iy = Math.round(lng / CELL);
  return `${ix}_${iy}`;
}

export function tileCenter(key: string): LatLng {
  const [ix, iy] = key.split('_').map(Number);
  return { lat: ix * CELL, lng: iy * CELL };
}

/** Tiles whose center is within `radius` meters of `p`. */
export function tilesInRadius(p: LatLng, radius: number): TilePoint[] {
  const latCells = Math.ceil(radius / (CELL * 111320));
  const latIx = Math.round(p.lat / CELL);
  const lngIx = Math.round(p.lng / CELL);
  const cosLat = Math.max(0.2, Math.cos((p.lat * Math.PI) / 180));
  const lngCells = Math.ceil(radius / (CELL * 111320 * cosLat));
  const out: TilePoint[] = [];
  for (let ix = latIx - latCells; ix <= latIx + latCells; ix++) {
    for (let iy = lngIx - lngCells; iy <= lngIx + lngCells; iy++) {
      const c = { lat: ix * CELL, lng: iy * CELL };
      if (haversine(p, c) <= radius) {
        out.push({ key: `${ix}_${iy}`, lat: c.lat, lng: c.lng });
      }
    }
  }
  return out;
}

// --- Geohash (for efficient-ish Firestore viewport queries) ---

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

export function geohash(lat: number, lng: number, precision = 6): string {
  let latMin = -90, latMax = 90, lngMin = -180, lngMax = 180;
  let hash = '';
  let bit = 0;
  let ch = 0;
  let even = true;
  while (hash.length < precision) {
    if (even) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) { ch = (ch << 1) | 1; lngMin = mid; }
      else { ch = ch << 1; lngMax = mid; }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) { ch = (ch << 1) | 1; latMin = mid; }
      else { ch = ch << 1; latMax = mid; }
    }
    even = !even;
    if (++bit === 5) {
      hash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}

const NEIGHBORS = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
] as const;

/** 3x3 block of geohash prefixes around `lat,lng` (center + 8 neighbors). */
export function geohashNeighbors(lat: number, lng: number, precision = 6): string[] {
  const center = geohash(lat, lng, precision);
  const out = new Set<string>([center]);
  for (const [dlat, dlng] of NEIGHBORS) {
    const nlat = lat + dlat * 0.011; // ~1.2km per unit at precision 6
    const nlng = lng + dlng * 0.011;
    out.add(geohash(nlat, nlng, precision));
  }
  return [...out];
}

export function lerp(a: LatLng, b: LatLng, t: number): LatLng {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

/** Polygon ring (4 corners, Leaflet [lat,lng] order) for a tile center. */
export function tileRing(center: LatLng): [number, number][] {
  const h = CELL / 2;
  const w = CELL / 2 / Math.max(0.2, Math.cos((center.lat * Math.PI) / 180));
  return [
    [center.lat - h, center.lng - w],
    [center.lat - h, center.lng + w],
    [center.lat + h, center.lng + w],
    [center.lat + h, center.lng - w],
  ];
}

export interface LatLng {
  lat: number;
  lng: number;
  accuracy?: number;
}

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

/** 3x3 block of geohash prefixes around `lat,lng` (center + 8 neighbors). */
export function geohashNeighbors(lat: number, lng: number, precision = 6): string[] {
  const bits = precision * 5;
  const latBits = Math.floor(bits / 2);
  const lngBits = Math.ceil(bits / 2);
  const latCell = 180 / 2 ** latBits;
  const lngCell = 360 / 2 ** lngBits;
  const center = geohash(lat, lng, precision);
  const out = new Set<string>([center]);
  for (let dl = -1; dl <= 1; dl++) {
    for (let dn = -1; dn <= 1; dn++) {
      out.add(geohash(lat + dl * latCell, lng + dn * lngCell, precision));
    }
  }
  return [...out];
}

// --- Polygon helpers (road territory loops) ---

/** Area of a ring in m² (shoelace on a planar local projection). */
export function polygonAreaM2(points: LatLng[]): number {
  if (points.length < 3) return 0;
  const ref = points[0];
  const x = (p: LatLng) => (p.lng - ref.lng) * 111320 * Math.cos((ref.lat * Math.PI) / 180);
  const y = (p: LatLng) => (p.lat - ref.lat) * 110540;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += x(a) * y(b) - x(b) * y(a);
  }
  return Math.abs(sum / 2);
}

/** Centroid (average) of a ring. */
export function centroid(points: LatLng[]): LatLng {
  let lat = 0, lng = 0;
  for (const p of points) {
    lat += p.lat;
    lng += p.lng;
  }
  const n = Math.max(1, points.length);
  return { lat: lat / n, lng: lng / n };
}

/** Douglas–Peucker simplification; tolerance in meters. */
export function simplifyRing(points: LatLng[], toleranceM = 5): LatLng[] {
  if (points.length <= 3) return points;
  const tolM2 = toleranceM * toleranceM;

  const sqSegDist = (p: LatLng, a: LatLng, b: LatLng) => {
    const dx = b.lng - a.lng, dy = b.lat - a.lat;
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : ((p.lng - a.lng) * dx + (p.lat - a.lat) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = p.lng - (a.lng + t * dx), py = p.lat - (a.lat + t * dy);
    return px * px + py * py;
  };

  const dp = (pts: LatLng[]): LatLng[] => {
    if (pts.length <= 2) return pts;
    let maxD = -1, index = -1;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = sqSegDist(pts[i], pts[0], pts[pts.length - 1]);
      if (d > maxD) { maxD = d; index = i; }
    }
    if (maxD > tolM2) {
      const left = dp(pts.slice(0, index + 1));
      const right = dp(pts.slice(index));
      return [...left.slice(0, -1), ...right];
    }
    return [pts[0], pts[pts.length - 1]];
  };

  return dp(points);
}

/** Is the trail a closed loop (first ≈ last point)? */
export function isClosedLoop(points: LatLng[], thresholdM = 8): boolean {
  if (points.length < 4) return false;
  return haversine(points[0], points[points.length - 1]) <= thresholdM;
}

/** Point-in-polygon (ray casting) for steal/overlap checks. */
export function pointInRing(p: LatLng, ring: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    const intersect =
      a.lng > p.lng !== b.lng > p.lng &&
      p.lat < ((b.lat - a.lat) * (p.lng - a.lng)) / (b.lng - a.lng) + a.lat;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Rough overlap test: any vertex of one ring inside the other, or shared centroid. */
export function ringsIntersect(a: LatLng[], b: LatLng[]): boolean {
  if (a.length < 3 || b.length < 3) return false;
  for (const p of a) if (pointInRing(p, b)) return true;
  for (const p of b) if (pointInRing(p, a)) return true;
  const ca = centroid(a), cb = centroid(b);
  return pointInRing(ca, b) || pointInRing(cb, a);
}

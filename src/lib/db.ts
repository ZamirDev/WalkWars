import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  centroid,
  geohash,
  geohashNeighbors,
  polygonAreaM2,
  ringsIntersect,
  type LatLng,
} from './geo';
import type { TerritoryDoc, WalkUser } from './types';

const NOW = () => Date.now();
const GH_PRECISION = 5; // ~4.9km cells — viewport query granularity

export async function getUser(uid: string): Promise<WalkUser | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? (snap.data() as WalkUser) : null;
}

/** Creates a user doc on first sign-in. Safe to call repeatedly. */
export async function ensureUser(
  uid: string,
  info: { name: string; email?: string; avatar?: string }
): Promise<void> {
  const ref = doc(db, 'users', uid);
  await setDoc(
    ref,
    {
      uid,
      name: info.name,
      email: info.email ?? '',
      avatar: info.avatar ?? '',
      totalDistanceKm: 0,
      totalSteps: 0,
      territoryScore: 0,
      distinctTiles: 0,
      lastActiveAt: NOW(),
      createdAt: NOW(),
      isPro: false,
    },
    { merge: true }
  );
}

export async function touchUser(uid: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { lastActiveAt: NOW() }).catch(() => {});
}

/**
 * Claim a closed loop as a territory. Last-walker-wins: any existing
 * territory owned by someone else that the new ring overlaps is deleted and
 * its area is deducted from the previous owner's score.
 */
export async function createTerritory(uid: string, ring: LatLng[]): Promise<string | null> {
  if (ring.length < 3) return null;
  const areaM2 = Math.round(polygonAreaM2(ring));
  if (areaM2 < 10) return null; // degenerate sliver — ignore
  const center = centroid(ring);
  const gh5 = geohash(center.lat, center.lng, GH_PRECISION);

  const ref = doc(collection(db, 'territories'));
  await setDoc(ref, {
    ownerId: uid,
    ring: ring.map((p) => ({ lat: p.lat, lng: p.lng })),
    center,
    gh5,
    areaM2,
    createdAt: NOW(),
  });

  await stealOverlapping(uid, ring);

  await updateDoc(doc(db, 'users', uid), {
    territoryScore: increment(areaM2),
    distinctTiles: increment(1),
    lastActiveAt: NOW(),
  }).catch(() => {});
  return ref.id;
}

/** Delete territories the new ring overlaps that belong to other users. */
async function stealOverlapping(uid: string, ring: LatLng[]): Promise<void> {
  const candidates = await queryTerritoriesForTrail(ring);
  const targets = candidates.filter(
    (t) => t.id !== undefined && t.ownerId !== uid && ringsIntersect(ring, t.ring)
  );
  if (targets.length === 0) return;

  const batch = writeBatch(db);
  const lossByOwner = new Map<string, number>();
  for (const t of targets) {
    batch.delete(doc(db, 'territories', t.id));
    lossByOwner.set(t.ownerId, (lossByOwner.get(t.ownerId) ?? 0) + t.areaM2);
  }
  await batch.commit();
  for (const [ownerId, loss] of lossByOwner) {
    await updateDoc(doc(db, 'users', ownerId), {
      territoryScore: increment(-loss),
      distinctTiles: increment(-1),
    }).catch(() => {});
  }
}

/** Flush session walk stats to the user's profile. */
export async function flushWalkStats(
  uid: string,
  stats: { distanceM: number; steps: number }
): Promise<void> {
  const ref = doc(db, 'users', uid);
  await updateDoc(ref, {
    totalDistanceKm: increment(stats.distanceM / 1000),
    totalSteps: increment(stats.steps),
    lastActiveAt: NOW(),
  }).catch(() => {});
}

/** Territories within ~5km of `lat,lng` (geohash-precision-5 prefix query). */
export async function queryTerritoriesInArea(lat: number, lng: number): Promise<TerritoryDoc[]> {
  return queryTerritoriesForPoints([{ lat, lng }]);
}

/** Territories overlapping a trail's geohash windows (dedupes prefixes). */
export async function queryTerritoriesForTrail(points: LatLng[]): Promise<TerritoryDoc[]> {
  return queryTerritoriesForPoints(points);
}

async function queryTerritoriesForPoints(points: LatLng[]): Promise<TerritoryDoc[]> {
  if (points.length === 0) return [];
  const prefixes = new Set<string>();
  for (const p of points) {
    for (const gh of geohashNeighbors(p.lat, p.lng, GH_PRECISION)) prefixes.add(gh);
  }
  const list = [...prefixes];
  const chunks: string[][] = [];
  for (let i = 0; i < list.length; i += 10) chunks.push(list.slice(i, i + 10));

  const all: TerritoryDoc[] = [];
  for (const chunk of chunks) {
    const q = query(collection(db, 'territories'), where('gh5', 'in', chunk));
    const snap = await getDocs(q);
    snap.forEach((d) => all.push({ ...(d.data() as TerritoryDoc), id: d.id }));
  }
  return all;
}

export async function leaderboard(count = 50): Promise<WalkUser[]> {
  const q = query(collection(db, 'users'), orderBy('territoryScore', 'desc'), limit(count));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as WalkUser);
}

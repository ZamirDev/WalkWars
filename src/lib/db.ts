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
import { geohash, geohashNeighbors, type LatLng, type TilePoint } from './geo';
import type { TileDoc, WalkUser } from './types';

const NOW = () => Date.now();

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

/** Add strength for `uid` on every tile the user walked over. */
export async function claimTiles(uid: string, tiles: TilePoint[]): Promise<void> {
  if (tiles.length === 0) return;
  const batch = writeBatch(db);
  const now = NOW();
  for (const t of tiles) {
    const ref = doc(db, 'tiles', t.key);
    batch.set(
      ref,
      {
        strengths: { [uid]: increment(1) },
        gh6: geohash(t.lat, t.lng, 6),
        lat: t.lat,
        lng: t.lng,
        updatedAt: now,
      },
      { merge: true }
    );
  }
  await batch.commit();
}

/** Flush session walk stats to the user's profile. */
export async function flushWalkStats(
  uid: string,
  stats: { distanceM: number; steps: number; newTiles: number }
): Promise<void> {
  const ref = doc(db, 'users', uid);
  await updateDoc(ref, {
    totalDistanceKm: increment(stats.distanceM / 1000),
    totalSteps: increment(stats.steps),
    territoryScore: increment(stats.newTiles),
    distinctTiles: increment(stats.newTiles),
    lastActiveAt: NOW(),
  }).catch(() => {});
}

/** Tiles that may be within ~1.2km of `lat,lng` (geohash-precision-6 prefix query). */
export async function queryTilesInArea(lat: number, lng: number): Promise<TileDoc[]> {
  const prefixes = geohashNeighbors(lat, lng, 6);
  const chunks: string[][] = [];
  for (let i = 0; i < prefixes.length; i += 10) chunks.push(prefixes.slice(i, i + 10));

  const all: TileDoc[] = [];
  for (const chunk of chunks) {
    const q = query(collection(db, 'tiles'), where('gh6', 'in', chunk));
    const snap = await getDocs(q);
    snap.forEach((d) => all.push(d.data() as TileDoc));
  }
  return all;
}

/** Tiles along a whole walk trail (dedupes geohash prefixes across all points). */
export async function queryTilesForTrail(points: LatLng[]): Promise<TileDoc[]> {
  if (points.length === 0) return [];
  const prefixes = new Set<string>();
  for (const p of points) {
    for (const gh of geohashNeighbors(p.lat, p.lng, 6)) prefixes.add(gh);
  }
  const list = [...prefixes];
  const chunks: string[][] = [];
  for (let i = 0; i < list.length; i += 10) chunks.push(list.slice(i, i + 10));

  const all: TileDoc[] = [];
  for (const chunk of chunks) {
    const q = query(collection(db, 'tiles'), where('gh6', 'in', chunk));
    const snap = await getDocs(q);
    snap.forEach((d) => all.push(d.data() as TileDoc));
  }
  return all;
}

export async function leaderboard(count = 50): Promise<WalkUser[]> {
  const q = query(collection(db, 'users'), orderBy('territoryScore', 'desc'), limit(count));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as WalkUser);
}

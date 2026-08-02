import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LeafletMap, type LeafletMapHandle } from '@/components/LeafletMap';
import { useAuth } from '@/lib/auth-context';
import { colorForOwner } from '@/lib/colors';
import { createTerritory, queryTerritoriesForTrail, queryTerritoriesInArea } from '@/lib/db';
import { haversine, isClosedLoop, simplifyRing, type LatLng } from '@/lib/geo';
import { ensureLocationPermission, flushNow, getCurrentPosition, startTracking, stopTracking } from '@/lib/location';
import { snapToRoads } from '@/lib/snap';
import type { TerritoryDoc, TerritoryPolygon, WalkStats } from '@/lib/types';

const FREE_RADIUS = 15;
const PRO_RADIUS = 30;

export default function MapScreen() {
  const router = useRouter();
  const { firebaseUser, user, loading } = useAuth();
  const me = user?.uid;

  const [position, setPosition] = useState<LatLng | null>(null);
  const [stats, setStats] = useState<WalkStats | null>(null);
  const [trail, setTrail] = useState<LatLng[]>([]);
  const [trailClosed, setTrailClosed] = useState(false);
  const trailRef = useRef<LatLng[]>([]);
  const [tracking, setTracking] = useState(false);
  const [polygons, setPolygons] = useState<TerritoryPolygon[]>([]);
  const [loadingTiles, setLoadingTiles] = useState(false);
  const [noFix, setNoFix] = useState(false);
  const [permBlocked, setPermBlocked] = useState(false);
  const [locating, setLocating] = useState(false);
  const [followOn, setFollowOn] = useState(false);
  const [claimedFlash, setClaimedFlash] = useState(false);
  const locatingRef = useRef(false);
  const permBlockedRef = useRef(false);
  const followOnRef = useRef(false);
  const moveGuard = useRef(0);

  const mapRef = useRef<LeafletMapHandle | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const claimRadius = user?.isPro ? PRO_RADIUS : FREE_RADIUS;

  useEffect(() => {
    if (!loading && !firebaseUser) router.replace('/auth');
  }, [loading, firebaseUser, router]);

  const renderTerritory = useCallback(
    (docs: TerritoryDoc[]) => {
      const colorBy = new Map<string, string>();
      const polys: TerritoryPolygon[] = [];
      for (const t of docs) {
        if (!t.ring || t.ring.length < 3) continue;
        if (!colorBy.has(t.ownerId)) colorBy.set(t.ownerId, colorForOwner(t.ownerId, t.ownerId === me));
        polys.push({
          ring: t.ring.map((p) => [p.lat, p.lng] as [number, number]),
          color: colorBy.get(t.ownerId)!,
          ownerId: t.ownerId,
        });
      }
      setPolygons(polys);
      console.log('[walkwars] render', polys.length, 'territories');
    },
    [me]
  );

  const refreshTerritory = useCallback(
    async (lat: number, lng: number) => {
      setLoadingTiles(true);
      try {
        renderTerritory(await queryTerritoriesInArea(lat, lng));
      } catch {
        /* keep last territories */
      } finally {
        setLoadingTiles(false);
      }
    },
    [renderTerritory]
  );

  const refreshTrailTerritory = useCallback(
    async (points: LatLng[]) => {
      setLoadingTiles(true);
      try {
        renderTerritory(await queryTerritoriesForTrail(points));
      } catch {
        /* keep last territories */
      } finally {
        setLoadingTiles(false);
      }
    },
    [renderTerritory]
  );

  const scheduleRefresh = useCallback(
    (lat: number, lng: number) => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => refreshTerritory(lat, lng), 1200);
    },
    [refreshTerritory]
  );

  const handleStats = useCallback(
    (s: WalkStats) => {
      setStats(s);
      if (s.path) {
        trailRef.current = s.path;
        setTrail(s.path);
        setTrailClosed(isClosedLoop(s.path));
      }
      if (s.lat != null && s.lng != null) {
        setPosition({ lat: s.lat, lng: s.lng, accuracy: s.accuracy });
        mapRef.current?.setUser(s.lat, s.lng, claimRadius);
        if (!s.mocked) scheduleRefresh(s.lat, s.lng);
        if (followOnRef.current && !s.mocked) {
          moveGuard.current = 1;
          mapRef.current?.center(s.lat, s.lng);
        }
      }
    },
    [claimRadius, scheduleRefresh]
  );

  const toggleFollow = useCallback(() => {
    setFollowOn((prev) => {
      const next = !prev;
      followOnRef.current = next;
      if (next && position) {
        moveGuard.current = 1;
        mapRef.current?.center(position.lat, position.lng);
      }
      return next;
    });
  }, [position]);

  const locate = useCallback(async () => {
    if (locatingRef.current) return;
    locatingRef.current = true;
    setLocating(true);
    try {
      const perm = await ensureLocationPermission();
      if (perm.state !== 'granted') {
        setPermBlocked(perm.state === 'blocked');
        setNoFix(true);
        return;
      }
      setPermBlocked(false);
      setNoFix(false);
      const pos = await getCurrentPosition();
      if (pos) {
        setPosition(pos);
        mapRef.current?.center(pos.lat, pos.lng);
        mapRef.current?.setUser(pos.lat, pos.lng, claimRadius);
        scheduleRefresh(pos.lat, pos.lng);
      } else {
        setNoFix(true);
      }
    } finally {
      locatingRef.current = false;
      setLocating(false);
    }
  }, [claimRadius, scheduleRefresh]);

  useEffect(() => {
    if (!firebaseUser) return;
    let cancelled = false;
    (async () => {
      const perm = await ensureLocationPermission();
      if (cancelled) return;
      if (perm.state !== 'granted') {
        setPermBlocked(perm.state === 'blocked');
        setNoFix(true);
        return;
      }
      const pos = await getCurrentPosition();
      if (cancelled) return;
      if (!pos) {
        setNoFix(true);
        return;
      }
      setPermBlocked(false);
      setNoFix(false);
      setPosition(pos);
      mapRef.current?.center(pos.lat, pos.lng);
      mapRef.current?.setUser(pos.lat, pos.lng, claimRadius);
      scheduleRefresh(pos.lat, pos.lng);
    })();
    return () => {
      cancelled = true;
    };
  }, [firebaseUser, claimRadius, scheduleRefresh]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && permBlockedRef.current) void locate();
    });
    return () => sub.remove();
  }, [locate]);

  useEffect(() => {
    followOnRef.current = followOn;
  }, [followOn]);

  useEffect(() => {
    permBlockedRef.current = permBlocked;
  }, [permBlocked]);

  useEffect(() => {
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      stopTracking();
    };
  }, []);

  async function startSession() {
    if (!firebaseUser) return;
    setTrail([]);
    trailRef.current = [];
    setTrailClosed(false);
    await locate();
    const ok = await startTracking(firebaseUser.uid, handleStats);
    setTracking(ok);
    if (!ok) setNoFix(true);
  }

  async function stopSession() {
    try {
      await stopTracking();
      setTracking(false);
      const pts = trailRef.current;
      console.log('[walkwars] stop', JSON.stringify({ pts: pts.length }));
      if (pts.length >= 2) {
        mapRef.current?.fitTo(pts);
        const loop = isClosedLoop(pts);
        console.log(
          '[walkwars] stop loop=' + loop + ' gap=' + Math.round(haversine(pts[0], pts[pts.length - 1])) + 'm'
        );
        if (loop) {
          const snapped = await snapToRoads(pts);
          console.log(
            '[walkwars] snap -> ' + snapped.length + ' pts' + (snapped === pts ? ' (fallback)' : '')
          );
          const ring = [...simplifyRing(snapped), snapped[0]]; // force a closed polygon
          setTrail(ring);
          setTrailClosed(true);
          if (firebaseUser) {
            try {
              const id = await createTerritory(firebaseUser.uid, ring);
              if (id) {
                console.log('[walkwars] territory id=' + id);
                setClaimedFlash(true);
                setTimeout(() => setClaimedFlash(false), 4000);
              } else {
                console.log('[walkwars] territory skipped (sliver)');
              }
            } catch (e) {
              console.log('[walkwars] createTerritory FAILED', String(e));
            }
          }
        } else {
          setTrail(pts);
          setTrailClosed(false);
        }
        await refreshTrailTerritory(pts);
      }
    } finally {
      if (firebaseUser) await flushNow(firebaseUser.uid);
    }
  }

  function onMapMove(lat: number, lng: number) {
    if (moveGuard.current > 0) {
      moveGuard.current = 0;
      return;
    }
    if (followOnRef.current && tracking) setFollowOn(false);
    if (!tracking) scheduleRefresh(lat, lng);
  }

  const km = stats ? (stats.distanceM / 1000).toFixed(2) : '0.00';
  const showMock = stats?.mocked === true;
  const fixAcc = stats?.accuracy ?? position?.accuracy ?? null;

  return (
    <View style={styles.container}>
      <LeafletMap
        ref={mapRef}
        initialLat={position?.lat}
        initialLng={position?.lng}
        polygons={polygons}
        trail={trail}
        trailClosed={trailClosed}
        onMove={onMapMove}
      />

      <SafeAreaView style={styles.topBar} edges={['top']} pointerEvents="box-none">
        <View style={styles.titleRow}>
          <Text style={styles.title}>WalkWars</Text>
          <View style={styles.topButtons}>
            <Pressable style={styles.topButton} onPress={() => router.push('/leaderboard')}>
              <Text style={styles.topButtonText}>Leaderboard</Text>
            </Pressable>
            <Pressable style={styles.topButton} onPress={() => router.push('/profile')}>
              <Text style={styles.topButtonText}>Profile</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.locateRow}>
          <Pressable style={styles.locatePill} onPress={locate}>
            {locating ? (
              <ActivityIndicator size="small" color="#2563eb" />
            ) : (
              <Text style={styles.locatePillText}>Locate me</Text>
            )}
          </Pressable>
          <Pressable
            style={[styles.locatePill, followOn && styles.followPillActive]}
            onPress={toggleFollow}>
            <Text style={[styles.locatePillText, followOn && styles.followPillTextActive]}>
              {followOn ? 'Following' : 'Follow'}
            </Text>
          </Pressable>
        </View>
        {(permBlocked || loadingTiles || noFix || showMock || claimedFlash) && (
          <View style={styles.badgeRow}>
            {loadingTiles && (
              <View style={styles.loadingBadge}>
                <ActivityIndicator size="small" color="#2563eb" />
              </View>
            )}
            {permBlocked && (
              <View style={styles.warnBanner}>
                <Text style={styles.warnText}>
                  Location permission is off — turn it on to find yourself and claim territory.
                </Text>
                <Pressable style={styles.enableBtn} onPress={() => Linking.openSettings()}>
                  <Text style={styles.enableBtnText}>Open Settings</Text>
                </Pressable>
              </View>
            )}
            {!permBlocked && noFix && (
              <View style={styles.warnBanner}>
                <Text style={styles.warnText}>
                  Location unavailable — enable High accuracy mode, go near a window, or press Locate to retry.
                </Text>
              </View>
            )}
            {showMock && (
              <View style={styles.warnBanner}>
                <Text style={styles.warnText}>Mock location detected — claims paused</Text>
              </View>
            )}
            {claimedFlash && (
              <View style={styles.okBanner}>
                <Text style={styles.okText}>Territory captured!</Text>
              </View>
            )}
          </View>
        )}
      </SafeAreaView>

      <SafeAreaView style={styles.bottomBar} edges={['bottom']} pointerEvents="box-none">
        <View style={styles.statsPanel}>
          <Stat label="Distance" value={`${km} km`} />
          <Stat label="Steps" value={String(stats?.steps ?? 0)} />
          <Stat label="Speed" value={stats ? `${stats.speedMps.toFixed(1)} m/s` : '—'} />
        </View>
        {fixAcc != null && (
          <Text style={styles.accText}>Fix accuracy: ±{Math.round(fixAcc)} m</Text>
        )}
        <Pressable
          style={[styles.bigButton, tracking ? styles.bigButtonStop : styles.bigButtonStart]}
          onPress={tracking ? stopSession : startSession}>
          <Text style={styles.bigButtonText}>{tracking ? 'Stop Walk' : 'Start Walk'}</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    gap: 8,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 26, fontWeight: '800', color: '#0f172a', textShadowColor: '#ffffff', textShadowRadius: 4 },
  topButtons: { flexDirection: 'row', gap: 8 },
  topButton: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  topButtonText: { fontSize: 13, fontWeight: '600', color: '#2563eb' },
  locateRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 2 },
  locatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  locatePillText: { fontSize: 13, fontWeight: '700', color: '#2563eb' },
  followPillActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  followPillTextActive: { color: '#ffffff' },
  badgeRow: { gap: 6 },
  loadingBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 16,
    padding: 6,
  },
  warnBanner: {
    backgroundColor: 'rgba(255,236,179,0.95)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  warnText: { fontSize: 12, fontWeight: '600', color: '#92400e' },
  okBanner: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(187,247,208,0.95)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  okText: { fontSize: 12, fontWeight: '700', color: '#166534' },
  enableBtn: {
    alignSelf: 'flex-start',
    marginTop: 8,
    backgroundColor: '#2563eb',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  enableBtnText: { fontSize: 13, fontWeight: '700', color: '#ffffff' },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center', gap: 12 },
  statsPanel: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 8,
    width: '92%',
    justifyContent: 'space-around',
  },
  stat: { alignItems: 'center' },
  statValue: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  statLabel: { fontSize: 11, color: '#64748b', marginTop: 2 },
  accText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  bigButton: {
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 6,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  bigButtonStart: { backgroundColor: '#16a34a' },
  bigButtonStop: { backgroundColor: '#dc2626' },
  bigButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});

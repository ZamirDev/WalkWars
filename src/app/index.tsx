import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LeafletMap, type LeafletMapHandle } from '@/components/LeafletMap';
import { useAuth } from '@/lib/auth-context';
import { colorForOwner } from '@/lib/colors';
import { queryTilesInArea } from '@/lib/db';
import { tileRing, type LatLng } from '@/lib/geo';
import { getCurrentPosition, requestLocationPermission, startTracking, stopTracking } from '@/lib/location';
import type { TerritoryPolygon, WalkStats } from '@/lib/types';

const FREE_RADIUS = 15;
const PRO_RADIUS = 30;

export default function MapScreen() {
  const router = useRouter();
  const { firebaseUser, user, loading } = useAuth();
  const me = user?.uid;

  const [position, setPosition] = useState<LatLng | null>(null);
  const [stats, setStats] = useState<WalkStats | null>(null);
  const [tracking, setTracking] = useState(false);
  const [polygons, setPolygons] = useState<TerritoryPolygon[]>([]);
  const [loadingTiles, setLoadingTiles] = useState(false);

  const mapRef = useRef<LeafletMapHandle | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const claimRadius = user?.isPro ? PRO_RADIUS : FREE_RADIUS;

  useEffect(() => {
    if (!loading && !firebaseUser) router.replace('/auth');
  }, [loading, firebaseUser, router]);

  const refreshTerritory = useCallback(
    async (lat: number, lng: number) => {
      setLoadingTiles(true);
      try {
        const docs = await queryTilesInArea(lat, lng);
        const colorBy = new Map<string, string>();
        const polys: TerritoryPolygon[] = [];
        for (const t of docs) {
          let ownerId: string | null = null;
          let best = 0;
          for (const [uid, s] of Object.entries(t.strengths)) {
            if (s > best) {
              best = s;
              ownerId = uid;
            }
          }
          if (!ownerId || best <= 0) continue;
          if (!colorBy.has(ownerId)) colorBy.set(ownerId, colorForOwner(ownerId, ownerId === me));
          polys.push({ ring: tileRing({ lat: t.lat, lng: t.lng }), color: colorBy.get(ownerId)!, ownerId });
        }
        setPolygons(polys);
      } catch {
        /* keep last tiles */
      } finally {
        setLoadingTiles(false);
      }
    },
    [me]
  );

  const scheduleRefresh = useCallback(
    (lat: number, lng: number) => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => refreshTerritory(lat, lng), 1200);
    },
    [refreshTerritory]
  );

  async function startSession() {
    if (!firebaseUser) return;
    let pos = await getCurrentPosition();
    if (!pos && (await requestLocationPermission())) pos = await getCurrentPosition();
    if (!pos) return;
    setPosition(pos);
    mapRef.current?.center(pos.lat, pos.lng);
    scheduleRefresh(pos.lat, pos.lng);
    const ok = await startTracking(firebaseUser.uid, claimRadius, (s) => {
      setStats(s);
      if (s.lat != null && s.lng != null) {
        setPosition({ lat: s.lat, lng: s.lng });
        mapRef.current?.setUser(s.lat, s.lng, claimRadius);
      }
    });
    setTracking(ok);
  }

  async function stopSession() {
    await stopTracking();
    setTracking(false);
  }

  useEffect(() => {
    if (!firebaseUser) return;
    let cancelled = false;
    (async () => {
      let pos = await getCurrentPosition();
      if (!pos && (await requestLocationPermission())) pos = await getCurrentPosition();
      if (cancelled || !pos) return;
      setPosition(pos);
      mapRef.current?.center(pos.lat, pos.lng);
      scheduleRefresh(pos.lat, pos.lng);
      const ok = await startTracking(firebaseUser.uid, claimRadius, (s) => {
        setStats(s);
        if (s.lat != null && s.lng != null) {
          setPosition({ lat: s.lat, lng: s.lng });
          mapRef.current?.setUser(s.lat, s.lng, claimRadius);
        }
      });
      setTracking(ok);
    })();
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      stopTracking();
      setTracking(false);
    };
  }, [firebaseUser, claimRadius, scheduleRefresh]);

  function onMapMove(lat: number, lng: number) {
    if (!tracking) scheduleRefresh(lat, lng);
  }

  const km = stats ? (stats.distanceM / 1000).toFixed(2) : '0.00';

  return (
    <View style={styles.container}>
      <LeafletMap
        ref={mapRef}
        initialLat={position?.lat}
        initialLng={position?.lng}
        polygons={polygons}
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
        {loadingTiles && (
          <View style={styles.loadingBadge}>
            <ActivityIndicator size="small" color="#2563eb" />
          </View>
        )}
      </SafeAreaView>

      <SafeAreaView style={styles.bottomBar} edges={['bottom']} pointerEvents="box-none">
        <View style={styles.statsPanel}>
          <Stat label="Distance" value={`${km} km`} />
          <Stat label="Steps" value={String(stats?.steps ?? 0)} />
          <Stat label="Speed" value={stats ? `${stats.speedMps.toFixed(1)} m/s` : '—'} />
          <Stat label="Claimed" value={String(stats?.claimedTiles ?? 0)} />
        </View>
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
  loadingBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 16,
    padding: 6,
  },
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

import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LeafletMap, type LeafletMapHandle } from '@/components/LeafletMap';
import { useAuth } from '@/lib/auth-context';
import { colorForOwner } from '@/lib/colors';
import { createTerritory, queryTerritoriesForTrail, queryTerritoriesInArea } from '@/lib/db';
import { haversine, isClosedLoop, simplifyRing, type LatLng } from '@/lib/geo';
import { ensureLocationPermission, flushNow, getCurrentPosition, startTracking, stopTracking } from '@/lib/location';
import { snapToRoads } from '@/lib/snap';
import { useTheme } from '@/lib/theme';
import type { TerritoryDoc, TerritoryPolygon, WalkStats } from '@/lib/types';

const FREE_RADIUS = 15;
const PRO_RADIUS = 30;

export default function MapScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ autostart?: string }>();
  const { firebaseUser, user, loading } = useAuth();
  const me = user?.uid;
  const { scheme, glass, isDark } = useTheme();

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
  const [celebrating, setCelebrating] = useState(false);
  const celebrateAnim = useRef(new Animated.Value(0)).current;
  const celebrateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
        mapRef.current?.setUser(s.lat, s.lng, claimRadius, s.heading);
        if (!s.mocked) scheduleRefresh(s.lat, s.lng);
        if (followOnRef.current && !s.mocked) {
          moveGuard.current = 1;
          mapRef.current?.center(s.lat, s.lng);
        }
      }
    },
    [claimRadius, scheduleRefresh]
  );

  const runCelebration = useCallback(() => {
    setCelebrating(true);
    celebrateAnim.setValue(0);
    Animated.timing(celebrateAnim, { toValue: 1, duration: 450, useNativeDriver: true }).start();
    if (celebrateTimer.current) clearTimeout(celebrateTimer.current);
    celebrateTimer.current = setTimeout(() => {
      Animated.timing(celebrateAnim, { toValue: 0, duration: 450, useNativeDriver: true }).start(
        ({ finished }) => {
          if (finished) setCelebrating(false);
        }
      );
    }, 2500);
  }, [celebrateAnim]);

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

  // Auto-start tracking when arriving from the Home screen's Start Walk.
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (!firebaseUser || params.autostart !== '1' || autoStartedRef.current) return;
    if (!user) return;
    autoStartedRef.current = true;
    const t = setTimeout(() => {
      void startSession();
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser, user, params.autostart]);

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
      if (celebrateTimer.current) clearTimeout(celebrateTimer.current);
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
              const id = await createTerritory(firebaseUser.uid, ring, user?.name ?? 'Another walker');
              if (id) {
                console.log('[walkwars] territory id=' + id);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                mapRef.current?.celebrate(ring);
                runCelebration();
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
  const style = makeStyles(scheme, glass, isDark);

  return (
    <View style={style.container}>
      <LeafletMap
        ref={mapRef}
        initialLat={position?.lat}
        initialLng={position?.lng}
        polygons={polygons}
        trail={trail}
        trailClosed={trailClosed}
        onMove={onMapMove}
      />

      <SafeAreaView style={style.topBar} edges={['top']} pointerEvents="box-none">
        <View style={style.titleRow}>
          <Pressable style={style.homePill} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={16} color={scheme.primary} />
            <Text style={style.homePillText}>Home</Text>
          </Pressable>
          <Text style={style.title}>TerWalk</Text>
          <View style={style.topButtons}>
            <Pressable style={style.topButton} onPress={() => router.push('/leaderboard')}>
              <Text style={style.topButtonText}>Leaderboard</Text>
            </Pressable>
            <Pressable style={style.topButton} onPress={() => router.push('/profile')}>
              <Text style={style.topButtonText}>Profile</Text>
            </Pressable>
          </View>
        </View>
        <View style={style.locateRow}>
          <Pressable style={style.locatePill} onPress={locate}>
            {locating ? (
              <ActivityIndicator size="small" color={scheme.primary} />
            ) : (
              <Text style={style.locatePillText}>Locate me</Text>
            )}
          </Pressable>
          <Pressable
            style={[style.locatePill, followOn && style.followPillActive]}
            onPress={toggleFollow}>
            <Text style={[style.locatePillText, followOn && style.followPillTextActive]}>
              {followOn ? 'Following' : 'Follow'}
            </Text>
          </Pressable>
        </View>
        {(permBlocked || loadingTiles || noFix || showMock) && (
          <View style={style.badgeRow}>
            {loadingTiles && (
              <View style={style.loadingBadge}>
                <ActivityIndicator size="small" color={scheme.primary} />
              </View>
            )}
            {permBlocked && (
              <View style={[style.warnBanner, { backgroundColor: scheme.errorContainer }]}>
                <Text style={[style.warnText, { color: scheme.onErrorContainer }]}>
                  Location permission is off — turn it on to find yourself and claim territory.
                </Text>
                <Pressable style={[style.enableBtn, { backgroundColor: scheme.error }]} onPress={() => Linking.openSettings()}>
                  <Text style={[style.enableBtnText, { color: scheme.onError }]}>Open Settings</Text>
                </Pressable>
              </View>
            )}
            {!permBlocked && noFix && (
              <View style={[style.warnBanner, { backgroundColor: scheme.errorContainer }]}>
                <Text style={[style.warnText, { color: scheme.onErrorContainer }]}>
                  Location unavailable — enable High accuracy mode, go near a window, or press Locate to retry.
                </Text>
              </View>
            )}
            {showMock && (
              <View style={[style.warnBanner, { backgroundColor: scheme.secondaryContainer }]}>
                <Text style={[style.warnText, { color: scheme.onSecondaryContainer }]}>Mock location detected — claims paused</Text>
              </View>
            )}
          </View>
        )}
      </SafeAreaView>

      <SafeAreaView style={style.bottomBar} edges={['bottom']} pointerEvents="box-none">
        <View style={style.statsPanel}>
          <Stat label="Distance" value={`${km} km`} />
          <Stat label="Steps" value={String(stats?.steps ?? 0)} />
          <Stat label="Speed" value={stats ? `${stats.speedMps.toFixed(1)} m/s` : '—'} />
        </View>
        {fixAcc != null && (
          <Text style={style.accText}>Fix accuracy: ±{Math.round(fixAcc)} m</Text>
        )}
        <Pressable
          style={[style.bigButton, tracking ? style.bigButtonStop : style.bigButtonStart]}
          onPress={tracking ? stopSession : startSession}>
          <Text style={style.bigButtonText}>{tracking ? 'Stop Walk' : 'Start Walk'}</Text>
        </Pressable>
      </SafeAreaView>

      {celebrating && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Animated.View
            style={[
              style.celebrateCard,
              {
                opacity: celebrateAnim.interpolate({
                  inputRange: [0, 0.2, 0.85, 1],
                  outputRange: [0, 1, 1, 0],
                }),
                transform: [
                  {
                    scale: celebrateAnim.interpolate({
                      inputRange: [0, 0.6, 1],
                      outputRange: [0.7, 1.02, 1.18],
                    }),
                  },
                ],
              },
            ]}>
            <View style={[style.celebrateIconWrap, { backgroundColor: scheme.primaryContainer }]}>
              <Ionicons name="trophy" size={44} color={scheme.primary} />
            </View>
            <Text style={[style.celebrateTitle, { color: scheme.onSurface }]}>Territory captured!</Text>
            <Text style={[style.celebrateSub, { color: scheme.onSurfaceVariant }]}>
              This land is now yours
            </Text>
          </Animated.View>
        </View>
      )}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const { scheme } = useTheme();
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: scheme.onSurface }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: scheme.onSurfaceVariant }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  stat: { alignItems: 'center' },
  statValue: { fontSize: 16, fontWeight: '800' },
  statLabel: { fontSize: 11, marginTop: 2 },
});

function makeStyles(scheme: ReturnType<typeof useTheme>['scheme'], glass: ReturnType<typeof useTheme>['glass'], isDark: boolean) {
  return StyleSheet.create({
    container: { flex: 1 },
    topBar: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      paddingHorizontal: 16,
      gap: 8,
    },
    titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    title: { fontSize: 22, fontWeight: '800', color: scheme.onBackground },
    homePill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: glass.strong,
      borderWidth: 1,
      borderColor: glass.strongBorder,
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 7,
      gap: 2,
    },
    homePillText: { fontSize: 13, fontWeight: '700', color: scheme.primary },
    topButtons: { flexDirection: 'row', gap: 8 },
    topButton: {
      backgroundColor: glass.chip,
      borderWidth: 1,
      borderColor: glass.chipBorder,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
    },
    topButtonText: { fontSize: 13, fontWeight: '600', color: scheme.primary },
    locateRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 2 },
    locatePill: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: glass.strong,
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: glass.strongBorder,
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 1 },
      elevation: 3,
    },
    locatePillText: { fontSize: 13, fontWeight: '700', color: scheme.primary },
    followPillActive: { backgroundColor: scheme.primary, borderColor: scheme.primary },
    followPillTextActive: { color: scheme.onPrimary },
    badgeRow: { gap: 6 },
    loadingBadge: {
      alignSelf: 'flex-start',
      backgroundColor: glass.chip,
      borderRadius: 16,
      padding: 6,
    },
    warnBanner: {
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    warnText: { fontSize: 12, fontWeight: '600' },
    celebrateCard: {
      position: 'absolute',
      top: '30%',
      alignSelf: 'center',
      width: '78%',
      alignItems: 'center',
      backgroundColor: glass.strong,
      borderWidth: 1,
      borderColor: glass.strongBorder,
      borderRadius: 28,
      paddingVertical: 28,
      paddingHorizontal: 20,
      gap: 8,
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 12,
    },
    celebrateIconWrap: {
      width: 76,
      height: 76,
      borderRadius: 38,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    celebrateTitle: { fontSize: 22, fontWeight: '800' },
    celebrateSub: { fontSize: 14, fontWeight: '600' },
    enableBtn: {
      alignSelf: 'flex-start',
      marginTop: 8,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 7,
    },
    enableBtnText: { fontSize: 13, fontWeight: '700' },
    bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center', gap: 12 },
    statsPanel: {
      flexDirection: 'row',
      backgroundColor: glass.strong,
      borderWidth: 1,
      borderColor: glass.strongBorder,
      borderRadius: 18,
      paddingVertical: 10,
      paddingHorizontal: 8,
      width: '92%',
      justifyContent: 'space-around',
    },
    accText: {
      fontSize: 11,
      fontWeight: '600',
      color: scheme.onSurfaceVariant,
      backgroundColor: glass.chip,
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
      borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.85)',
    },
    bigButtonStart: { backgroundColor: scheme.primary },
    bigButtonStop: { backgroundColor: scheme.error },
    bigButtonText: { color: scheme.onPrimary, fontSize: 16, fontWeight: '800' },
  });
}

import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth-context';
import { leaderboard } from '@/lib/db';
import { useTheme } from '@/lib/theme';
import type { WalkUser } from '@/lib/types';

export default function LeaderboardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { scheme, glass } = useTheme();
  const [rows, setRows] = useState<WalkUser[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    leaderboard(50)
      .then((r) => active && setRows(r))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [refreshKey]);

  const style = makeStyles(scheme, glass);

  return (
    <SafeAreaView style={style.safe}>
      <View style={style.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={[style.back, { color: scheme.primary }]}>‹ Back</Text>
        </Pressable>
        <Text style={[style.title, { color: scheme.onBackground }]}>Territory Leaderboard</Text>
        <Pressable onPress={() => setRefreshKey((k) => k + 1)}>
          <Text style={[style.back, { color: scheme.primary }]}>Refresh</Text>
        </Pressable>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(r) => r.uid}
        contentContainerStyle={style.list}
        ListEmptyComponent={<Text style={[style.empty, { color: scheme.onSurfaceVariant }]}>No conquerors yet. Start walking!</Text>}
        renderItem={({ item, index }) => {
          const isMe = item.uid === user?.uid;
          return (
            <View
              style={[
                style.row,
                { backgroundColor: glass.panel, borderColor: isMe ? scheme.primary : glass.panelBorder },
              ]}>
              <Text style={[style.rank, { color: scheme.onSurfaceVariant }]}>{index + 1}</Text>
              <View style={style.nameCol}>
                <Text style={[style.name, { color: scheme.onSurface }]}>{item.name}</Text>
                <Text style={[style.sub, { color: scheme.onSurfaceVariant }]}>
                  {item.distinctTiles} territories · {item.totalDistanceKm.toFixed(1)} km
                </Text>
              </View>
              <Text style={[style.score, { color: scheme.primary }]}>{item.territoryScore.toLocaleString()} m²</Text>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

function makeStyles(scheme: ReturnType<typeof useTheme>['scheme'], glass: ReturnType<typeof useTheme>['glass']) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: scheme.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    back: { fontSize: 15, fontWeight: '600' },
    title: { fontSize: 18, fontWeight: '800' },
    list: { paddingHorizontal: 16, paddingBottom: 32, gap: 8 },
    empty: { textAlign: 'center', marginTop: 48 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 14,
      borderWidth: 1,
      padding: 14,
      gap: 12,
    },
    rank: { width: 28, fontSize: 16, fontWeight: '800' },
    nameCol: { flex: 1 },
    name: { fontSize: 15, fontWeight: '700' },
    sub: { fontSize: 12, marginTop: 2 },
    score: { fontSize: 15, fontWeight: '800' },
  });
}

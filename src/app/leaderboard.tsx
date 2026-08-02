import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth-context';
import { leaderboard } from '@/lib/db';
import type { WalkUser } from '@/lib/types';

export default function LeaderboardScreen() {
  const router = useRouter();
  const { user } = useAuth();
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

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Territory Leaderboard</Text>
        <Pressable onPress={() => setRefreshKey((k) => k + 1)}>
          <Text style={styles.back}>Refresh</Text>
        </Pressable>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(r) => r.uid}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No conquerors yet. Start walking!</Text>}
        renderItem={({ item, index }) => {
          const isMe = item.uid === user?.uid;
          return (
            <View style={[styles.row, isMe && styles.rowMe]}>
              <Text style={styles.rank}>{index + 1}</Text>
              <View style={styles.nameCol}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.sub}>{item.distinctTiles} territories · {item.totalDistanceKm.toFixed(1)} km</Text>
              </View>
              <Text style={styles.score}>{item.territoryScore.toLocaleString()} m²</Text>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8fafc' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  back: { color: '#2563eb', fontSize: 15, fontWeight: '600' },
  title: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 8 },
  empty: { textAlign: 'center', color: '#64748b', marginTop: 48 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  rowMe: { borderWidth: 2, borderColor: '#2563eb' },
  rank: { width: 28, fontSize: 16, fontWeight: '800', color: '#64748b' },
  nameCol: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  sub: { fontSize: 12, color: '#64748b', marginTop: 2 },
  score: { fontSize: 15, fontWeight: '800', color: '#2563eb' },
});

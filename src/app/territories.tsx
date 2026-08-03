import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth-context';
import { colorForOwner } from '@/lib/colors';
import { queryMyTerritories } from '@/lib/db';
import { timeAgo } from '@/lib/time';
import { useTheme } from '@/lib/theme';
import type { TerritoryDoc } from '@/lib/types';

export default function TerritoriesScreen() {
  const router = useRouter();
  const { firebaseUser } = useAuth();
  const { scheme, glass } = useTheme();
  const [items, setItems] = useState<TerritoryDoc[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!firebaseUser) return;
    try {
      setItems(await queryMyTerritories(firebaseUser.uid));
    } catch {
      /* keep last list */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser) {
      router.replace('/auth');
      return;
    }
    let active = true;
    queryMyTerritories(firebaseUser.uid)
      .then((r) => {
        if (active) setItems(r);
      })
      .catch(() => {})
      .finally(() => {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      });
    return () => {
      active = false;
    };
  }, [firebaseUser, router]);

  const totalArea = items.reduce((sum, t) => sum + (t.areaM2 ?? 0), 0);
  const style = makeStyles(scheme, glass);

  return (
    <SafeAreaView style={style.safe}>
      <View style={style.header}>
        <Pressable onPress={() => router.back()} style={style.backBtn}>
          <Ionicons name="chevron-back" size={20} color={scheme.primary} />
          <Text style={[style.back, { color: scheme.primary }]}>Back</Text>
        </Pressable>
        <Text style={[style.title, { color: scheme.onBackground }]}>My Territories</Text>
        <View style={{ width: 60 }} />
      </View>

      {!loading && items.length > 0 && (
        <View style={[style.summary, { backgroundColor: glass.panel, borderColor: glass.panelBorder }]}>
          <View style={style.summaryItem}>
            <Text style={[style.summaryValue, { color: scheme.onSurface }]}>
              {totalArea.toLocaleString()} m²
            </Text>
            <Text style={[style.summaryLabel, { color: scheme.onSurfaceVariant }]}>Total area</Text>
          </View>
          <View style={[style.summaryDivider, { backgroundColor: scheme.outlineVariant }]} />
          <View style={style.summaryItem}>
            <Text style={[style.summaryValue, { color: scheme.onSurface }]}>{items.length}</Text>
            <Text style={[style.summaryLabel, { color: scheme.onSurfaceVariant }]}>Territories</Text>
          </View>
        </View>
      )}

      <FlatList
        data={items}
        keyExtractor={(t) => t.id}
        contentContainerStyle={style.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={scheme.primary} />}
        ListEmptyComponent={
          <Text style={[style.empty, { color: scheme.onSurfaceVariant }]}>
            {loading ? 'Loading…' : 'No territory yet. Start walking and close a loop to claim land!'}
          </Text>
        }
        renderItem={({ item }) => (
          <View style={[style.row, { backgroundColor: glass.panel, borderColor: glass.panelBorder }]}>
            <View style={[style.dot, { backgroundColor: colorForOwner(item.ownerId, item.ownerId === firebaseUser?.uid) }]} />
            <View style={style.rowBody}>
              <Text style={[style.rowTitle, { color: scheme.onSurface }]}>
                {item.areaM2.toLocaleString()} m²
              </Text>
              <Text style={[style.rowSub, { color: scheme.onSurfaceVariant }]}>
                Captured {timeAgo(item.createdAt)}
              </Text>
            </View>
          </View>
        )}
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
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, width: 60 },
    back: { fontSize: 15, fontWeight: '600' },
    title: { fontSize: 18, fontWeight: '800' },
    summary: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 16,
      marginBottom: 12,
      borderRadius: 18,
      borderWidth: 1,
      paddingVertical: 16,
    },
    summaryItem: { flex: 1, alignItems: 'center', gap: 2 },
    summaryValue: { fontSize: 20, fontWeight: '900' },
    summaryLabel: { fontSize: 12 },
    summaryDivider: { width: 1, height: 28 },
    list: { paddingHorizontal: 16, paddingBottom: 32, gap: 8 },
    empty: { textAlign: 'center', marginTop: 48 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 16,
      borderWidth: 1,
      padding: 14,
      gap: 12,
    },
    dot: { width: 14, height: 14, borderRadius: 7 },
    rowBody: { flex: 1 },
    rowTitle: { fontSize: 16, fontWeight: '800' },
    rowSub: { fontSize: 12, marginTop: 2 },
  });
}

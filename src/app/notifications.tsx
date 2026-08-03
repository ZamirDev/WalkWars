import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth-context';
import { markNotificationsRead, subscribeNotifications, type AppNotification } from '@/lib/db';
import { timeAgo } from '@/lib/time';
import { useTheme } from '@/lib/theme';

export default function NotificationsScreen() {
  const router = useRouter();
  const { firebaseUser } = useAuth();
  const { scheme, glass } = useTheme();
  const [items, setItems] = useState<AppNotification[]>([]);

  useEffect(() => {
    if (!firebaseUser) {
      router.replace('/auth');
      return;
    }
    const unsub = subscribeNotifications(firebaseUser.uid, (list) => {
      setItems(list);
      void markNotificationsRead(firebaseUser.uid);
    });
    return unsub;
  }, [firebaseUser, router]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: scheme.background }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color={scheme.primary} />
          <Text style={[styles.back, { color: scheme.primary }]}>Back</Text>
        </Pressable>
        <Text style={[styles.title, { color: scheme.onBackground }]}>Notifications</Text>
        <View style={{ width: 60 }} />
      </View>

      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: scheme.onSurfaceVariant }]}>
            No notifications yet. Walk a loop and conquer territory!
          </Text>
        }
        renderItem={({ item }) => (
          <View style={[styles.row, { backgroundColor: glass.panel, borderColor: glass.panelBorder }]}>
            {!item.read && <View style={[styles.dot, { backgroundColor: scheme.primary }]} />}
            <View style={styles.rowBody}>
              <Text style={[styles.rowTitle, { color: scheme.onSurface }]}>{item.title}</Text>
              <Text style={[styles.rowBodyText, { color: scheme.onSurfaceVariant }]}>{item.body}</Text>
              <Text style={[styles.rowTime, { color: scheme.onSurfaceVariant }]}>{timeAgo(item.createdAt)}</Text>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
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
  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 10 },
  empty: { textAlign: 'center', marginTop: 48 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  rowBody: { flex: 1, gap: 3 },
  rowTitle: { fontSize: 15, fontWeight: '700' },
  rowBodyText: { fontSize: 13, lineHeight: 18 },
  rowTime: { fontSize: 11, marginTop: 2 },
});

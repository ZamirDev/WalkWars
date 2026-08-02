import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth-context';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOutUser } = useAuth();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Profile</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.name}>{user?.name ?? 'Walker'}</Text>
        <Text style={styles.sub}>{user?.email || 'Guest account'}</Text>

        <View style={styles.statsCard}>
          <Metric label="Territory score" value={(user?.territoryScore ?? 0).toLocaleString()} />
          <Metric label="Tiles conquered" value={String(user?.distinctTiles ?? 0)} />
          <Metric label="Distance" value={`${(user?.totalDistanceKm ?? 0).toFixed(1)} km`} />
          <Metric label="Steps" value={(user?.totalSteps ?? 0).toLocaleString()} />
        </View>

        <Pressable style={styles.proCard} onPress={() => router.push('/paywall')}>
          <Text style={styles.proTitle}>{user?.isPro ? 'Pro active' : 'Go Pro'}</Text>
          <Text style={styles.proText}>
            {user?.isPro
              ? '2× claim radius, no tile cap, no decay.'
              : '2× claim radius, unlimited tiles, no decay — 3x faster territory growth.'}
          </Text>
        </Pressable>

        <Pressable style={styles.signout} onPress={() => signOutUser().then(() => router.replace('/auth'))}>
          <Text style={styles.signoutText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8fafc' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  back: { color: '#2563eb', fontSize: 15, fontWeight: '600' },
  title: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  body: { padding: 20, gap: 16 },
  name: { fontSize: 26, fontWeight: '900', color: '#0f172a' },
  sub: { fontSize: 14, color: '#64748b', marginTop: -8 },
  statsCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metric: { width: '46%', padding: 6 },
  metricValue: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  metricLabel: { fontSize: 12, color: '#64748b', marginTop: 2 },
  proCard: { backgroundColor: '#2563eb', borderRadius: 18, padding: 18 },
  proTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  proText: { color: '#dbeafe', fontSize: 14, marginTop: 6, lineHeight: 20 },
  signout: { marginTop: 8, paddingVertical: 14, alignItems: 'center' },
  signoutText: { color: '#dc2626', fontWeight: '700', fontSize: 15 },
});

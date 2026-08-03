import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOutUser } = useAuth();
  const { scheme, glass } = useTheme();
  const style = makeStyles(scheme, glass);

  return (
    <SafeAreaView style={style.safe}>
      <View style={style.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={[style.back, { color: scheme.primary }]}>‹ Back</Text>
        </Pressable>
        <Text style={[style.title, { color: scheme.onBackground }]}>Profile</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={style.body}>
        <Text style={[style.name, { color: scheme.onSurface }]}>{user?.name ?? 'Walker'}</Text>
        <Text style={[style.sub, { color: scheme.onSurfaceVariant }]}>{user?.email || 'Guest account'}</Text>

        <View style={[style.statsCard, { backgroundColor: glass.panel, borderColor: glass.panelBorder }]}>
          <Metric label="Territory score" value={(user?.territoryScore ?? 0).toLocaleString()} />
          <Metric label="Territories" value={String(user?.distinctTiles ?? 0)} />
          <Metric label="Distance" value={`${(user?.totalDistanceKm ?? 0).toFixed(1)} km`} />
          <Metric label="Steps" value={(user?.totalSteps ?? 0).toLocaleString()} />
        </View>

        <Pressable
          style={[style.proCard, { backgroundColor: scheme.primary }]}
          onPress={() => router.push('/paywall')}>
          <Text style={[style.proTitle, { color: scheme.onPrimary }]}>{user?.isPro ? 'Pro active' : 'Go Pro'}</Text>
          <Text style={[style.proText, { color: scheme.onPrimary, opacity: 0.85 }]}>
            {user?.isPro
              ? '2× claim radius, background tracking.'
              : '2× claim radius, background tracking — territory perks coming soon.'}
          </Text>
        </Pressable>

        <Pressable style={style.signout} onPress={() => signOutUser().then(() => router.replace('/auth'))}>
          <Text style={[style.signoutText, { color: scheme.error }]}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  const { scheme } = useTheme();
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricValue, { color: scheme.onSurface }]}>{value}</Text>
      <Text style={[styles.metricLabel, { color: scheme.onSurfaceVariant }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  metric: { width: '46%', padding: 6 },
  metricValue: { fontSize: 18, fontWeight: '800' },
  metricLabel: { fontSize: 12, marginTop: 2 },
});

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
    body: { padding: 20, gap: 16 },
    name: { fontSize: 26, fontWeight: '900' },
    sub: { fontSize: 14, marginTop: -8 },
    statsCard: {
      borderRadius: 18,
      borderWidth: 1,
      padding: 16,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    proCard: { borderRadius: 18, padding: 18 },
    proTitle: { fontSize: 18, fontWeight: '800' },
    proText: { fontSize: 14, marginTop: 6, lineHeight: 20 },
    signout: { marginTop: 8, paddingVertical: 14, alignItems: 'center' },
    signoutText: { fontWeight: '700', fontSize: 15 },
  });
}

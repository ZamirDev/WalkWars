import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme';

export default function PaywallScreen() {
  const router = useRouter();
  const { scheme, glass } = useTheme();
  const style = makeStyles(scheme, glass);

  return (
    <SafeAreaView style={style.safe}>
      <View style={style.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={[style.back, { color: scheme.primary }]}>‹ Back</Text>
        </Pressable>
      </View>

      <View style={style.body}>
        <Text style={[style.title, { color: scheme.onBackground }]}>TerWalk Pro</Text>
        <Text style={[style.sub, { color: scheme.onSurfaceVariant }]}>Own more. Keep it longer. Walk faster.</Text>

        <View style={style.card}>
          <Plan name="Free" price="₹0" />
          <Plan name="Pro" price="₹99/mo" highlight />
        </View>

        <View style={[style.perks, { backgroundColor: glass.panel, borderColor: glass.panelBorder }]}>
          <Perk label="Claim radius" free="15 m" pro="30 m" />
          <Perk label="Background tracking" free="No" pro="Yes" />
          <Perk label="Territory perks" free="In dev" pro="In dev" />
        </View>

        <Pressable style={[style.cta, { backgroundColor: scheme.primary }]}>
          <Text style={[style.ctaText, { color: scheme.onPrimary }]}>Upgrade to Pro — coming soon</Text>
        </Pressable>
        <Text style={[style.note, { color: scheme.onSurfaceVariant }]}>
          Subscriptions are powered by RevenueCat and will open here once the store build is ready.
        </Text>
      </View>
    </SafeAreaView>
  );
}

function Plan({ name, price, highlight }: { name: string; price: string; highlight?: boolean }) {
  const { scheme } = useTheme();
  return (
    <View
      style={[
        styles.plan,
        {
          backgroundColor: highlight ? scheme.primaryContainer : scheme.surface,
          borderColor: highlight ? scheme.primary : scheme.outlineVariant,
        },
      ]}>
      <Text style={[styles.planName, { color: highlight ? scheme.primary : scheme.onSurfaceVariant }]}>{name}</Text>
      <Text style={[styles.planPrice, { color: highlight ? scheme.primary : scheme.onSurface }]}>{price}</Text>
    </View>
  );
}

function Perk({ label, free, pro }: { label: string; free: string; pro: string }) {
  const { scheme } = useTheme();
  return (
    <View style={styles.perkRow}>
      <Text style={[styles.perkLabel, { color: scheme.onSurface }]}>{label}</Text>
      <View style={styles.perkValues}>
        <Text style={[styles.perkFree, { color: scheme.onSurfaceVariant }]}>{free}</Text>
        <Text style={[styles.perkPro, { color: scheme.primary }]}>{pro}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  plan: { flex: 1, borderRadius: 16, padding: 16, borderWidth: 2 },
  planName: { fontSize: 14, fontWeight: '700' },
  planPrice: { fontSize: 24, fontWeight: '900', marginTop: 4 },
  perkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  perkLabel: { fontSize: 14, fontWeight: '600' },
  perkValues: { flexDirection: 'row', gap: 16 },
  perkFree: { fontSize: 14, width: 70, textAlign: 'right' },
  perkPro: { fontSize: 14, fontWeight: '700', width: 70, textAlign: 'right' },
});

function makeStyles(scheme: ReturnType<typeof useTheme>['scheme'], glass: ReturnType<typeof useTheme>['glass']) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: scheme.background },
    header: { paddingHorizontal: 16, paddingVertical: 12 },
    back: { fontSize: 15, fontWeight: '600' },
    body: { padding: 20, gap: 16 },
    title: { fontSize: 30, fontWeight: '900' },
    sub: { fontSize: 15, marginTop: -10 },
    card: { flexDirection: 'row', gap: 12 },
    perks: { borderRadius: 16, padding: 16, gap: 10, borderWidth: 1 },
    cta: { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
    ctaText: { fontWeight: '800', fontSize: 16 },
    note: { fontSize: 12, textAlign: 'center' },
  });
}

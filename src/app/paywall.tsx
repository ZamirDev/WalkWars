import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function PaywallScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
      </View>

      <View style={styles.body}>
        <Text style={styles.title}>WalkWars Pro</Text>
        <Text style={styles.sub}>Own more. Keep it longer. Walk faster.</Text>

        <View style={styles.card}>
          <Plan name="Free" price="₹0" />
          <Plan name="Pro" price="₹99/mo" highlight />
        </View>

        <View style={styles.perks}>
          <Perk label="Claim radius" free="15 m" pro="30 m" />
          <Perk label="Background tracking" free="No" pro="Yes" />
          <Perk label="Territory perks" free="In dev" pro="In dev" />
        </View>

        <Pressable style={styles.cta}>
          <Text style={styles.ctaText}>Upgrade to Pro — coming soon</Text>
        </Pressable>
        <Text style={styles.note}>Subscriptions are powered by RevenueCat and will open here once the store build is ready.</Text>
      </View>
    </SafeAreaView>
  );
}

function Plan({ name, price, highlight }: { name: string; price: string; highlight?: boolean }) {
  return (
    <View style={[styles.plan, highlight && styles.planHighlight]}>
      <Text style={[styles.planName, highlight && styles.planNameHighlight]}>{name}</Text>
      <Text style={[styles.planPrice, highlight && styles.planPriceHighlight]}>{price}</Text>
    </View>
  );
}

function Perk({ label, free, pro }: { label: string; free: string; pro: string }) {
  return (
    <View style={styles.perkRow}>
      <Text style={styles.perkLabel}>{label}</Text>
      <View style={styles.perkValues}>
        <Text style={styles.perkFree}>{free}</Text>
        <Text style={styles.perkPro}>{pro}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8fafc' },
  header: { paddingHorizontal: 16, paddingVertical: 12 },
  back: { color: '#2563eb', fontSize: 15, fontWeight: '600' },
  body: { padding: 20, gap: 16 },
  title: { fontSize: 30, fontWeight: '900', color: '#0f172a' },
  sub: { fontSize: 15, color: '#64748b', marginTop: -10 },
  card: { flexDirection: 'row', gap: 12 },
  plan: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 2, borderColor: '#e2e8f0' },
  planHighlight: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  planName: { fontSize: 14, fontWeight: '700', color: '#64748b' },
  planNameHighlight: { color: '#2563eb' },
  planPrice: { fontSize: 24, fontWeight: '900', color: '#0f172a', marginTop: 4 },
  planPriceHighlight: { color: '#2563eb' },
  perks: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 10 },
  perkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  perkLabel: { fontSize: 14, color: '#334155', fontWeight: '600' },
  perkValues: { flexDirection: 'row', gap: 16 },
  perkFree: { fontSize: 14, color: '#94a3b8', width: 70, textAlign: 'right' },
  perkPro: { fontSize: 14, color: '#2563eb', fontWeight: '700', width: 70, textAlign: 'right' },
  cta: { backgroundColor: '#2563eb', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  note: { fontSize: 12, color: '#94a3b8', textAlign: 'center' },
});

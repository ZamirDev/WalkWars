import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth-context';
import { subscribeNotifications, type AppNotification } from '@/lib/db';
import { useTheme } from '@/lib/theme';

export default function HomeScreen() {
  const router = useRouter();
  const { firebaseUser, user } = useAuth();
  const { scheme, glass, isDark } = useTheme();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  useEffect(() => {
    if (!firebaseUser) {
      router.replace('/auth');
      return;
    }
    const unsub = subscribeNotifications(firebaseUser.uid, setNotifications);
    return unsub;
  }, [firebaseUser, router]);

  const unread = notifications.filter((n) => !n.read).length;
  const style = makeStyles(scheme, glass, isDark);

  return (
    <SafeAreaView style={style.safe}>
      <View style={style.blobPrimary} pointerEvents="none" />
      <View style={style.blobTertiary} pointerEvents="none" />
      <View style={style.blobSecondary} pointerEvents="none" />

      <View style={style.topBar}>
        <Pressable
          style={style.iconButton}
          onPress={() => router.push('/notifications')}
          accessibilityLabel="Notifications">
          <Ionicons name="notifications-outline" size={22} color={scheme.onSurface} />
          {unread > 0 && (
            <View style={style.badge}>
              <Text style={style.badgeText}>{unread > 9 ? '9+' : unread}</Text>
            </View>
          )}
        </Pressable>
      </View>

      <View style={style.hero}>
        <Text style={style.logo}>TerWalk</Text>
        <Text style={style.tagline}>Walk. Claim. Conquer the streets.</Text>

        <Pressable
          style={style.statsCard}
          onPress={() => router.push('/territories')}
          accessibilityLabel="View my territories">
          <Stat label="Territory" value={`${(user?.territoryScore ?? 0).toLocaleString()} m²`} />
          <Stat label="Territories" value={String(user?.distinctTiles ?? 0)} />
          <Stat label="Distance" value={`${(user?.totalDistanceKm ?? 0).toFixed(1)} km`} />
          <Ionicons name="chevron-forward" size={18} color={scheme.onSurfaceVariant} />
        </Pressable>
      </View>

      <View style={style.footer}>
        <Pressable
          style={style.startButton}
          onPress={() => router.push('/map?autostart=1')}
          accessibilityLabel="Start walk">
          <View style={style.startIcon}>
            <Ionicons name="walk" size={34} color={scheme.onPrimary} />
          </View>
          <Text style={style.startText}>Start Walk</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const { scheme } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: 2 }}>
      <Text style={{ fontSize: 18, fontWeight: '800', color: scheme.onSurface }}>{value}</Text>
      <Text style={{ fontSize: 11, color: scheme.onSurfaceVariant }}>{label}</Text>
    </View>
  );
}

function makeStyles(scheme: ReturnType<typeof useTheme>['scheme'], glass: ReturnType<typeof useTheme>['glass'], isDark: boolean) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: scheme.background, overflow: 'hidden' },
    blobPrimary: {
      position: 'absolute',
      width: 320,
      height: 320,
      borderRadius: 160,
      backgroundColor: scheme.primaryContainer,
      opacity: isDark ? 0.5 : 0.9,
      top: -80,
      left: -100,
    },
    blobTertiary: {
      position: 'absolute',
      width: 260,
      height: 260,
      borderRadius: 130,
      backgroundColor: scheme.tertiaryContainer,
      opacity: isDark ? 0.35 : 0.7,
      bottom: 120,
      right: -90,
    },
    blobSecondary: {
      position: 'absolute',
      width: 180,
      height: 180,
      borderRadius: 90,
      backgroundColor: scheme.secondaryContainer,
      opacity: isDark ? 0.3 : 0.6,
      top: '45%',
      left: -60,
    },
    topBar: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      paddingHorizontal: 20,
      paddingTop: 8,
    },
    iconButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: glass.chip,
      borderWidth: 1,
      borderColor: glass.chipBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badge: {
      position: 'absolute',
      top: -4,
      right: -4,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: scheme.error,
      paddingHorizontal: 4,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: scheme.background,
    },
    badgeText: { color: scheme.onError, fontSize: 10, fontWeight: '800' },
    hero: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10, paddingHorizontal: 24 },
    logo: { fontSize: 48, fontWeight: '900', color: scheme.primary, letterSpacing: -1 },
    tagline: { fontSize: 15, color: scheme.onSurfaceVariant, marginBottom: 12, textAlign: 'center' },
    statsCard: {
      flexDirection: 'row',
      backgroundColor: glass.panel,
      borderWidth: 1,
      borderColor: glass.panelBorder,
      borderRadius: 22,
      paddingVertical: 16,
      paddingHorizontal: 12,
      width: '100%',
      justifyContent: 'space-around',
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
    footer: { paddingHorizontal: 24, paddingBottom: 36, alignItems: 'center' },
    startButton: {
      width: 150,
      height: 150,
      borderRadius: 75,
      backgroundColor: scheme.primary,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      borderWidth: 6,
      borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.85)',
      shadowColor: scheme.primary,
      shadowOpacity: 0.4,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8,
    },
    startIcon: { marginBottom: 2 },
    startText: { color: scheme.onPrimary, fontSize: 16, fontWeight: '800' },
  });
}

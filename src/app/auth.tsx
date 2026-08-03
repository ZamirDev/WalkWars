import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme';

export default function AuthScreen() {
  const router = useRouter();
  const { firebaseUser, signInAnon, signIn, signUp } = useAuth();
  const { scheme, glass, isDark } = useTheme();
  const [mode, setMode] = useState<'signin' | 'signup'>('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (firebaseUser) router.replace('/');
  }, [firebaseUser, router]);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      if (mode === 'signup') {
        if (!name.trim()) throw new Error('Enter a name');
        await signUp(email.trim(), password, name.trim());
      } else {
        await signIn(email.trim(), password);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  async function anon() {
    setError(null);
    setBusy(true);
    try {
      await signInAnon();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  const style = makeStyles(scheme, glass, isDark);

  return (
    <SafeAreaView style={style.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={style.center}>
        <Text style={style.logo}>TerWalk</Text>
        <Text style={style.tagline}>Walk. Claim. Conquer the streets.</Text>

        <View style={style.card}>
          <Text style={style.heading}>{mode === 'signup' ? 'Create account' : 'Sign in'}</Text>
          {mode === 'signup' && (
            <TextInput
              style={style.input}
              placeholder="Name"
              placeholderTextColor={scheme.onSurfaceVariant}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
          )}
          <TextInput
            style={style.input}
            placeholder="Email"
            placeholderTextColor={scheme.onSurfaceVariant}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            style={style.input}
            placeholder="Password"
            placeholderTextColor={scheme.onSurfaceVariant}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          {error && <Text style={[style.error, { color: scheme.error }]}>{error}</Text>}
          <Pressable style={[style.primary, busy && style.disabled]} onPress={submit} disabled={busy}>
            <Text style={style.primaryText}>{mode === 'signup' ? 'Sign up' : 'Sign in'}</Text>
          </Pressable>
          <Pressable onPress={() => setMode(mode === 'signup' ? 'signin' : 'signup')}>
            <Text style={[style.switch, { color: scheme.primary }]}>
              {mode === 'signup' ? 'Already have an account? Sign in' : 'New here? Create account'}
            </Text>
          </Pressable>
          <View style={[style.divider, { backgroundColor: scheme.outlineVariant }]} />
          <Pressable style={style.secondary} onPress={anon} disabled={busy}>
            <Text style={[style.secondaryText, { color: scheme.onSurface }]}>Continue as guest</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(scheme: ReturnType<typeof useTheme>['scheme'], glass: ReturnType<typeof useTheme>['glass'], isDark: boolean) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: scheme.background },
    center: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
    logo: { fontSize: 40, fontWeight: '900', color: scheme.primary, textAlign: 'center' },
    tagline: { fontSize: 15, color: scheme.onSurfaceVariant, textAlign: 'center', marginBottom: 12 },
    card: {
      backgroundColor: glass.panel,
      borderRadius: 20,
      padding: 20,
      gap: 12,
      borderWidth: 1,
      borderColor: glass.panelBorder,
      shadowColor: '#000',
      shadowOpacity: 0.06,
      shadowRadius: 12,
      elevation: 2,
    },
    heading: { fontSize: 18, fontWeight: '700', color: scheme.onSurface },
    input: {
      borderWidth: 1,
      borderColor: scheme.outlineVariant,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: scheme.onSurface,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.6)',
    },
    error: { fontSize: 13 },
    primary: { backgroundColor: scheme.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
    primaryText: { color: scheme.onPrimary, fontWeight: '700', fontSize: 16 },
    switch: { fontSize: 13, textAlign: 'center' },
    divider: { height: 1 },
    secondary: { borderWidth: 1, borderColor: scheme.outlineVariant, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
    secondaryText: { fontWeight: '600', fontSize: 15 },
    disabled: { opacity: 0.5 },
  });
}

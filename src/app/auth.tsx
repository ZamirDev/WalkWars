import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth-context';

export default function AuthScreen() {
  const router = useRouter();
  const { firebaseUser, signInAnon, signIn, signUp } = useAuth();
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

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.center}>
        <Text style={styles.logo}>WalkWars</Text>
        <Text style={styles.tagline}>Walk. Claim. Conquer the streets.</Text>

        <View style={styles.card}>
          <Text style={styles.heading}>{mode === 'signup' ? 'Create account' : 'Sign in'}</Text>
          {mode === 'signup' && (
            <TextInput style={styles.input} placeholder="Name" value={name} onChangeText={setName} autoCapitalize="words" />
          )}
          <TextInput
            style={styles.input}
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          {error && <Text style={styles.error}>{error}</Text>}
          <Pressable style={[styles.primary, busy && styles.disabled]} onPress={submit} disabled={busy}>
            <Text style={styles.primaryText}>{mode === 'signup' ? 'Sign up' : 'Sign in'}</Text>
          </Pressable>
          <Pressable onPress={() => setMode(mode === 'signup' ? 'signin' : 'signup')}>
            <Text style={styles.switch}>
              {mode === 'signup' ? 'Already have an account? Sign in' : 'New here? Create account'}
            </Text>
          </Pressable>
          <View style={styles.divider} />
          <Pressable style={styles.secondary} onPress={anon} disabled={busy}>
            <Text style={styles.secondaryText}>Continue as guest</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  logo: { fontSize: 40, fontWeight: '900', color: '#2563eb', textAlign: 'center' },
  tagline: { fontSize: 15, color: '#64748b', textAlign: 'center', marginBottom: 12 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 20, gap: 12, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, elevation: 2 },
  heading: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  error: { color: '#dc2626', fontSize: 13 },
  primary: { backgroundColor: '#2563eb', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  switch: { color: '#2563eb', fontSize: 13, textAlign: 'center' },
  divider: { height: 1, backgroundColor: '#e2e8f0' },
  secondary: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  secondaryText: { color: '#0f172a', fontWeight: '600', fontSize: 15 },
  disabled: { opacity: 0.5 },
});

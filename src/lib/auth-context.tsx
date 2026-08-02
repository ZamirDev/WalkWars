import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  auth,
  createUserWithEmailAndPassword,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
} from './firebase';
import { ensureUser, getUser } from './db';
import type { WalkUser } from './types';

interface AuthCtx {
  firebaseUser: User | null;
  user: WalkUser | null;
  loading: boolean;
  signInAnon: () => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOutUser: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

function displayNameFor(email: string): string {
  const base = email.split('@')[0] ?? 'Walker';
  return base.charAt(0).toUpperCase() + base.slice(1);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [user, setUser] = useState<WalkUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fb) => {
      setFirebaseUser(fb);
      if (fb) {
        let profile = await getUser(fb.uid);
        if (!profile) {
          await ensureUser(fb.uid, {
            name: fb.displayName ?? displayNameFor(fb.email ?? fb.uid),
            email: fb.email ?? undefined,
            avatar: fb.photoURL ?? undefined,
          });
          profile = await getUser(fb.uid);
        }
        setUser(profile);
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      firebaseUser,
      user,
      loading,
      signInAnon: async () => {
        const cred = await signInAnonymously(auth);
        await ensureUser(cred.user.uid, { name: `Walker-${cred.user.uid.slice(0, 4)}` });
      },
      signUp: async (email, password, name) => {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await ensureUser(cred.user.uid, { name, email });
      },
      signIn: async (email, password) => {
        await signInWithEmailAndPassword(auth, email, password);
      },
      signOutUser: async () => {
        await signOut(auth);
      },
    }),
    [firebaseUser, user, loading]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

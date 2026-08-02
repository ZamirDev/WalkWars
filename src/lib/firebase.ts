import { initializeApp, getApps } from 'firebase/app';
import {
  initializeAuth,
  getReactNativePersistence,
  signInAnonymously,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  runTransaction,
  increment,
  query,
  orderBy,
  limit,
  getDocs,
  type Firestore,
} from 'firebase/firestore';
import { firebaseConfig } from './firebase.config';

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage),
});
export const db: Firestore = getFirestore(app);

export { signInAnonymously, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut };
export type { FirebaseUser };
export { collection, doc, getDoc, setDoc, updateDoc, runTransaction, increment, query, orderBy, limit, getDocs };

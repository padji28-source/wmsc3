/// <reference types="vite/client" />
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache } from 'firebase/firestore';
import firebaseConfigJson from '../firebase-applet-config.json';

// Support loading from environment variables (e.g. on Vercel) with fallback to local JSON
const firebaseConfig = {
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || firebaseConfigJson.projectId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || firebaseConfigJson.appId,
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || firebaseConfigJson.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfigJson.authDomain,
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_DATABASE_ID || firebaseConfigJson.firestoreDatabaseId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfigJson.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfigJson.messagingSenderId,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || firebaseConfigJson.measurementId || "",
};

const app = initializeApp(firebaseConfig);

let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()})
  }, firebaseConfig.firestoreDatabaseId); // CRITICAL
} catch (err) {
  console.warn("Firestore persistent local cache initialization failed. Falling back to memory local cache.", err);
  db = initializeFirestore(app, {
    localCache: memoryLocalCache()
  }, firebaseConfig.firestoreDatabaseId);
}

export { db };

let auth;
try {
  auth = getAuth(app);
} catch (err) {
  console.error("Firebase Auth initialization failed:", err);
  auth = {} as any; // Fallback object to avoid crash
}

export { auth };


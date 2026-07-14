
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getAuth, type Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDRODtUWMuKcWapJwPOQe4V1IDjYG2aadQ",
  authDomain: "al-muhafiz-trackers.firebaseapp.com",
  databaseURL: "https://al-muhafiz-trackers-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "al-muhafiz-trackers",
  storageBucket: "al-muhafiz-trackers.firebasestorage.app",
  messagingSenderId: "846385769012",
  appId: "1:846385769012:web:e58923db851b6d19baf861"
};

type FirebaseServices = {
  app: FirebaseApp;
  db: Firestore;
  auth: Auth;
};

let services: FirebaseServices | null = null;

// This function initializes and returns Firebase services, ensuring it only happens once.
export const getFirebaseServices = (): FirebaseServices => {
  if (services) {
    return services;
  }
  const app: FirebaseApp = !getApps().length ? initializeApp(firebaseConfig) : getApp();
  const db = getFirestore(app);
  const auth = getAuth(app);
  services = { app, db, auth };
  return services;
};

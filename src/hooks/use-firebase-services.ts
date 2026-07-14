
'use client';

import { useState, useEffect } from 'react';
import { getFirebaseServices } from '@/lib/firebase';
import type { FirebaseApp } from 'firebase/app';
import type { Firestore } from 'firebase/firestore';
import type { Auth } from 'firebase/auth';

type FirebaseServices = {
  app: FirebaseApp;
  db: Firestore;
  auth: Auth;
};

export function useFirebaseServices() {
  const [services, setServices] = useState<FirebaseServices | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // getFirebaseServices is synchronous but we use useEffect to ensure
    // it's only called on the client side.
    try {
      const firebaseServices = getFirebaseServices();
      setServices(firebaseServices);
    } catch (error) {
      console.error("Failed to initialize Firebase:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { 
    app: services?.app, 
    db: services?.db, 
    auth: services?.auth, 
    isLoading 
  };
}

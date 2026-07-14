
'use client';

import { useState, useEffect, useMemo, DependencyList } from 'react';
import {
  Query,
  onSnapshot,
  DocumentData,
  FirestoreError,
  QuerySnapshot,
  CollectionReference,
  DocumentReference,
  DocumentSnapshot,
} from 'firebase/firestore';
import { useAuth } from '@/contexts/auth-context';


/** Utility type to add an 'id' field to a given type T. */
export type WithId<T> = T & { id: string };

/**
 * Interface for the return value of the useCollection hook.
 * @template T Type of the document data.
 */
export interface UseCollectionResult<T> {
  data: WithId<T>[] | null; // Document data with ID, or null.
  isLoading: boolean;       // True if loading.
  error: FirestoreError | Error | null; // Error object, or null.
}

/**
 * React hook to subscribe to a Firestore collection or query in real-time.
 * It waits until authentication is resolved before fetching data.
 * 
 * IMPORTANT! YOU MUST MEMOIZE the inputted targetRefOrQuery.
 * Use `useMemo` for this to prevent re-renders.
 *  
 * @template T Optional type for document data. Defaults to any.
 * @param {CollectionReference<DocumentData> | Query<DocumentData> | null | undefined} targetRefOrQuery -
 * The Firestore CollectionReference or Query. 
 * @returns {UseCollectionResult<T>} Object with data, isLoading, error.
 */
export function useCollection<T = any>(
    memoizedTargetRefOrQuery: ((CollectionReference<DocumentData> | Query<DocumentData>))  | null | undefined,
): UseCollectionResult<T> {
  const { firebaseUser, isLoading: isAuthLoading } = useAuth();
  type ResultItemType = WithId<T>;
  type StateDataType = ResultItemType[] | null;

  const [data, setData] = useState<StateDataType>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<FirestoreError | Error | null>(null);

  useEffect(() => {
    // Wait until auth state is resolved and the user is authenticated
    if (isAuthLoading || !firebaseUser || !memoizedTargetRefOrQuery) {
      setIsLoading(isAuthLoading);
      if (!firebaseUser && !isAuthLoading) {
        setData(null);
      }
      return;
    }

    setIsLoading(true);
    setError(null);

    const unsubscribe = onSnapshot(
      memoizedTargetRefOrQuery,
      (snapshot: QuerySnapshot<DocumentData>) => {
        const results: ResultItemType[] = [];
        for (const doc of snapshot.docs) {
          results.push({ ...(doc.data() as T), id: doc.id });
        }
        setData(results);
        setError(null);
        setIsLoading(false);
      },
      (error: FirestoreError) => {
        console.error("Firestore Error in useCollection:", error);
        setError(error)
        setData(null)
        setIsLoading(false)
      }
    );

    return () => unsubscribe();
  }, [memoizedTargetRefOrQuery, firebaseUser, isAuthLoading]);

  return { data, isLoading, error };
}


/**
 * Interface for the return value of the useDoc hook.
 * @template T Type of the document data.
 */
export interface UseDocResult<T> {
  data: WithId<T> | null; // Document data with ID, or null.
  isLoading: boolean;       // True if loading.
  error: FirestoreError | Error | null; // Error object, or null.
}

/**
 * React hook to subscribe to a single Firestore document in real-time.
 * It waits until authentication is resolved before fetching data.
 *
 * IMPORTANT! YOU MUST MEMOIZE the inputted docRef.
 * Use `useMemo` to prevent re-renders.
 *
 * @template T Optional type for document data. Defaults to any.
 * @param {DocumentReference<DocumentData> | null | undefined} docRef -
 * The Firestore DocumentReference.
 * @returns {UseDocResult<T>} Object with data, isLoading, error.
 */
export function useDoc<T = any>(
  memoizedDocRef: (DocumentReference<DocumentData>) | null | undefined,
): UseDocResult<T> {
  const { firebaseUser, isLoading: isAuthLoading } = useAuth();
  type StateDataType = WithId<T> | null;

  const [data, setData] = useState<StateDataType>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<FirestoreError | Error | null>(null);

  useEffect(() => {
    // Wait until auth state is resolved and the user is authenticated
    if (isAuthLoading || !firebaseUser || !memoizedDocRef) {
      setIsLoading(isAuthLoading);
      if (!firebaseUser && !isAuthLoading) {
        setData(null);
      }
      return;
    }

    setIsLoading(true);
    setError(null);

    const unsubscribe = onSnapshot(
      memoizedDocRef,
      (snapshot: DocumentSnapshot<DocumentData>) => {
        if (snapshot.exists()) {
          setData({ ...(snapshot.data() as T), id: snapshot.id });
        } else {
          setData(null);
        }
        setError(null);
        setIsLoading(false);
      },
      (error: FirestoreError) => {
        console.error("Firestore Error in useDoc:", error);
        setError(error);
        setData(null);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [memoizedDocRef, firebaseUser, isAuthLoading]);

  return { data, isLoading, error };
}


type MemoFirebase <T> = T & {__memo?: boolean};

export function useMemoFirebase<T>(factory: () => T, deps: DependencyList): T | (MemoFirebase<T>) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const memoized = useMemo(factory, deps);
  
  if(typeof memoized !== 'object' || memoized === null) return memoized;
  // This is a temporary workaround to avoid a full-blown useMemo validation.
  // In a real app, you'd use a more robust solution.
  // (memoized as MemoFirebase<T>).__memo = true;
  
  return memoized;
}

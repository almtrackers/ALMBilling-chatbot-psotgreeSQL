
'use client';

import {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  type SetOptions,
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { getFirebaseServices } from '@/lib/firebase';

// This file centralizes non-blocking Firestore write operations.

/**
 * Initiates a setDoc operation. Does NOT await the write.
 */
export function setDocumentNonBlocking(
  collectionPath: string,
  docId: string,
  data: any,
  options?: SetOptions
) {
  const { db } = getFirebaseServices();
  if (!db) return;
  const docRef = doc(db, collectionPath, docId);
  setDoc(docRef, data, options || {}).catch((error) => {
    errorEmitter.emit(
      'permission-error',
      new FirestorePermissionError({
        path: docRef.path,
        operation: 'write',
        requestResourceData: data,
      })
    );
  });
}

/**
 * Initiates an updateDoc operation. Does NOT await the write.
 */
export function updateDocumentNonBlocking(
  collectionPath: string,
  docId: string,
  data: any
) {
  const { db } = getFirebaseServices();
  if (!db) return;
  const docRef = doc(db, collectionPath, docId);
  updateDoc(docRef, data).catch((error) => {
    errorEmitter.emit(
      'permission-error',
      new FirestorePermissionError({
        path: docRef.path,
        operation: 'update',
        requestResourceData: data,
      })
    );
  });
}

/**
 * Initiates a deleteDoc operation. Does NOT await the write.
 */
export function deleteDocumentNonBlocking(
  collectionPath: string,
  docId: string
) {
  const { db } = getFirebaseServices();
  if (!db) return;
  const docRef = doc(db, collectionPath, docId);
  deleteDoc(docRef).catch((error) => {
    errorEmitter.emit(
      'permission-error',
      new FirestorePermissionError({
        path: docRef.path,
        operation: 'delete',
      })
    );
  });
}

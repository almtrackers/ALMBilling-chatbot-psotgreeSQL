
'use client';

import {
  createContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
  useContext,
} from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api';
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User as FirebaseUser,
  updatePassword as firebaseUpdatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from 'firebase/auth';
import { useFirebaseServices } from '@/hooks/use-firebase-services';
import { doc, getDoc } from 'firebase/firestore';
import type { TraccarUser } from '@/lib/types';

const phoneRegex = /^03\d{9}$/;

type AuthResult = {
  success: boolean;
  message?: string;
};

const simpleHash = (s: string) => {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    const char = s.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash.toString();
};

function resolveEmail(emailOrPhone: string): string {
  return phoneRegex.test(emailOrPhone) ? `${emailOrPhone}@almtrace.com` : emailOrPhone;
}

async function fetchSessionUser(): Promise<TraccarUser | null> {
  const response = await fetch('/api/traccar/session', {
    credentials: 'include',
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: TraccarUser | null;
  firebaseUser: FirebaseUser | null;
  isAdmin: boolean;
  isLoading: boolean;
  login: (emailOrPhone: string, password: string) => Promise<AuthResult>;
  logout: () => void;
  updatePassword: (currentPass: string, newPass: string) => Promise<AuthResult>;
  verifyPin: (pin: string) => Promise<boolean>;
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { auth, db } = useFirebaseServices();
  const [user, setUser] = useState<TraccarUser | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const isAdmin = user?.administrator || false;

  const syncFirebaseAuth = useCallback(
    async (email: string, password: string) => {
      if (!auth) return;
      try {
        await signInWithEmailAndPassword(auth, email, password);
      } catch (error) {
        console.error('Firebase sign-in failed after Traccar login:', error);
      }
    },
    [auth]
  );

  const clearSession = useCallback(() => {
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const sessionUser = await fetchSessionUser();
      if (sessionUser?.administrator) {
        setUser(sessionUser);
      }
    } catch (error) {
      console.error('Failed to refresh user session', error);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      try {
        const sessionUser = await fetchSessionUser();
        if (!isMounted) return;

        if (sessionUser?.administrator) {
          setUser(sessionUser);
        } else {
          setUser(null);
        }
      } catch {
        if (isMounted) {
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    restoreSession();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, setFirebaseUser);
    return () => unsubscribe();
  }, [auth]);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/traccar/session', {
        method: 'DELETE',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Failed to delete server session, logging out locally anyway.', error);
    }

    clearSession();
    if (auth) {
      await firebaseSignOut(auth);
    }
    router.push('/login');
  }, [router, clearSession, auth]);

  const login = async (emailOrPhone: string, password: string): Promise<AuthResult> => {
    const email = resolveEmail(emailOrPhone);

    try {
      const response = await fetch('/api/traccar/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ email, password }),
        credentials: 'include',
      });

      if (!response.ok) {
        let message = 'Invalid username or password.';
        try {
          const errorBody = await response.text();
          if (errorBody) {
            message = errorBody;
          }
        } catch {
          // ignore parse errors
        }
        return { success: false, message };
      }

      const traccarUserData: TraccarUser = await response.json();

      if (!traccarUserData.administrator) {
        await fetch('/api/traccar/session', {
          method: 'DELETE',
          credentials: 'include',
        });
        return {
          success: false,
          message: 'Access Denied: Administrator privileges required.',
        };
      }

      setUser(traccarUserData);
      await syncFirebaseAuth(email, password);
      return { success: true };
    } catch (error: unknown) {
      console.error('Login process failed:', error);
      clearSession();
      const message =
        error instanceof Error ? error.message : 'An unexpected error occurred during login.';
      return { success: false, message };
    }
  };

  const updatePassword = async (currentPass: string, newPass: string): Promise<AuthResult> => {
    if (!user?.email) {
      return { success: false, message: 'Not authenticated.' };
    }

    try {
      const verifyQuery = `email=${encodeURIComponent(user.email)}&password=${encodeURIComponent(currentPass)}`;
      const verifyResponse = await fetch('/api/traccar/session', {
        method: 'POST',
        body: new URLSearchParams(verifyQuery),
        credentials: 'include',
      });

      if (!verifyResponse.ok) {
        return { success: false, message: 'The current password you entered is incorrect.' };
      }

      await apiClient.put(`/users/${user.id}`, {
        ...user,
        password: newPass,
      });

      if (auth?.currentUser) {
        const fbUser = auth.currentUser;
        const credential = EmailAuthProvider.credential(fbUser.email!, currentPass);
        await reauthenticateWithCredential(fbUser, credential);
        await firebaseUpdatePassword(fbUser, newPass);
      } else {
        await syncFirebaseAuth(user.email, newPass);
      }

      return { success: true };
    } catch (error: unknown) {
      console.error('Password update failed:', error);
      let message = 'An unexpected error occurred.';
      if (error && typeof error === 'object' && 'code' in error) {
        const code = String((error as { code?: string }).code);
        if (code === 'auth/wrong-password') {
          message = 'The current password you entered is incorrect.';
        } else if (code === 'auth/weak-password') {
          message = 'The new password is not strong enough.';
        }
      } else if (error instanceof Error) {
        message = error.message;
      }
      return { success: false, message };
    }
  };

  const verifyPin = async (pin: string): Promise<boolean> => {
    if (!user?.email || !db) {
      return false;
    }
    try {
      const pinDocRef = doc(db, 'userPins', user.email);
      const pinDoc = await getDoc(pinDocRef);

      if (pinDoc.exists()) {
        const storedHash = pinDoc.data().pin;
        const enteredHash = simpleHash(pin);
        return storedHash === enteredHash;
      }
      return false;
    } catch (error) {
      console.error('Error verifying PIN:', error);
      return false;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: !!user,
        user,
        firebaseUser,
        isAdmin,
        isLoading,
        login,
        logout,
        updatePassword,
        verifyPin,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

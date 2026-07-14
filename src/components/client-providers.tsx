'use client';

import { AuthProvider } from '@/contexts/auth-context';
import { SWRConfig } from 'swr';
import { localStorageProvider } from '@/lib/swr-cache';
import { ThemeProvider } from 'next-themes';
import { FirebaseErrorListener } from './FirebaseErrorListener';
import { WebSocketProvider } from '@/contexts/websocket-context';

export default function ClientProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SWRConfig value={{ provider: localStorageProvider }}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <AuthProvider>
          <WebSocketProvider>
            {children}
            <FirebaseErrorListener />
          </WebSocketProvider>
        </AuthProvider>
      </ThemeProvider>
    </SWRConfig>
  );
}

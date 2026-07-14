'use client';

import ClientProviders from './client-providers';

export default function Providers({ children }: { children: React.ReactNode }) {
  return <ClientProviders>{children}</ClientProviders>;
}

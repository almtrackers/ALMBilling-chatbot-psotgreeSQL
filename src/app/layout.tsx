
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import Providers from '@/components/providers';
import { TouchScrollBootstrap } from '@/components/touch-scroll-bootstrap';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'AL-MUHAFIZ TRACKERS (PVT) LTD',
  description: 'Subscription & Billing Management',
  icons: {
    icon: '/logo.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={cn(
          'min-h-screen bg-background font-sans antialiased',
          inter.variable
        )}
      >
        <TouchScrollBootstrap />
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}

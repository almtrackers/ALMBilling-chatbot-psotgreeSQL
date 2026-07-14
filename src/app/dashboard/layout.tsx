
'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Menu, Bell } from 'lucide-react';
import { MainNav } from '@/components/dashboard/main-nav';
import { UserNav } from '@/components/dashboard/user-nav';
import Logo from '@/components/logo';
import AuthGuard from '@/components/auth/auth-guard';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  return (
    <AuthGuard>
      <div className="grid min-h-screen w-full md:grid-cols-[220px_1fr] lg:grid-cols-[280px_1fr]">
        <div className="hidden border-r bg-card md:block no-print">
          <div className="flex h-full max-h-screen flex-col gap-2">
            <div className="flex h-14 items-center border-b px-4 lg:h-[60px] lg:px-6">
              <Link
                href="/dashboard"
                className="flex items-center gap-2 font-semibold"
              >
                <Logo />
              </Link>
            </div>
            <div className="flex-1 overflow-auto">
              <nav className="grid items-start px-2 text-sm font-medium lg:px-4">
                <MainNav />
              </nav>
            </div>
          </div>
        </div>
        <div className="flex flex-col">
          <header className="flex h-14 items-center gap-4 border-b bg-card px-4 lg:h-[60px] lg:px-6 no-print relative z-40">
            <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0 md:hidden"
                >
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Toggle navigation menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="flex flex-col z-50">
                <SheetHeader className="text-left">
                  <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
                </SheetHeader>
                <Link
                  href="/dashboard"
                  className="flex items-center gap-2 text-lg font-semibold mb-4"
                  onClick={() => setIsSheetOpen(false)}
                >
                  <Logo />
                </Link>
                <ScrollArea className="flex-grow">
                  <nav className="grid gap-2 text-lg font-medium pr-4">
                    <MainNav onLinkClick={() => setIsSheetOpen(false)} />
                  </nav>
                </ScrollArea>
              </SheetContent>
            </Sheet>
            <div className="w-full flex-1">
              {/* Can add a global search here if needed */}
            </div>
            <Button variant="ghost" size="icon" className="rounded-full">
              <Bell className="h-5 w-5" />
              <span className="sr-only">Toggle notifications</span>
            </Button>
            <UserNav />
          </header>
          <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6 bg-background relative z-0">
            {children}
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}

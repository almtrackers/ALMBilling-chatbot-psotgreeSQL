
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Smartphone,
  FileText,
  Banknote,
  BarChart2,
  Settings,
  Warehouse,
  ShoppingCart,
  CalendarClock,
  History,
  Users as UsersIcon, // Renamed to avoid conflict
  Truck,
  ShieldCheck,
  Terminal,
  MessageSquare,
  Building,
  User,
  Briefcase,
  AlertCircle,
  HeartPulse,
  Wallet,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/auth-context';
import useSWR from 'swr';
import type { ApprovalRequest } from '@/lib/types';
import { Badge } from '@/components/ui/badge';

const fetcher = (url: string) => fetch(url).then(res => res.json());

const allNavItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, adminOnly: false },
  { href: '/dashboard/user', label: 'Users', icon: User, adminOnly: true },
  { href: '/dashboard/chat', label: 'Live Chat', icon: MessageSquare, adminOnly: true },
  { href: '/dashboard/people', label: 'People', icon: Briefcase, adminOnly: true },
  { href: '/dashboard/devices', label: 'Devices', icon: Smartphone, adminOnly: false },
  { href: '/dashboard/invoices', label: 'Invoices', icon: FileText, adminOnly: false },
  { href: '/dashboard/wallets', label: 'Wallets', icon: Wallet, adminOnly: true },
  { href: '/dashboard/billing-health', label: 'Billing History', icon: HeartPulse, adminOnly: true },
  { href: '/dashboard/sales', label: 'Sales', icon: ShoppingCart, adminOnly: true },
  { href: '/dashboard/company-vehicles', label: 'Company Vehicles', icon: Building, adminOnly: true },
  { href: '/dashboard/expenses', label: 'Expenses', icon: Banknote, adminOnly: true },
  { href: '/dashboard/inventory', label: 'Inventory', icon: Warehouse, adminOnly: true },
  { href: '/dashboard/stock-distribution', label: 'Distribution', icon: Truck, adminOnly: true },
  { href: '/dashboard/dealers', label: 'Dealers', icon: UsersIcon, adminOnly: true },
  { href: '/dashboard/commands', label: 'Commands', icon: Terminal, adminOnly: true },
  { href: '/dashboard/monitor-devices', label: 'Monitor Devices', icon: AlertCircle, adminOnly: true },
  { href: '/dashboard/approvals', label: 'Approvals', icon: ShieldCheck, adminOnly: true, requiresBadge: true },
  { href: '/dashboard/scheduler', label: 'Scheduler', icon: CalendarClock, adminOnly: true },
  { href: '/dashboard/logs', label: 'Logs', icon: History, adminOnly: true },
  { href: '/dashboard/reports', label: 'Reports', icon: BarChart2, adminOnly: true },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings, adminOnly: true },
];

interface MainNavProps extends React.HTMLAttributes<HTMLElement> {
  onLinkClick?: () => void;
}

export function MainNav({
  className,
  onLinkClick,
  ...props
}: MainNavProps) {
  const pathname = usePathname();
  const { isAdmin } = useAuth();
  
  const { data: approvals } = useSWR<ApprovalRequest[]>('/api/approvals', fetcher);
  const pendingCount = approvals?.filter(app => app.status === 'pending').length || 0;

  const navItems = allNavItems.filter(item => !item.adminOnly || isAdmin);

  const handleLinkClick = () => {
    if (onLinkClick) {
      onLinkClick();
    }
  };

  return (
    <>
      <nav
        className={cn('flex flex-col items-start gap-2', className)}
        {...props}
      >
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={handleLinkClick}
            className={cn(
              'flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary w-full',
              {
                'bg-secondary text-primary font-semibold':
                  pathname.startsWith(item.href) &&
                  (item.href !== '/dashboard' || pathname === '/dashboard'),
              }
            )}
          >
            <div className="flex items-center gap-3">
              <item.icon className="h-4 w-4" />
              {item.label}
            </div>
            {item.requiresBadge && pendingCount > 0 && (
              <Badge className="h-5">{pendingCount}</Badge>
            )}
          </Link>
        ))}
      </nav>
    </>
  );
}

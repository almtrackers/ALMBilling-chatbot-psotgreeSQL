import Image from 'next/image';
import { cn } from '@/lib/utils';
import logo from '../../public/logo.png';

export default function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-center gap-2", className)}>
      <Image
        src={logo}
        alt="AL-MUHAFIZ TRACKERS (PVT) LTD Logo"
        width={32}
        height={32}
        className="h-8 w-8 object-contain"
      />
      <h1 className="text-lg font-bold text-foreground whitespace-nowrap">
        AL-MUHAFIZ TRACKERS (PVT) LTD
      </h1>
    </div>
  );
}

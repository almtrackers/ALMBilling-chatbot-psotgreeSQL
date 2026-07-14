
import { Suspense } from 'react';
import Logo from '@/components/logo';
import { Skeleton } from '@/components/ui/skeleton';
import VerificationResult from './_components/verification-result';

export default function VerifyPage() {
  return (
    <div className="flex min-h-screen flex-col items-center bg-muted/40 p-2 sm:p-4 md:p-8">
      <div className="w-full max-w-2xl space-y-4 sm:space-y-6 md:space-y-8 px-2 sm:px-4">
        <div className="flex justify-center py-2 sm:py-4">
          <Logo />
        </div>
        <Suspense fallback={<Skeleton className="h-96 w-full" />}>
            <VerificationResult />
        </Suspense>
      </div>
    </div>
  );
}

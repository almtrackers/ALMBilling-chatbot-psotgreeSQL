
import LoginForm from '@/components/auth/login-form';
import Logo from '@/components/logo';
import VerifyPaymentDialog from '@/components/verify-payment-dialog';

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <LoginForm />
        <div className="mt-6 text-center">
          <VerifyPaymentDialog />
        </div>
      </div>
    </div>
  );
}

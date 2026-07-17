import { NextRequest, NextResponse } from 'next/server';
import { checkSecurityPin } from '@/lib/security-pin';

export const dynamic = 'force-dynamic';

/**
 * Verify the admin security PIN.
 * { probe: true }  → only reports whether a PIN is configured.
 * { pin: '1234' }  → verifies the PIN.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const result = await checkSecurityPin(req, body.pin);

    if (body.probe === true) {
      return NextResponse.json({ success: true, configured: result.configured });
    }

    if (!result.valid) {
      return NextResponse.json(
        {
          success: false,
          configured: result.configured,
          message: result.configured
            ? 'Incorrect PIN.'
            : 'No security PIN is configured. Set one in Settings before performing critical actions.',
        },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true, configured: result.configured, valid: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'PIN verification failed';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

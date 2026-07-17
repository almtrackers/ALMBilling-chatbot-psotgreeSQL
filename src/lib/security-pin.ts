import type { NextRequest } from 'next/server';
import { compare } from 'bcryptjs';
import prisma from '@/lib/prisma/client';
import { getSessionUser } from '@/lib/server-auth';

/**
 * Central check for the security PIN used by critical actions.
 *
 * Two PINs are accepted:
 * - The logged-in admin's personal PIN (Settings → Security PIN card),
 *   stored bcrypt-hashed on their local user record.
 * - The optional global admin PIN (Settings form), also stored bcrypt-hashed.
 *
 * Critical actions are BLOCKED until at least one PIN is configured.
 */
export async function checkSecurityPin(
  req: NextRequest,
  pin: unknown
): Promise<{ configured: boolean; valid: boolean }> {
  const pinStr = String(pin ?? '').trim();

  // Personal PIN of the logged-in Traccar user.
  let personalHash: string | null = null;
  try {
    const sessionUser = await getSessionUser(req);
    if (sessionUser) {
      const localUser = await prisma.user.findFirst({
        where: { traccarId: sessionUser.id },
        select: { pin: true },
      });
      personalHash = localUser?.pin || null;
    }
  } catch {
    // Session lookup failure → fall back to the global PIN only.
  }

  const settings = await prisma.appSetting.findUnique({
    where: { id: 'main' },
    select: { securityPin: true },
  });
  const globalHash = settings?.securityPin || null;

  const configured = Boolean(personalHash || globalHash);
  if (!configured) return { configured: false, valid: false };
  if (!pinStr) return { configured: true, valid: false };

  if (personalHash && (await matchesPin(pinStr, personalHash))) {
    return { configured: true, valid: true };
  }
  if (globalHash && (await matchesPin(pinStr, globalHash))) {
    return { configured: true, valid: true };
  }
  return { configured: true, valid: false };
}

/** Compare against a bcrypt hash; tolerate legacy plaintext values. */
async function matchesPin(pin: string, stored: string): Promise<boolean> {
  if (stored.startsWith('$2')) {
    try {
      return await compare(pin, stored);
    } catch {
      return false;
    }
  }
  return stored === pin;
}

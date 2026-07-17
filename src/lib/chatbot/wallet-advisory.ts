import { format } from 'date-fns';
import prisma from '@/lib/prisma/client';
import { computeUpcomingCharges } from '@/lib/wallet-upcoming';

const CYBER_SECURITY_TIPS = [
  'Apna password kisi ke saath share na karein — company staff kabhi password nahi maangta.',
  'Anjaan links par click na karein, chahe woh bank ya tracking company ke naam se aayein.',
  'Apne WhatsApp par two-step verification zaroor on rakhein (Settings → Account → Two-step verification).',
  'OTP code kisi ko na batayein — koi bhi official idara phone par OTP nahi maangta.',
  'Public Wi-Fi par banking ya account login se parhez karein.',
  'Apne devices ka password mazboot rakhein: kam az kam 8 characters, numbers aur symbols ke saath.',
  'Agar koi call kar ke aap se account details maange to call band kar dein aur official number par khud call karein.',
  'Apps sirf Google Play ya App Store se install karein — unknown APK files se bachein.',
  'Apna CNIC number aur documents sirf verified idaron ke saath share karein.',
  'Phone gum ho jaye to foran apni SIM block karwayein aur passwords change karein.',
];

export function getRandomSecurityTip(): string {
  return CYBER_SECURITY_TIPS[Math.floor(Math.random() * CYBER_SECURITY_TIPS.length)];
}

export type WalletAdvisory = {
  message: string;
  lowBalance: boolean;
};

/**
 * Build the wallet advisory shared with customers over WhatsApp:
 * current balance, charges landing on the very next billing date,
 * a low-balance warning when needed, and a cybersecurity tip.
 * Returns null when the user has no wallet.
 */
export async function buildWalletAdvisory(localUserId: number): Promise<WalletAdvisory | null> {
  const user = await prisma.user.findUnique({
    where: { id: localUserId },
    include: { devices: true },
  });
  if (!user) return null;

  const balance = user.balance.toNumber();
  const upcoming = computeUpcomingCharges(
    user.devices.map((d) => ({
      status: d.status,
      planPrice: d.planPrice.toNumber(),
      nextBillingDate: d.nextBillingDate,
    }))
  );

  const lines: string[] = ['💰 *Wallet Update*'];
  lines.push(`Current Balance: PKR ${balance.toLocaleString()}`);

  if (upcoming.upcomingCharges > 0 && upcoming.nextBillingDate) {
    lines.push(
      `Next Billing (${format(upcoming.nextBillingDate, 'dd MMM yyyy')}): PKR ${upcoming.upcomingCharges.toLocaleString()}${upcoming.deviceCount > 1 ? ` (${upcoming.deviceCount} vehicles)` : ''}`
    );
  }

  const lowBalance = upcoming.upcomingCharges > 0 && balance < upcoming.upcomingCharges;
  if (lowBalance) {
    const shortfall = upcoming.upcomingCharges - balance;
    lines.push('');
    lines.push(
      `⚠️ *Balance Kam Hai!* Agli billing ke liye PKR ${shortfall.toLocaleString()} aur chahiye. Service suspension se bachne ke liye pehle se balance add karwa lein.`
    );
  } else if (upcoming.upcomingCharges > 0) {
    lines.push('');
    lines.push('✅ Aapka balance agli billing ke liye kaafi hai. Shukriya!');
  }

  lines.push('');
  lines.push(`🔐 *Security Tip:* ${getRandomSecurityTip()}`);

  return { message: lines.join('\n'), lowBalance };
}

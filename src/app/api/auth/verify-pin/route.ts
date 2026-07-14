
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';
import { compare } from 'bcryptjs';

export async function POST(req: NextRequest) {
  try {
    const { traccarId, pin } = await req.json();

    if (!traccarId || !pin) {
      return NextResponse.json({ error: 'Traccar ID and PIN are required' }, { status: 400 });
    }

    // Bypass all caching - use raw SQL to get absolute latest data
    const users = await prisma.$queryRaw`
      SELECT id, pin, traccarId 
      FROM users 
      WHERE traccarId = ${parseInt(traccarId)}
      ORDER BY id DESC 
      LIMIT 1
    `;
    
    const user = Array.isArray(users) ? users[0] : null;

    if (!user) {
      console.log('PIN verification failed - user not found for traccarId:', traccarId);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    console.log('PIN verification - user found:', user.id, 'stored PIN type:', user.pin ? (user.pin.startsWith('$2') ? 'hashed' : 'plain') : 'none');

    // Handle both plain text (legacy) and hashed (new) PINs during transition
    if (user.pin) {
      // Check if PIN is hashed (bcrypt hashes start with $2a$, $2b$, or $2y$)
      if (user.pin.startsWith('$2')) {
        // Compare using bcrypt for hashed PINs
        const isMatch = await compare(pin, user.pin);
        console.log('Hashed PIN comparison result:', isMatch);
        if (isMatch) {
          return NextResponse.json({ success: true });
        }
      } else {
        // Compare plain text for legacy PINs
        console.log('Plain text PIN comparison:', user.pin === pin);
        if (user.pin === pin) {
          return NextResponse.json({ success: true });
        }
      }
    }
    
    console.log('PIN verification failed - no match');
    return NextResponse.json({ success: false, message: 'Invalid PIN' });
  } catch (error: any) {
    console.error('Error verifying PIN:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

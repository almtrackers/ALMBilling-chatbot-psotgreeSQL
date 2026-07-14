import { NextRequest, NextResponse } from 'next/server';
import { migrateFromFirestoreToMySQL } from '@/lib/migration-service';

export async function POST(req: NextRequest) {
  try {
    const result = await migrateFromFirestoreToMySQL();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Migration API Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

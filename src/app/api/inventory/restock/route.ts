import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';

export async function POST(req: NextRequest) {
  try {
    const { type, itemId, imei, sim } = await req.json();

    if (!type || !itemId || (type === 'tracker' && !imei) || (type === 'sim' && !sim)) {
      return NextResponse.json({ success: false, message: 'Invalid restock data' }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const existingItem = await tx.inventoryItem.findUnique({
        where: { id: itemId },
      });

      if (!existingItem) {
        throw new Error('Inventory item not found');
      }

      let updatedData: any = {
        quantity: existingItem.quantity + 1,
        lastUpdated: new Date(),
      };

      if (type === 'tracker') {
        const currentImeis = existingItem.imeis ? JSON.parse(existingItem.imeis as string) : [];
        if (!currentImeis.includes(imei)) {
          updatedData.imeis = JSON.stringify([...currentImeis, imei]);
        } else {
          // If already in stock, just return current state (or throw error if preferred)
          return { success: true, message: 'IMEI already in stock', item: existingItem };
        }
      } else if (type === 'sim') {
        const currentSims = existingItem.sims ? JSON.parse(existingItem.sims as string) : [];
        const simExists = currentSims.some((s: any) => s.imsi === sim.imsi || s.simNumber === sim.simNumber);
        if (!simExists) {
          updatedData.sims = JSON.stringify([...currentSims, sim]);
        } else {
          return { success: true, message: 'SIM already in stock', item: existingItem };
        }
      }

      const updatedItem = await tx.inventoryItem.update({
        where: { id: itemId },
        data: updatedData,
      });

      return { success: true, item: updatedItem };
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Inventory Restock Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

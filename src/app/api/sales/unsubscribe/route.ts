import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';

export async function POST(req: NextRequest) {
  try {
    const { saleId, unsubscribeReason, returnedItems } = await req.json();

    if (!saleId || !unsubscribeReason) {
      return NextResponse.json({ success: false, message: 'Missing required fields' }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Update sale status
      const sale = await tx.sale.update({
        where: { id: saleId },
        data: {
          status: 'unsubscribed',
          unsubscribedAt: new Date(),
          unsubscribeReason,
        },
      });

      // 2. Restock returned items (if working)
      let restockLog = 'Restocked: ';
      let itemsRestockedCount = 0;

      for (const item of returnedItems) {
        if (item.condition === 'working') {
          const itemId = item.id;
          if (itemId) {
            const inventoryItem = await tx.inventoryItem.findUnique({ where: { id: itemId } });
            if (inventoryItem) {
              let updatedData: any = {
                quantity: { increment: 1 },
                lastUpdated: new Date(),
              };

              // Handle IMEIs and SIMs
              if (item.type === 'tracker' && item.imei) {
                const currentImeis = inventoryItem.imeis ? JSON.parse(inventoryItem.imeis as string) : [];
                if (!currentImeis.includes(item.imei)) {
                  updatedData.imeis = JSON.stringify([...currentImeis, item.imei]);
                }
              } else if (item.type === 'sim' && item.simNumber && item.imsi) {
                const currentSims = inventoryItem.sims ? JSON.parse(inventoryItem.sims as string) : [];
                const newSim = { simNumber: item.simNumber, imsi: item.imsi };
                if (!currentSims.some((s: any) => s.simNumber === item.simNumber)) {
                  updatedData.sims = JSON.stringify([...currentSims, newSim]);
                }
              }

              await tx.inventoryItem.update({
                where: { id: itemId },
                data: updatedData,
              });
              restockLog += `${item.type}, `;
              itemsRestockedCount++;
            }
          }
        }
      }

      return { sale, restockLog: itemsRestockedCount > 0 ? restockLog.slice(0, -2) : null };
    });

    return NextResponse.json({
      success: true,
      sale: result.sale,
      restockLog: result.restockLog,
    });
  } catch (error: any) {
    console.error('Unsubscribe Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

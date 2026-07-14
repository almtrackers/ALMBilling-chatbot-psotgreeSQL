import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';

export async function POST(req: NextRequest) {
  try {
    const { items, itemType } = await req.json();

    if (!items || !Array.isArray(items) || !itemType) {
      return NextResponse.json({ success: false, message: 'Invalid data' }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      let itemsAddedCount = 0;
      const logDetails: Record<string, number> = {};

      for (const itemData of items) {
        const { name, cost, supplier, quantity, imeis, sims } = itemData;

        // Find existing item with same name, type, cost, and supplier
        const existingItem = await tx.inventoryItem.findFirst({
          where: {
            name,
            type: itemType,
            cost: cost || null,
            supplier: supplier || null,
          },
        });

        if (existingItem) {
          let updatedImeis = null;
          let updatedSims = null;
          let newQuantity = existingItem.quantity;

          if (itemType === 'tracker' && imeis) {
            const currentImeis = existingItem.imeis ? JSON.parse(existingItem.imeis as string) : [];
            const newImeis = imeis.filter((imei: string) => !currentImeis.includes(imei));
            if (newImeis.length > 0) {
              updatedImeis = JSON.stringify([...currentImeis, ...newImeis]);
              newQuantity = currentImeis.length + newImeis.length;
              itemsAddedCount += newImeis.length;
              logDetails[name] = (logDetails[name] || 0) + newImeis.length;
            }
          } else if (itemType === 'sim' && sims) {
            const currentSims = existingItem.sims ? JSON.parse(existingItem.sims as string) : [];
            const currentSimNumbers = currentSims.map((s: any) => s.simNumber);
            const newSims = sims.filter((sim: any) => !currentSimNumbers.includes(sim.simNumber));
            if (newSims.length > 0) {
              updatedSims = JSON.stringify([...currentSims, ...newSims]);
              newQuantity = currentSims.length + newSims.length;
              itemsAddedCount += newSims.length;
              logDetails[name] = (logDetails[name] || 0) + newSims.length;
            }
          } else {
            newQuantity += (quantity || 0);
            itemsAddedCount += (quantity || 0);
            logDetails[name] = (logDetails[name] || 0) + (quantity || 0);
          }

          if (itemsAddedCount > 0) {
            await tx.inventoryItem.update({
              where: { id: existingItem.id },
              data: {
                quantity: newQuantity,
                imeis: updatedImeis || undefined,
                sims: updatedSims || undefined,
                lastUpdated: new Date(),
              },
            });
          }
        } else {
          // Create new item
          const initialQuantity = quantity || (imeis?.length || sims?.length || 0);
          await tx.inventoryItem.create({
            data: {
              name,
              type: itemType,
              cost: cost || null,
              supplier: supplier || null,
              quantity: initialQuantity,
              imeis: imeis ? JSON.stringify(imeis) : null,
              sims: sims ? JSON.stringify(sims) : null,
              lastUpdated: new Date(),
            },
          });
          itemsAddedCount += initialQuantity;
          logDetails[name] = (logDetails[name] || 0) + initialQuantity;
        }
      }

      return { itemsAddedCount, logDetails };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('Inventory Bulk POST Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

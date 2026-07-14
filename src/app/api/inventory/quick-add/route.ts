import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const { 
      trackerId, 
      simId, 
      simIdentifier, 
      newModelName, 
      unitCost, 
      supplier, 
      harnessId, 
      relayId, 
      micId, 
      sosButtonId,
      imei,
      adminName
    } = data;

    if (!adminName) {
        return NextResponse.json({ success: false, message: 'Admin name is required' }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      let finalTrackerId = trackerId;
      let trackerName = '';

      // 1. Handle Tracker
      if (trackerId === 'new_tracker') {
        trackerName = newModelName;
        const newTracker = await tx.inventoryItem.create({
          data: {
            name: trackerName,
            type: 'tracker',
            quantity: 1,
            cost: unitCost || null,
            supplier: supplier || null,
            imeis: JSON.stringify([imei]),
            lastUpdated: new Date(),
          },
        });
        finalTrackerId = newTracker.id;

        // 2. Create Expense if new model and cost provided
        if (unitCost && unitCost > 0) {
          await tx.expense.create({
            data: {
              title: `Stock Purchase: 1 x ${trackerName}`,
              amount: unitCost,
              type: 'stock_purchase',
              date: new Date(),
              monthId: new Date().toISOString().slice(0, 7),
              notes: `Purchased from ${supplier || 'Unknown Supplier'}`,
              createdBy: adminName,
              status: 'pending',
            },
          });
        }
      } else {
        const trackerItem = await tx.inventoryItem.findUnique({ where: { id: trackerId } });
        if (!trackerItem) throw new Error('Tracker item not found');
        trackerName = trackerItem.name;
        
        const currentImeis = trackerItem.imeis ? JSON.parse(trackerItem.imeis as string) : [];
        if (!currentImeis.includes(imei)) {
          currentImeis.push(imei);
        }

        await tx.inventoryItem.update({
          where: { id: trackerId },
          data: {
            imeis: JSON.stringify(currentImeis),
            quantity: { increment: 1 },
            lastUpdated: new Date(),
          },
        });
      }

      // 3. Update SIM
      if (simId && simIdentifier) {
        const simItem = await tx.inventoryItem.findUnique({ where: { id: simId } });
        if (!simItem) throw new Error('SIM item not found');

        const currentSims = simItem.sims ? JSON.parse(simItem.sims as string) : [];
        const simExists = currentSims.some((s: any) => s.imsi === simIdentifier || s.simNumber === simIdentifier);
        
        if (!simExists) {
          // If it's a 4-digit identifier, assume it's IMSI, otherwise maybe simNumber?
          // For simplicity, let's store it as both if we don't know
          currentSims.push({
            simNumber: simIdentifier.length > 4 ? simIdentifier : '',
            imsi: simIdentifier.length <= 4 ? simIdentifier : simIdentifier.slice(-4)
          });

          await tx.inventoryItem.update({
            where: { id: simId },
            data: {
              sims: JSON.stringify(currentSims),
              quantity: { increment: 1 },
              lastUpdated: new Date(),
            },
          });
        }
      }

      // 4. Update Harness
      if (harnessId) {
        await tx.inventoryItem.update({
          where: { id: harnessId },
          data: {
            quantity: { increment: 1 },
            lastUpdated: new Date(),
          },
        });
      }

      // 5. Update Accessories
      const accessoryIds = [relayId, micId, sosButtonId].filter(Boolean);
      for (const accId of accessoryIds as string[]) {
        await tx.inventoryItem.update({
          where: { id: accId },
          data: {
            quantity: { increment: 1 },
            lastUpdated: new Date(),
          },
        });
      }

      return { trackerName, trackerId: finalTrackerId };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('Quick Add Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

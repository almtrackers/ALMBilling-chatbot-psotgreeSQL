import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';

export async function POST(req: NextRequest) {
  try {
    const { 
        recordId, 
        isCompanyVehicle, 
        replacementType, 
        reason, 
        newTrackerId, 
        newImei, 
        oldTrackerCondition,
        newSimId,
        newSimNumber,
        newImsi,
        oldSimCondition,
        oldImei,
        oldSimNumber,
        oldImsi,
        oldTrackerId,
        oldSimId
    } = await req.json();

    if (!recordId || !replacementType) {
      return NextResponse.json({ success: false, message: 'Missing required fields' }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
        let updateData: any = {};
        let restockLog = 'Restocked: ';
        let itemsRestockedCount = 0;

        if (replacementType === 'tracker') {
            updateData = {
                imei: newImei,
                trackerId: newTrackerId,
            };

            // 1. Consume new tracker from inventory
            const inventoryItem = await tx.inventoryItem.findUnique({ where: { id: newTrackerId } });
            if (inventoryItem) {
                const currentImeis = inventoryItem.imeis ? JSON.parse(inventoryItem.imeis as string) : [];
                const updatedImeis = currentImeis.filter((i: string) => i !== newImei);
                await tx.inventoryItem.update({
                    where: { id: newTrackerId },
                    data: {
                        quantity: { decrement: 1 },
                        imeis: JSON.stringify(updatedImeis),
                        lastUpdated: new Date(),
                    }
                });
            }

            // 2. Restock old tracker if working
            if (oldTrackerCondition === 'working' && oldTrackerId && oldImei) {
                const oldInventoryItem = await tx.inventoryItem.findUnique({ where: { id: oldTrackerId } });
                if (oldInventoryItem) {
                    const currentImeis = oldInventoryItem.imeis ? JSON.parse(oldInventoryItem.imeis as string) : [];
                    if (!currentImeis.includes(oldImei)) {
                        await tx.inventoryItem.update({
                            where: { id: oldTrackerId },
                            data: {
                                quantity: { increment: 1 },
                                imeis: JSON.stringify([...currentImeis, oldImei]),
                                lastUpdated: new Date(),
                            }
                        });
                        restockLog += `Old Tracker (${oldImei}), `;
                        itemsRestockedCount++;
                    }
                }
            }

        } else if (replacementType === 'sim') {
            updateData = {
                simId: newSimId,
                simNumber: newSimNumber,
                imsi: newImsi,
            };

            // 1. Consume new SIM from inventory
            const inventoryItem = await tx.inventoryItem.findUnique({ where: { id: newSimId } });
            if (inventoryItem) {
                const currentSims = inventoryItem.sims ? JSON.parse(inventoryItem.sims as string) : [];
                const updatedSims = currentSims.filter((s: any) => s.imsi !== newImsi);
                await tx.inventoryItem.update({
                    where: { id: newSimId },
                    data: {
                        quantity: { decrement: 1 },
                        sims: JSON.stringify(updatedSims),
                        lastUpdated: new Date(),
                    }
                });
            }

            // 2. Restock old SIM if working
            if (oldSimCondition === 'working' && oldSimId && oldImsi && oldSimNumber) {
                const oldInventoryItem = await tx.inventoryItem.findUnique({ where: { id: oldSimId } });
                if (oldInventoryItem) {
                    const currentSims = oldInventoryItem.sims ? JSON.parse(oldInventoryItem.sims as string) : [];
                    const oldSim = { simNumber: oldSimNumber, imsi: oldImsi };
                    if (!currentSims.some((s: any) => s.imsi === oldImsi)) {
                        await tx.inventoryItem.update({
                            where: { id: oldSimId },
                            data: {
                                quantity: { increment: 1 },
                                sims: JSON.stringify([...currentSims, oldSim]),
                                lastUpdated: new Date(),
                            }
                        });
                        restockLog += `Old SIM (${oldSimNumber}), `;
                        itemsRestockedCount++;
                    }
                }
            }
        }

        // Update the record (Sale or CompanyVehicle)
        if (isCompanyVehicle) {
            await tx.companyVehicle.update({
                where: { id: recordId },
                data: updateData,
            });
        } else {
            await tx.sale.update({
                where: { id: recordId },
                data: updateData,
            });
        }

        return { restockLog: itemsRestockedCount > 0 ? restockLog.slice(0, -2) : null };
    });

    return NextResponse.json({
      success: true,
      restockLog: result.restockLog,
    });
  } catch (error: any) {
    console.error('Replace Hardware Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

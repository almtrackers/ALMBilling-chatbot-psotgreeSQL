import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';

export async function GET(req: NextRequest) {
  try {
    const allocations = await prisma.stockAllocation.findMany({
      orderBy: { allocatedAt: 'desc' },
    });
    
    // Parse JSON strings back to arrays/objects
    const parsedAllocations = allocations.map(allocation => ({
      ...allocation,
      allocatedImeis: allocation.allocatedImeis ? JSON.parse(allocation.allocatedImeis as string) : [],
      allocatedSims: allocation.allocatedSims ? JSON.parse(allocation.allocatedSims as string) : [],
    }));

    return NextResponse.json(parsedAllocations);
  } catch (error: any) {
    console.error('StockAllocations GET Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const allocations = Array.isArray(data) ? data : [data];

    const result = await prisma.$transaction(async (tx) => {
      const createdAllocations = [];

      for (const item of allocations) {
        const { inventoryItemId, dealerId, quantity, allocatedImeis, allocatedSims, allocatedBy } = item;

        // 1. Find the inventory item
        const inventoryItem = await tx.inventoryItem.findUnique({
          where: { id: inventoryItemId }
        });

        if (!inventoryItem) {
          throw new Error(`Inventory item ${inventoryItemId} not found`);
        }

        if (inventoryItem.quantity < quantity) {
          throw new Error(`Insufficient stock for ${inventoryItem.name}`);
        }

        // 2. Create the allocation record
        const allocation = await tx.stockAllocation.create({
          data: {
            inventoryItemId,
            dealerId,
            quantity,
            allocatedImeis: allocatedImeis ? JSON.stringify(allocatedImeis) : null,
            allocatedSims: allocatedSims ? JSON.stringify(allocatedSims) : null,
            allocatedBy,
          },
        });

        // 3. Update inventory item
        const updateData: any = {
          quantity: { decrement: quantity },
          lastUpdated: new Date(),
        };

        // Handle specific item types
        if (inventoryItem.type === 'tracker' && allocatedImeis) {
          const currentImeis = inventoryItem.imeis ? JSON.parse(inventoryItem.imeis as string) : [];
          const updatedImeis = currentImeis.filter((imei: string) => !allocatedImeis.includes(imei));
          updateData.imeis = JSON.stringify(updatedImeis);
        } else if (inventoryItem.type === 'sim' && allocatedSims) {
          const currentSims = inventoryItem.sims ? JSON.parse(inventoryItem.sims as string) : [];
          const allocatedSimNumbers = allocatedSims.map((s: any) => s.simNumber);
          const updatedSims = currentSims.map((s: any) => 
            allocatedSimNumbers.includes(s.simNumber) ? { ...s, status: 'allocated', dealerId } : s
          );
          updateData.sims = JSON.stringify(updatedSims);
        }

        await tx.inventoryItem.update({
          where: { id: inventoryItemId },
          data: updateData,
        });

        createdAllocations.push(allocation);
      }

      return createdAllocations;
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('StockAllocations POST Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, message: 'ID required' }, { status: 400 });

    const result = await prisma.$transaction(async (tx) => {
      // 1. Find the allocation record
      const allocation = await tx.stockAllocation.findUnique({
        where: { id }
      });

      if (!allocation) {
        throw new Error('Allocation record not found');
      }

      // 2. Find the inventory item
      const inventoryItem = await tx.inventoryItem.findUnique({
        where: { id: allocation.inventoryItemId }
      });

      if (inventoryItem) {
        // 3. Update inventory item (restore stock)
        const updateData: any = {
          quantity: { increment: allocation.quantity },
          lastUpdated: new Date(),
        };

        // Handle specific item types
        if (inventoryItem.type === 'tracker' && allocation.allocatedImeis) {
          const currentImeis = inventoryItem.imeis ? JSON.parse(inventoryItem.imeis as string) : [];
          const allocatedImeis = JSON.parse(allocation.allocatedImeis as string);
          // Combine and remove duplicates
          const updatedImeis = Array.from(new Set([...currentImeis, ...allocatedImeis]));
          updateData.imeis = JSON.stringify(updatedImeis);
        } else if (inventoryItem.type === 'sim' && allocation.allocatedSims) {
          const currentSims = inventoryItem.sims ? JSON.parse(inventoryItem.sims as string) : [];
          const allocatedSims = JSON.parse(allocation.allocatedSims as string);
          const allocatedSimNumbers = allocatedSims.map((s: any) => s.simNumber);
          
          const updatedSims = currentSims.map((s: any) => 
            allocatedSimNumbers.includes(s.simNumber) ? { ...s, status: 'available', dealerId: null } : s
          );
          updateData.sims = JSON.stringify(updatedSims);
        }

        await tx.inventoryItem.update({
          where: { id: allocation.inventoryItemId },
          data: updateData,
        });
      }

      // 4. Delete the allocation record
      await tx.stockAllocation.delete({
        where: { id },
      });

      return { success: true };
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('StockAllocations DELETE Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

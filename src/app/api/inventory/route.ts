import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';

export async function GET(req: NextRequest) {
  try {
    const inventoryItems = await prisma.inventoryItem.findMany({
      orderBy: { lastUpdated: 'desc' },
    });
    
    // Parse JSON strings back to arrays/objects for the frontend if they exist
    const parsedItems = inventoryItems.map(item => ({
      ...item,
      imeis: item.imeis ? JSON.parse(item.imeis) : [],
      sims: item.sims ? JSON.parse(item.sims) : [],
      cost: item.cost ? Number(item.cost) : undefined,
    }));

    return NextResponse.json(parsedItems);
  } catch (error: any) {
    console.error('Inventory GET Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    // Only persist real InventoryItem columns — the form sends extra UI-only
    // fields (includeHarness, createdBy, ...) that Prisma would reject.
    const { imeis, sims, cost, name, type, quantity, supplier } = data;

    if (!name || !type) {
      return NextResponse.json(
        { success: false, message: 'name and type are required' },
        { status: 400 }
      );
    }

    const inventoryItem = await prisma.inventoryItem.create({
      data: {
        name,
        type,
        quantity: Number(quantity) || 0,
        supplier: supplier || null,
        imeis: imeis ? JSON.stringify(imeis) : null,
        sims: sims ? JSON.stringify(sims) : null,
        cost: cost ? cost : null,
      },
    });
    return NextResponse.json(inventoryItem);
  } catch (error: any) {
    console.error('Inventory POST Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const data = await req.json();
    const { id, imeis, sims, cost, ...updateData } = data;
    
    if (!id) return NextResponse.json({ success: false, message: 'ID required' }, { status: 400 });

    const inventoryItem = await prisma.inventoryItem.update({
      where: { id },
      data: {
        ...updateData,
        imeis: imeis !== undefined ? (imeis ? JSON.stringify(imeis) : null) : undefined,
        sims: sims !== undefined ? (sims ? JSON.stringify(sims) : null) : undefined,
        cost: cost !== undefined ? (cost ? cost : null) : undefined,
        lastUpdated: new Date(),
      },
    });
    return NextResponse.json(inventoryItem);
  } catch (error: any) {
    console.error('Inventory PUT Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, message: 'ID required' }, { status: 400 });

    await prisma.inventoryItem.delete({
      where: { id },
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Inventory DELETE Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

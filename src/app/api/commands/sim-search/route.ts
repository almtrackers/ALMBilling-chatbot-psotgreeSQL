import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';
import { toSmsE164 } from '@/lib/utils';

type SimSearchResult = {
  id: string;
  simNumber: string;
  imsi: string | null;
  vehicleNumber: string | null;
  source: 'installed' | 'company' | 'inventory';
  status: string | null;
};

function matches(value: unknown, query: string) {
  return typeof value === 'string' && value.toLowerCase().includes(query);
}

export async function GET(req: NextRequest) {
  try {
    const query = (req.nextUrl.searchParams.get('query') || '').trim().toLowerCase();

    const [sales, companyVehicles, inventoryItems] = await Promise.all([
      prisma.sale.findMany({
        where: {
          simNumber: { not: null },
          ...(query
            ? {
                OR: [
                  { simNumber: { contains: query, mode: 'insensitive' as const } },
                  { imsi: { contains: query, mode: 'insensitive' as const } },
                  { vehicleNumber: { contains: query, mode: 'insensitive' as const } },
                  { phoneRobocall: { contains: query, mode: 'insensitive' as const } },
                  { contactNumber: { contains: query, mode: 'insensitive' as const } },
                ],
              }
            : {}),
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          simNumber: true,
          imsi: true,
          vehicleNumber: true,
          status: true,
        },
      }),
      prisma.companyVehicle.findMany({
        where: {
          simNumber: { not: null },
          ...(query
            ? {
                OR: [
                  { simNumber: { contains: query, mode: 'insensitive' as const } },
                  { imsi: { contains: query, mode: 'insensitive' as const } },
                  { vehicleNumber: { contains: query, mode: 'insensitive' as const } },
                  { phoneRobocall: { contains: query, mode: 'insensitive' as const } },
                  { contactNumber: { contains: query, mode: 'insensitive' as const } },
                ],
              }
            : {}),
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          simNumber: true,
          imsi: true,
          vehicleNumber: true,
        },
      }),
      prisma.inventoryItem.findMany({
        where: { type: 'sim' },
        select: { id: true, sims: true },
      }),
    ]);

    const results: SimSearchResult[] = [];
    const seen = new Set<string>();

    const add = (result: SimSearchResult) => {
      const phone = toSmsE164(result.simNumber);
      if (!phone || seen.has(phone)) return;
      seen.add(phone);
      results.push(result);
    };

    for (const sale of sales) {
      if (!sale.simNumber) continue;
      add({
        id: `sale:${sale.id}`,
        simNumber: sale.simNumber,
        imsi: sale.imsi,
        vehicleNumber: sale.vehicleNumber,
        source: 'installed',
        status: sale.status,
      });
    }

    for (const vehicle of companyVehicles) {
      if (!vehicle.simNumber) continue;
      add({
        id: `company:${vehicle.id}`,
        simNumber: vehicle.simNumber,
        imsi: vehicle.imsi,
        vehicleNumber: vehicle.vehicleNumber,
        source: 'company',
        status: 'installed',
      });
    }

    for (const item of inventoryItems) {
      if (!item.sims) continue;
      let sims: unknown = [];
      try {
        sims = JSON.parse(item.sims);
      } catch {
        continue;
      }
      if (!Array.isArray(sims)) continue;

      for (let index = 0; index < sims.length; index += 1) {
        const sim = sims[index] as Record<string, unknown>;
        const simNumber = typeof sim.simNumber === 'string' ? sim.simNumber : '';
        const imsi = typeof sim.imsi === 'string' ? sim.imsi : null;
        const status = typeof sim.status === 'string' ? sim.status : 'available';
        if (!simNumber) continue;
        if (query && !matches(simNumber, query) && !matches(imsi, query)) continue;

        add({
          id: `inventory:${item.id}:${index}`,
          simNumber,
          imsi,
          vehicleNumber: null,
          source: 'inventory',
          status,
        });
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to search SIM records';
    console.error('GET /api/commands/sim-search failed:', error);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

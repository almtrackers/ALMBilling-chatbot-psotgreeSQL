import prisma from '@/lib/prisma/client';

/**
 * Generates the next sequential ID for a new sale.
 * @returns A promise that resolves to the next numeric sale ID as a string.
 */
export async function getNextSaleId(): Promise<string> {
  try {
    const lastSale = await prisma.sale.findFirst({
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!lastSale || !lastSale.id) {
      return '2001';
    }

    const lastId = lastSale.id;
    const lastNumber = parseInt(lastId, 10);
    
    if (isNaN(lastNumber)) {
      // Fallback if the last record doesn't have a numeric ID
      return '2001';
    }
    
    return (lastNumber + 1).toString();
  } catch (error) {
    console.error('Error generating next sale ID from Prisma:', error);
    return '2001';
  }
}

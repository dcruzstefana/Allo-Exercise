import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { runLazyCleanup } from '@/lib/cleanup';

export async function GET() {
  try {
    // 1. Run lazy cleanup of expired reservations before listing products
    await runLazyCleanup();

    // 2. Fetch all products along with their stock levels and associated warehouses
    const products = await db.product.findMany({
      include: {
        stockLevels: {
          include: {
            warehouse: {
              select: {
                id: true,
                name: true,
                location: true,
              },
            },
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    return NextResponse.json(products);
  } catch (error) {
    console.error('[API Products GET Error]:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

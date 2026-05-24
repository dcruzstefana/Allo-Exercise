import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET() {
  try {
    const warehouses = await db.warehouse.findMany({
      orderBy: {
        name: 'asc',
      },
    });

    return NextResponse.json(warehouses);
  } catch (error) {
    console.error('[API Warehouses GET Error]:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

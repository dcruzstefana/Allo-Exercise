import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { runLazyCleanup } from '@/lib/cleanup';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  const { id } = params;

  try {
    // 1. Run lazy cleanup before retrieving reservation status
    await runLazyCleanup();

    // 2. Fetch the reservation along with its product and warehouse details
    const reservation = await db.reservation.findUnique({
      where: { id },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            description: true,
          },
        },
        warehouse: {
          select: {
            id: true,
            name: true,
            location: true,
          },
        },
      },
    });

    if (!reservation) {
      return NextResponse.json(
        { error: 'Reservation not found.' },
        { status: 404 }
      );
    }

    const timeLeft = Math.max(0, Math.floor((reservation.expiresAt.getTime() - Date.now()) / 1000));
    return NextResponse.json({
      ...reservation,
      timeLeft,
    });
  } catch (error) {
    console.error('[API Reservation GET Error]:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

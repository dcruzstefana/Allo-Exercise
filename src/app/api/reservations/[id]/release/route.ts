import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  const { id } = params;

  try {
    const result = await db.$transaction(async (tx) => {
      // Find the reservation
      const reservation = await tx.reservation.findUnique({
        where: { id },
        include: {
          product: { select: { name: true, sku: true } },
          warehouse: { select: { name: true } },
        },
      });

      if (!reservation) {
        return {
          status: 404,
          payload: { error: 'Reservation not found.' },
        };
      }

      // If already released, return success
      if (reservation.status === 'RELEASED') {
        return {
          status: 200,
          payload: { message: 'Reservation is already released.', reservation },
        };
      }

      // If already confirmed, cannot release
      if (reservation.status === 'CONFIRMED') {
        return {
          status: 400,
          payload: { error: 'Cannot release a confirmed reservation.' },
        };
      }

      // The reservation is PENDING. Release it.
      // A. Update status to RELEASED
      const releasedReservation = await tx.reservation.update({
        where: { id },
        data: { status: 'RELEASED' },
        include: {
          product: { select: { name: true, sku: true } },
          warehouse: { select: { name: true } },
        },
      });

      // B. Decrement reservedUnits in Stock
      const stock = await tx.stock.findUnique({
        where: {
          productId_warehouseId: {
            productId: reservation.productId,
            warehouseId: reservation.warehouseId,
          },
        },
      });

      if (stock) {
        const newReserved = Math.max(0, stock.reservedUnits - reservation.quantity);
        await tx.stock.update({
          where: { id: stock.id },
          data: {
            reservedUnits: newReserved,
          },
        });
      }

      console.log(`[API Release]: Reservation ${id} has been released early. Stock returned to pool.`);
      return {
        status: 200,
        payload: { message: 'Reservation released successfully.', reservation: releasedReservation },
      };
    });

    return NextResponse.json(result.payload, { status: result.status });
  } catch (error) {
    console.error('[API Reservations Release POST Error]:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

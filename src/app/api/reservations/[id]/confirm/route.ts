import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { checkIdempotency, saveIdempotency } from '@/lib/idempotency';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  const { id } = params;
  const idempotencyKey = request.headers.get('Idempotency-Key');

  try {
    // 1. Check idempotency
    const cachedResponse = await checkIdempotency(idempotencyKey);
    if (cachedResponse) {
      return NextResponse.json(cachedResponse.body, { status: cachedResponse.status });
    }

    // 2. Perform confirmation in a database transaction
    const now = new Date();
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

      // If reservation is already confirmed, return success
      if (reservation.status === 'CONFIRMED') {
        return {
          status: 200,
          payload: { message: 'Reservation already confirmed.', reservation },
        };
      }

      // Check if expired
      const isExpired = reservation.status === 'RELEASED' || (reservation.status === 'PENDING' && reservation.expiresAt < now);

      if (isExpired) {
        // If it was PENDING but actually expired, we do a lazy release right here to be absolutely safe
        if (reservation.status === 'PENDING') {
          console.log(`[API Confirm]: Reservation ${id} expired. Lazy releasing stock.`);
          // A. Decrement reservedUnits in Stock
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
              data: { reservedUnits: newReserved },
            });
          }

          // B. Update status to RELEASED
          const updatedReservation = await tx.reservation.update({
            where: { id },
            data: { status: 'RELEASED' },
          });

          return {
            status: 410,
            payload: { error: 'Reservation has expired and was released.', reservation: updatedReservation },
          };
        }

        return {
          status: 410,
          payload: { error: 'Reservation has expired and was released.', reservation },
        };
      }

      // The reservation is PENDING and valid. Proceed to confirm!
      // A. Mark reservation as CONFIRMED
      const confirmedReservation = await tx.reservation.update({
        where: { id },
        data: { status: 'CONFIRMED' },
        include: {
          product: { select: { name: true, sku: true } },
          warehouse: { select: { name: true } },
        },
      });

      // B. Permanently decrement stock (both totalUnits and reservedUnits)
      const stock = await tx.stock.findUnique({
        where: {
          productId_warehouseId: {
            productId: reservation.productId,
            warehouseId: reservation.warehouseId,
          },
        },
      });

      if (stock) {
        const newTotal = Math.max(0, stock.totalUnits - reservation.quantity);
        const newReserved = Math.max(0, stock.reservedUnits - reservation.quantity);

        await tx.stock.update({
          where: { id: stock.id },
          data: {
            totalUnits: newTotal,
            reservedUnits: newReserved,
          },
        });
      }

      console.log(`[API Confirm]: Reservation ${id} confirmed successfully. Inventory permanently decremented.`);
      return {
        status: 200,
        payload: { message: 'Reservation confirmed and stock decremented.', reservation: confirmedReservation },
      };
    });

    // 3. Save and return response
    await saveIdempotency(idempotencyKey, result.status, result.payload);
    return NextResponse.json(result.payload, { status: result.status });
  } catch (error) {
    console.error('[API Reservations Confirm POST Error]:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

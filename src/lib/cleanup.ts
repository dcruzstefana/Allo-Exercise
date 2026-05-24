import db from './db';

/**
 * Lazily scans for expired PENDING reservations and releases them back into available stock.
 * Runs in a secure database transaction to prevent race conditions during cleanup.
 */
export async function runLazyCleanup(): Promise<number> {
  const now = new Date();

  try {
    return await db.$transaction(async (tx) => {
      // Find all pending reservations that have passed their expiration time
      const expiredReservations = await tx.reservation.findMany({
        where: {
          status: 'PENDING',
          expiresAt: {
            lt: now,
          },
        },
      });

      if (expiredReservations.length === 0) {
        return 0;
      }

      console.log(`[Lazy Cleanup] Found ${expiredReservations.length} expired reservations to release.`);

      for (const reservation of expiredReservations) {
        // 1. Decrement reservedUnits in Stock table
        // We use update first checking that we don't decrement below 0 just to be safe
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
            where: {
              productId_warehouseId: {
                productId: reservation.productId,
                warehouseId: reservation.warehouseId,
              },
            },
            data: {
              reservedUnits: newReserved,
            },
          });
        }

        // 2. Mark the reservation as RELEASED
        await tx.reservation.update({
          where: {
            id: reservation.id,
          },
          data: {
            status: 'RELEASED',
          },
        });
      }

      return expiredReservations.length;
    });
  } catch (error) {
    console.error('[Lazy Cleanup Error]: Failed to release expired reservations:', error);
    return 0;
  }
}

import db from './db';

/**
 * Lazily scans for expired PENDING reservations and releases them back into available stock.
 * Runs in a secure database transaction to prevent race conditions during cleanup.
 */
export async function runLazyCleanup(): Promise<number> {
  const now = new Date();

  try {
    // Increase transaction timeout options to be highly resilient to remote database network latency
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

      const stockUpdates: { [key: string]: { productId: string; warehouseId: string; totalQty: number } } = {};
      const expiredIds: string[] = [];

      for (const reservation of expiredReservations) {
        const key = `${reservation.productId}_${reservation.warehouseId}`;
        if (!stockUpdates[key]) {
          stockUpdates[key] = {
            productId: reservation.productId,
            warehouseId: reservation.warehouseId,
            totalQty: 0,
          };
        }
        stockUpdates[key].totalQty += reservation.quantity;
        expiredIds.push(reservation.id);
      }

      // 1. Grouped updates to Stock to minimize round-trips
      for (const key of Object.keys(stockUpdates)) {
        const update = stockUpdates[key];
        const stock = await tx.stock.findUnique({
          where: {
            productId_warehouseId: {
              productId: update.productId,
              warehouseId: update.warehouseId,
            },
          },
        });

        if (stock) {
          const newReserved = Math.max(0, stock.reservedUnits - update.totalQty);
          await tx.stock.update({
            where: { id: stock.id },
            data: {
              reservedUnits: newReserved,
            },
          });
        }
      }

      // 2. Perform a single bulk update for all expired reservations
      if (expiredIds.length > 0) {
        await tx.reservation.updateMany({
          where: {
            id: { in: expiredIds },
          },
          data: {
            status: 'RELEASED',
          },
        });
      }

      return expiredReservations.length;
    }, {
      maxWait: 15000,
      timeout: 30000,
    });
  } catch (error) {
    console.error('[Lazy Cleanup Error]: Failed to release expired reservations:', error);
    return 0;
  }
}

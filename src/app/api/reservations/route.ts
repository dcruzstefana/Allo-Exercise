import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import db from '@/lib/db';
import { runLazyCleanup } from '@/lib/cleanup';
import { checkIdempotency, saveIdempotency } from '@/lib/idempotency';

const reservationSchema = z.object({
  productId: z.string().uuid('Invalid Product ID'),
  warehouseId: z.string().uuid('Invalid Warehouse ID'),
  quantity: z.number().int().positive('Quantity must be a positive integer').default(1),
});

export async function POST(request: NextRequest) {
  const idempotencyKey = request.headers.get('Idempotency-Key');

  try {
    // 1. Check idempotency
    const cachedResponse = await checkIdempotency(idempotencyKey);
    if (cachedResponse) {
      return NextResponse.json(cachedResponse.body, { status: cachedResponse.status });
    }

    // 2. Parse and validate body
    const body = await request.json().catch(() => ({}));
    const parseResult = reservationSchema.safeParse(body);

    if (!parseResult.success) {
      const errorMsg = { error: 'Validation Error', details: parseResult.error.flatten().fieldErrors };
      await saveIdempotency(idempotencyKey, 400, errorMsg);
      return NextResponse.json(errorMsg, { status: 400 });
    }

    const { productId, warehouseId, quantity } = parseResult.data;

    // 3. Run lazy cleanup of expired reservations before attempting a new one
    await runLazyCleanup();

    // 4. Run reservation in a database transaction with a row-level lock
    const result = await db.$transaction(async (tx) => {
      // Acquire pessimistic lock on the Stock row for the specified product and warehouse
      const stockList = await tx.$queryRaw<any[]>`
        SELECT * FROM "Stock"
        WHERE "productId" = ${productId} AND "warehouseId" = ${warehouseId}
        FOR UPDATE;
      `;

      if (!stockList || stockList.length === 0) {
        return {
          success: false,
          status: 404,
          payload: { error: 'Stock record not found for this product and warehouse.' },
        };
      }

      const stock = stockList[0];
      const availableUnits = stock.totalUnits - stock.reservedUnits;

      // Check if stock is sufficient
      if (availableUnits < quantity) {
        console.log(
          `[Reservation Conflict]: Product: ${productId}, Warehouse: ${warehouseId}. Requested: ${quantity}, Available: ${availableUnits}`
        );
        return {
          success: false,
          status: 409,
          payload: {
            error: 'Insufficient stock available.',
            availableStock: availableUnits,
            requestedQuantity: quantity,
          },
        };
      }

      // Stock is available. Proceed to reserve.
      // A. Create the Reservation record (expires in 10 minutes)
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
      const reservation = await tx.reservation.create({
        data: {
          productId,
          warehouseId,
          quantity,
          status: 'PENDING',
          expiresAt,
        },
        include: {
          product: { select: { name: true, sku: true } },
          warehouse: { select: { name: true } },
        },
      });

      // B. Increment reservedUnits in the Stock table
      await tx.stock.update({
        where: { id: stock.id },
        data: {
          reservedUnits: {
            increment: quantity,
          },
        },
      });

      const timeLeft = Math.max(0, Math.floor((reservation.expiresAt.getTime() - Date.now()) / 1000));
      return {
        success: true,
        status: 201,
        payload: {
          ...reservation,
          timeLeft,
        },
      };
    }, {
      maxWait: 15000,
      timeout: 30000,
    });

    // 5. Save and return the response
    await saveIdempotency(idempotencyKey, result.status, result.payload);
    return NextResponse.json(result.payload, { status: result.status });
  } catch (error) {
    console.error('[API Reservations POST Error]:', error);
    const errorMsg = { error: 'Internal Server Error' };
    return NextResponse.json(errorMsg, { status: 500 });
  }
}

# Allo - Multi-Warehouse Inventory & Reservation System

This is a Next.js (App Router) project that implements an inventory reservation system to handle high-concurrency checkout race conditions for multi-warehouse retail brands.

🔗 **Live Demo:** [https://allo-exercise-dls3tsxl2-stefana-dcruz-s-projects.vercel.app](https://allo-exercise-dls3tsxl2-stefana-dcruz-s-projects.vercel.app/)

## The Challenge
When a shopper goes to checkout, the payment process takes a few minutes. 
- If we only decrement inventory after successful payment, two shoppers might pay for the same last unit. One gets a refund (bad experience) and ops has to clean up the data.
- If we decrement stock immediately when an item is added to the cart, the inventory gets depleted even though most carts are abandoned, killing conversion.

### The Solution
We temporarily hold the items for a **10-minute window** when a customer begins checkout. If they pay, we confirm the reservation and permanently decrement stock. If they cancel or the hold expires, the items are released back into the available pool.

---

## Technical Architecture & Core Deliverables

### 1. Concurrency Safety (Pessimistic Row-Locking)
To ensure that two concurrent checkouts for the last item of a SKU never result in double-selling, the reservation endpoint (`POST /api/reservations`) uses a **PostgreSQL row-level lock** inside a transaction:
```sql
SELECT * FROM "Stock"
WHERE "productId" = ${productId} AND "warehouseId" = ${warehouseId}
FOR UPDATE;
```
This forces incoming requests for the same product-warehouse combination to execute sequentially. If a request claims the last available stock, the subsequent request immediately reads the updated count, fails the availability check, and returns a **409 Conflict** error.

### 2. Automatic Expiry (Lazy Cleanup on Read)
Instead of running a heavy background worker or a constant cron job to clean up expired reservations every second, this application uses a **lazy cleanup on read** approach (`src/lib/cleanup.ts`). 
Expired pending holds are checked and returned to active stock inside database operations:
- When listing products (`GET /api/products`).
- When checking reservation details (`GET /api/reservations/:id`).
- When creating a new reservation (`POST /api/reservations`).
This minimizes background worker overhead while ensuring inventory counts are always completely accurate when accessed.

### 3. Idempotency Support (Bonus Feature)
To protect against network retries or double-clicking "Confirm Purchase", the application supports the `Idempotency-Key` header:
- When a client sends a request with this header, the server caches the response in the `IdempotentRequest` table.
- If the server receives a request with an identical key, it returns the cached response directly, preventing duplicate database writes or double-decrements.

---

## Folder Structure

The core parts of the system are structured as follows:

- `/src/lib/`
  - `db.ts` - Instantiates the Prisma Client configured with `@prisma/adapter-pg` to work with the PostgreSQL database.
  - `cleanup.ts` - Holds the lazy cleanup transaction logic.
  - `idempotency.ts` - Helpers to check and save idempotency keys.
- `/src/app/api/`
  - `products/route.ts` - Handles listing products and active stock.
  - `warehouses/route.ts` - Handles listing warehouses.
  - `reservations/route.ts` - Handles creating reservations (handles concurrency and row locking).
  - `reservations/[id]/route.ts` - Retrieves details of a specific reservation.
  - `reservations/[id]/confirm/route.ts` - Finalizes the sale and permanently decrements stock.
  - `reservations/[id]/release/route.ts` - Cancels the hold and releases stock back to pool.
- `/src/app/`
  - `page.tsx` - Storefront product listing page showing available stock per warehouse and a direct "Reserve" button.
  - `checkout/[id]/page.tsx` - Checkout page showing reservation billing, ticking countdown timer, and confirm/cancel actions.
- `/prisma/`
  - `schema.prisma` - DB schema definitions (Product, Warehouse, Stock, Reservation, and IdempotentRequest).
  - `seed.ts` - Seeding script configuring the initial stock and catalog.

---

## How to Run the Project Locally

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Local PostgreSQL Database
We use `prisma dev` to run a local PostgreSQL instance:
```bash
npx prisma dev
```

### 3. Sync Schema & Seed Database
In a separate terminal window, compile your client, push the tables to the database, and seed the initial inventory catalog:
```bash
npx prisma generate
npx prisma db push
npx prisma db seed
```

### 4. Run Next.js Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the storefront catalog.

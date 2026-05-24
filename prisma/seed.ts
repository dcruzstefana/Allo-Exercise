import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Cleaning up existing data...');
  // Delete in reverse order of dependencies
  await prisma.idempotentRequest.deleteMany({});
  await prisma.reservation.deleteMany({});
  await prisma.stock.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.warehouse.deleteMany({});

  console.log('Seeding warehouses...');
  const sfWarehouse = await prisma.warehouse.create({
    data: {
      name: 'San Francisco Hub',
      location: 'San Francisco, CA',
    },
  });

  const nyWarehouse = await prisma.warehouse.create({
    data: {
      name: 'New York Fullfillment Center',
      location: 'Brooklyn, NY',
    },
  });

  console.log('Seeding products...');
  const products = [
    {
      name: 'Allo D2C Premium Hoodie',
      sku: 'ALLO-HOODIE-001',
      description: 'Ultra-soft organic cotton hoodie, perfect for developer comfort.',
    },
    {
      name: 'Minimalist Matte Water Bottle',
      sku: 'ALLO-BOTTLE-002',
      description: 'Double-walled vacuum insulated stainless steel water bottle. Keeps drinks cold for 24h.',
    },
    {
      name: 'Allo Ceramic Coffee Mug (Limited Edition)',
      sku: 'ALLO-MUG-003',
      description: 'Stoneware matte black mug with an edgy base design. Extremely limited stock.',
    },
    {
      name: 'Allo Developer Mechanical Keyboard (Limited Edition)',
      sku: 'ALLO-KEYBOARD-004',
      description: 'Hot-swappable tactile mechanical keyboard with custom purple keycaps and aluminum chassis.',
    },
    {
      name: 'Premium Tech Organizer Pouch',
      sku: 'ALLO-POUCH-005',
      description: 'Weatherproof ballistic nylon tech organizer for cables, chargers, and SD cards.',
    },
    {
      name: 'Allo Developer Desk Mat',
      sku: 'ALLO-DESKMAT-006',
      description: 'Premium stitched-edge micro-textured felt desk mat, designed to pair with the Allo Ceramic mug.',
    },
  ];

  const seededProducts = [];
  for (const productData of products) {
    const product = await prisma.product.create({
      data: productData,
    });
    seededProducts.push(product);
  }

  console.log('Seeding stock levels...');
  // Hoodie stock levels: SF = 10, NY = 5
  await prisma.stock.create({
    data: {
      productId: seededProducts[0].id,
      warehouseId: sfWarehouse.id,
      totalUnits: 10,
      reservedUnits: 0,
    },
  });
  await prisma.stock.create({
    data: {
      productId: seededProducts[0].id,
      warehouseId: nyWarehouse.id,
      totalUnits: 5,
      reservedUnits: 0,
    },
  });

  // Bottle stock levels: SF = 3, NY = 0
  await prisma.stock.create({
    data: {
      productId: seededProducts[1].id,
      warehouseId: sfWarehouse.id,
      totalUnits: 3,
      reservedUnits: 0,
    },
  });
  await prisma.stock.create({
    data: {
      productId: seededProducts[1].id,
      warehouseId: nyWarehouse.id,
      totalUnits: 0,
      reservedUnits: 0,
    },
  });

  // Limited Mug stock levels: SF = 1, NY = 1 (Perfect for concurrency testing!)
  await prisma.stock.create({
    data: {
      productId: seededProducts[2].id,
      warehouseId: sfWarehouse.id,
      totalUnits: 1,
      reservedUnits: 0,
    },
  });
  await prisma.stock.create({
    data: {
      productId: seededProducts[2].id,
      warehouseId: nyWarehouse.id,
      totalUnits: 1,
      reservedUnits: 0,
    },
  });

  // Keyboard stock levels: SF = 2, NY = 1
  await prisma.stock.create({
    data: {
      productId: seededProducts[3].id,
      warehouseId: sfWarehouse.id,
      totalUnits: 2,
      reservedUnits: 0,
    },
  });
  await prisma.stock.create({
    data: {
      productId: seededProducts[3].id,
      warehouseId: nyWarehouse.id,
      totalUnits: 1,
      reservedUnits: 0,
    },
  });

  // Pouch stock levels: SF = 8, NY = 4
  await prisma.stock.create({
    data: {
      productId: seededProducts[4].id,
      warehouseId: sfWarehouse.id,
      totalUnits: 8,
      reservedUnits: 0,
    },
  });
  await prisma.stock.create({
    data: {
      productId: seededProducts[4].id,
      warehouseId: nyWarehouse.id,
      totalUnits: 4,
      reservedUnits: 0,
    },
  });

  // Desk Mat stock levels: SF = 5, NY = 2
  await prisma.stock.create({
    data: {
      productId: seededProducts[5].id,
      warehouseId: sfWarehouse.id,
      totalUnits: 5,
      reservedUnits: 0,
    },
  });
  await prisma.stock.create({
    data: {
      productId: seededProducts[5].id,
      warehouseId: nyWarehouse.id,
      totalUnits: 2,
      reservedUnits: 0,
    },
  });

  console.log('Seeding complete successfully!');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

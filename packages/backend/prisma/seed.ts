import { PrismaClient, Role, InteractionType } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Clean existing data (order matters due to FK constraints)
  await prisma.interactionProduct.deleteMany();
  await prisma.saleItem.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.interaction.deleteMany();
  await prisma.product.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.user.deleteMany();
  await prisma.store.deleteMany();

  // ── Store ──────────────────────────────────
  const store = await prisma.store.create({
    data: {
      name: 'Downtown Gadget Shop',
      address: '123 Main St, Anytown',
      phone: '02-1234-5678',
    },
  });

  // ── User (manager) ────────────────────────
  const manager = await prisma.user.create({
    data: {
      email: 'manager@gadgetshop.com',
      passwordHash: '$2b$10$placeholder_hash_for_seed_data',
      name: 'Alice Manager',
      role: Role.MANAGER,
      storeId: store.id,
    },
  });

  const staff = await prisma.user.create({
    data: {
      email: 'staff@gadgetshop.com',
      passwordHash: '$2b$10$placeholder_hash_for_seed_data',
      name: 'Bob Staff',
      role: Role.STAFF,
      storeId: store.id,
    },
  });

  // ── Tags ───────────────────────────────────
  // Predefined tags every store gets out of the box. Names are unique
  // per store via @@unique([storeId, name]); colors are hex strings so
  // the frontend can render them however it likes.
  const tagVIP = await prisma.tag.create({
    data: { name: 'VIP', color: '#FFD700', storeId: store.id }, // gold
  });

  const tagRegular = await prisma.tag.create({
    data: { name: 'Regular', color: '#1E90FF', storeId: store.id }, // blue
  });

  const tagNew = await prisma.tag.create({
    data: { name: 'New', color: '#32CD32', storeId: store.id }, // green
  });

  // ── Customers (5) ─────────────────────────
  const customers = await Promise.all([
    prisma.customer.create({
      data: {
        name: 'Charlie Chen',
        phone: '0912-111-111',
        email: 'charlie@example.com',
        address: '456 Oak Ave',
        notes: 'Prefers weekend visits',
        storeId: store.id,
        tags: { connect: [{ id: tagVIP.id }, { id: tagRegular.id }] },
      },
    }),
    prisma.customer.create({
      data: {
        name: 'Diana Davis',
        phone: '0912-222-222',
        email: 'diana@example.com',
        address: '789 Pine Rd',
        storeId: store.id,
        tags: { connect: [{ id: tagNew.id }] },
      },
    }),
    prisma.customer.create({
      data: {
        name: 'Edward Evans',
        phone: '0912-333-333',
        email: 'edward@example.com',
        storeId: store.id,
        tags: { connect: [{ id: tagRegular.id }] },
      },
    }),
    prisma.customer.create({
      data: {
        name: 'Fiona Foster',
        phone: '0912-444-444',
        email: 'fiona@example.com',
        address: '321 Elm Blvd',
        notes: 'Corporate buyer',
        storeId: store.id,
        tags: { connect: [{ id: tagVIP.id }] },
      },
    }),
    prisma.customer.create({
      data: {
        name: 'George Green',
        phone: '0912-555-555',
        email: 'george@example.com',
        storeId: store.id,
      },
    }),
  ]);

  // ── Products (3) ──────────────────────────
  const products = await Promise.all([
    prisma.product.create({
      data: {
        name: 'Wireless Earbuds Pro',
        price: 79.99,
        sku: 'WEP-001',
        category: 'Audio',
        storeId: store.id,
      },
    }),
    prisma.product.create({
      data: {
        name: 'USB-C Hub 7-in-1',
        price: 45.5,
        sku: 'UCH-002',
        category: 'Accessories',
        storeId: store.id,
      },
    }),
    prisma.product.create({
      data: {
        name: 'Portable Charger 20000mAh',
        price: 39.99,
        sku: 'PC-003',
        category: 'Power',
        storeId: store.id,
      },
    }),
  ]);

  // ── Interactions (10) ─────────────────────
  const now = new Date();
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000);

  const interactions = await Promise.all([
    prisma.interaction.create({
      data: {
        type: InteractionType.VISIT,
        date: daysAgo(30),
        notes: 'First visit, browsed earbuds',
        customerId: customers[0].id,
        userId: staff.id,
        storeId: store.id,
        products: { create: [{ productId: products[0].id }] },
      },
    }),
    prisma.interaction.create({
      data: {
        type: InteractionType.PURCHASE,
        date: daysAgo(28),
        notes: 'Bought earbuds',
        customerId: customers[0].id,
        userId: staff.id,
        storeId: store.id,
        products: { create: [{ productId: products[0].id }] },
      },
    }),
    prisma.interaction.create({
      data: {
        type: InteractionType.CALL,
        date: daysAgo(25),
        notes: 'Follow-up satisfaction call',
        customerId: customers[0].id,
        userId: manager.id,
        storeId: store.id,
      },
    }),
    prisma.interaction.create({
      data: {
        type: InteractionType.VISIT,
        date: daysAgo(20),
        notes: 'Looking for USB hubs',
        customerId: customers[1].id,
        userId: staff.id,
        storeId: store.id,
        products: { create: [{ productId: products[1].id }] },
      },
    }),
    prisma.interaction.create({
      data: {
        type: InteractionType.PURCHASE,
        date: daysAgo(18),
        notes: 'Bought USB hub and charger',
        customerId: customers[1].id,
        userId: staff.id,
        storeId: store.id,
        products: {
          create: [{ productId: products[1].id }, { productId: products[2].id }],
        },
      },
    }),
    prisma.interaction.create({
      data: {
        type: InteractionType.COMPLAINT,
        date: daysAgo(15),
        notes: 'USB hub port not working',
        customerId: customers[1].id,
        userId: manager.id,
        storeId: store.id,
        products: { create: [{ productId: products[1].id }] },
      },
    }),
    prisma.interaction.create({
      data: {
        type: InteractionType.VISIT,
        date: daysAgo(12),
        notes: 'Browsed products, no purchase',
        customerId: customers[2].id,
        userId: staff.id,
        storeId: store.id,
      },
    }),
    prisma.interaction.create({
      data: {
        type: InteractionType.PURCHASE,
        date: daysAgo(10),
        notes: 'Bought charger',
        customerId: customers[2].id,
        userId: staff.id,
        storeId: store.id,
        products: { create: [{ productId: products[2].id }] },
      },
    }),
    prisma.interaction.create({
      data: {
        type: InteractionType.CALL,
        date: daysAgo(5),
        notes: 'Corporate order inquiry',
        customerId: customers[3].id,
        userId: manager.id,
        storeId: store.id,
      },
    }),
    prisma.interaction.create({
      data: {
        type: InteractionType.VISIT,
        date: daysAgo(2),
        notes: 'First visit, exploring',
        customerId: customers[4].id,
        userId: staff.id,
        storeId: store.id,
        products: {
          create: [{ productId: products[0].id }, { productId: products[2].id }],
        },
      },
    }),
  ]);

  // ── Sales (3 — linked to PURCHASE interactions) ──
  const sale1 = await prisma.sale.create({
    data: {
      totalAmount: 79.99,
      date: daysAgo(28),
      customerId: customers[0].id,
      userId: staff.id,
      storeId: store.id,
      items: {
        create: [{ productId: products[0].id, quantity: 1, unitPrice: 79.99 }],
      },
    },
  });

  const sale2 = await prisma.sale.create({
    data: {
      totalAmount: 85.49,
      date: daysAgo(18),
      customerId: customers[1].id,
      userId: staff.id,
      storeId: store.id,
      items: {
        create: [
          { productId: products[1].id, quantity: 1, unitPrice: 45.5 },
          { productId: products[2].id, quantity: 1, unitPrice: 39.99 },
        ],
      },
    },
  });

  const sale3 = await prisma.sale.create({
    data: {
      totalAmount: 39.99,
      date: daysAgo(10),
      customerId: customers[2].id,
      userId: staff.id,
      storeId: store.id,
      items: {
        create: [{ productId: products[2].id, quantity: 1, unitPrice: 39.99 }],
      },
    },
  });

  console.log('Seed complete:');
  console.log(`  Store:        ${store.name} (${store.id})`);
  console.log(`  Users:        2 (manager + staff)`);
  console.log(`  Tags:         3`);
  console.log(`  Customers:    ${customers.length}`);
  console.log(`  Products:     ${products.length}`);
  console.log(`  Interactions: ${interactions.length}`);
  console.log(`  Sales:        3 (${sale1.id}, ${sale2.id}, ${sale3.id})`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

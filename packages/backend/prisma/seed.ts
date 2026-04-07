import { PrismaClient, Role, InteractionType } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

/**
 * Seed the development database with TWO stores plus distinct users,
 * customers, products, tags, interactions and sales for each. Two stores
 * make multi-store data isolation (Issue #12) trivially verifiable from
 * a logged-in browser session.
 *
 * The single ADMIN user has no `storeId` and can switch between both
 * stores via the `X-Store-Id` header.
 */
async function main() {
  // Clean existing data (order matters due to FK constraints)
  await prisma.refreshToken.deleteMany();
  await prisma.interactionProduct.deleteMany();
  await prisma.saleItem.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.interaction.deleteMany();
  await prisma.product.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.user.deleteMany();
  await prisma.store.deleteMany();

  // ── Stores (2) ─────────────────────────────
  const storeA = await prisma.store.create({
    data: {
      name: 'Downtown Gadget Shop',
      address: '123 Main St, Anytown',
      phone: '02-1234-5678',
    },
  });

  const storeB = await prisma.store.create({
    data: {
      name: 'Uptown Tech Boutique',
      address: '456 High Rd, Otherville',
      phone: '02-9876-5432',
    },
  });

  // ── Users ──────────────────────────────────
  // Single ADMIN with no storeId — can switch between both stores.
  const admin = await prisma.user.create({
    data: {
      email: 'admin@store-crm.local',
      passwordHash: '$2b$10$placeholder_hash_for_seed_data',
      name: 'Ada Admin',
      role: Role.ADMIN,
      storeId: null,
    },
  });

  // Store A users
  const managerA = await prisma.user.create({
    data: {
      email: 'manager@gadgetshop.com',
      passwordHash: '$2b$10$placeholder_hash_for_seed_data',
      name: 'Alice Manager',
      role: Role.MANAGER,
      storeId: storeA.id,
    },
  });
  const staffA = await prisma.user.create({
    data: {
      email: 'staff@gadgetshop.com',
      passwordHash: '$2b$10$placeholder_hash_for_seed_data',
      name: 'Bob Staff',
      role: Role.STAFF,
      storeId: storeA.id,
    },
  });

  // Store B users
  const managerB = await prisma.user.create({
    data: {
      email: 'manager@uptowntech.com',
      passwordHash: '$2b$10$placeholder_hash_for_seed_data',
      name: 'Mia Manager',
      role: Role.MANAGER,
      storeId: storeB.id,
    },
  });
  const staffB = await prisma.user.create({
    data: {
      email: 'staff@uptowntech.com',
      passwordHash: '$2b$10$placeholder_hash_for_seed_data',
      name: 'Sam Staff',
      role: Role.STAFF,
      storeId: storeB.id,
    },
  });

  // ── Tags (per store) ───────────────────────
  const tagsA = {
    vip: await prisma.tag.create({
      data: { name: 'VIP', color: '#FFD700', storeId: storeA.id },
    }),
    newcomer: await prisma.tag.create({
      data: { name: 'Newcomer', color: '#87CEEB', storeId: storeA.id },
    }),
    frequent: await prisma.tag.create({
      data: { name: 'Frequent', color: '#90EE90', storeId: storeA.id },
    }),
  };

  const tagsB = {
    enterprise: await prisma.tag.create({
      data: { name: 'Enterprise', color: '#8B0000', storeId: storeB.id },
    }),
    walkIn: await prisma.tag.create({
      data: { name: 'Walk-in', color: '#A9A9A9', storeId: storeB.id },
    }),
  };

  // ── Customers (5 in A, 3 in B) ─────────────
  const customersA = await Promise.all([
    prisma.customer.create({
      data: {
        name: 'Charlie Chen',
        phone: '0912-111-111',
        email: 'charlie@example.com',
        address: '456 Oak Ave',
        notes: 'Prefers weekend visits',
        storeId: storeA.id,
        tags: { connect: [{ id: tagsA.vip.id }, { id: tagsA.frequent.id }] },
      },
    }),
    prisma.customer.create({
      data: {
        name: 'Diana Davis',
        phone: '0912-222-222',
        email: 'diana@example.com',
        address: '789 Pine Rd',
        storeId: storeA.id,
        tags: { connect: [{ id: tagsA.newcomer.id }] },
      },
    }),
    prisma.customer.create({
      data: {
        name: 'Edward Evans',
        phone: '0912-333-333',
        email: 'edward@example.com',
        storeId: storeA.id,
        tags: { connect: [{ id: tagsA.frequent.id }] },
      },
    }),
    prisma.customer.create({
      data: {
        name: 'Fiona Foster',
        phone: '0912-444-444',
        email: 'fiona@example.com',
        address: '321 Elm Blvd',
        notes: 'Corporate buyer',
        storeId: storeA.id,
        tags: { connect: [{ id: tagsA.vip.id }] },
      },
    }),
    prisma.customer.create({
      data: {
        name: 'George Green',
        phone: '0912-555-555',
        email: 'george@example.com',
        storeId: storeA.id,
      },
    }),
  ]);

  const customersB = await Promise.all([
    prisma.customer.create({
      data: {
        name: 'Hannah Harper',
        phone: '0921-111-111',
        email: 'hannah@example.com',
        address: '11 Riverside Dr',
        notes: 'Wholesale account',
        storeId: storeB.id,
        tags: { connect: [{ id: tagsB.enterprise.id }] },
      },
    }),
    prisma.customer.create({
      data: {
        name: 'Ivan Ivanov',
        phone: '0921-222-222',
        email: 'ivan@example.com',
        storeId: storeB.id,
        tags: { connect: [{ id: tagsB.walkIn.id }] },
      },
    }),
    prisma.customer.create({
      data: {
        name: 'Julia Jones',
        phone: '0921-333-333',
        email: 'julia@example.com',
        storeId: storeB.id,
      },
    }),
  ]);

  // ── Products ───────────────────────────────
  const productsA = await Promise.all([
    prisma.product.create({
      data: {
        name: 'Wireless Earbuds Pro',
        price: 79.99,
        sku: 'WEP-001',
        category: 'Audio',
        storeId: storeA.id,
      },
    }),
    prisma.product.create({
      data: {
        name: 'USB-C Hub 7-in-1',
        price: 45.5,
        sku: 'UCH-002',
        category: 'Accessories',
        storeId: storeA.id,
      },
    }),
    prisma.product.create({
      data: {
        name: 'Portable Charger 20000mAh',
        price: 39.99,
        sku: 'PC-003',
        category: 'Power',
        storeId: storeA.id,
      },
    }),
  ]);

  const productsB = await Promise.all([
    prisma.product.create({
      data: {
        name: 'Mechanical Keyboard TKL',
        price: 129.0,
        sku: 'MKB-101',
        category: 'Input',
        storeId: storeB.id,
      },
    }),
    prisma.product.create({
      data: {
        name: '4K Webcam Studio',
        price: 199.0,
        sku: 'WCS-102',
        category: 'Video',
        storeId: storeB.id,
      },
    }),
  ]);

  // ── Interactions (a few in each store) ─────
  const now = new Date();
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000);

  await Promise.all([
    prisma.interaction.create({
      data: {
        type: InteractionType.VISIT,
        date: daysAgo(30),
        notes: 'First visit, browsed earbuds',
        customerId: customersA[0].id,
        userId: staffA.id,
        storeId: storeA.id,
        products: { create: [{ productId: productsA[0].id }] },
      },
    }),
    prisma.interaction.create({
      data: {
        type: InteractionType.PURCHASE,
        date: daysAgo(28),
        notes: 'Bought earbuds',
        customerId: customersA[0].id,
        userId: staffA.id,
        storeId: storeA.id,
        products: { create: [{ productId: productsA[0].id }] },
      },
    }),
    prisma.interaction.create({
      data: {
        type: InteractionType.CALL,
        date: daysAgo(25),
        notes: 'Follow-up satisfaction call',
        customerId: customersA[0].id,
        userId: managerA.id,
        storeId: storeA.id,
      },
    }),
    prisma.interaction.create({
      data: {
        type: InteractionType.PURCHASE,
        date: daysAgo(18),
        notes: 'Bought USB hub and charger',
        customerId: customersA[1].id,
        userId: staffA.id,
        storeId: storeA.id,
        products: {
          create: [{ productId: productsA[1].id }, { productId: productsA[2].id }],
        },
      },
    }),
    prisma.interaction.create({
      data: {
        type: InteractionType.VISIT,
        date: daysAgo(7),
        notes: 'Looking for keyboards',
        customerId: customersB[0].id,
        userId: staffB.id,
        storeId: storeB.id,
        products: { create: [{ productId: productsB[0].id }] },
      },
    }),
    prisma.interaction.create({
      data: {
        type: InteractionType.PURCHASE,
        date: daysAgo(5),
        notes: 'Bought TKL keyboard',
        customerId: customersB[0].id,
        userId: managerB.id,
        storeId: storeB.id,
        products: { create: [{ productId: productsB[0].id }] },
      },
    }),
    prisma.interaction.create({
      data: {
        type: InteractionType.VISIT,
        date: daysAgo(2),
        notes: 'Walk-in browsing',
        customerId: customersB[1].id,
        userId: staffB.id,
        storeId: storeB.id,
      },
    }),
  ]);

  // ── Sales (linked to PURCHASE interactions) ──
  await Promise.all([
    prisma.sale.create({
      data: {
        totalAmount: 79.99,
        date: daysAgo(28),
        customerId: customersA[0].id,
        userId: staffA.id,
        storeId: storeA.id,
        items: {
          create: [{ productId: productsA[0].id, quantity: 1, unitPrice: 79.99 }],
        },
      },
    }),
    prisma.sale.create({
      data: {
        totalAmount: 85.49,
        date: daysAgo(18),
        customerId: customersA[1].id,
        userId: staffA.id,
        storeId: storeA.id,
        items: {
          create: [
            { productId: productsA[1].id, quantity: 1, unitPrice: 45.5 },
            { productId: productsA[2].id, quantity: 1, unitPrice: 39.99 },
          ],
        },
      },
    }),
    prisma.sale.create({
      data: {
        totalAmount: 129.0,
        date: daysAgo(5),
        customerId: customersB[0].id,
        userId: managerB.id,
        storeId: storeB.id,
        items: {
          create: [{ productId: productsB[0].id, quantity: 1, unitPrice: 129.0 }],
        },
      },
    }),
  ]);

  console.log('Seed complete:');
  console.log(`  Admin:        ${admin.email} (no storeId — can switch)`);
  console.log(`  Store A:      ${storeA.name} (${storeA.id})`);
  console.log(`    Manager:    ${managerA.email}`);
  console.log(`    Staff:      ${staffA.email}`);
  console.log(`    Customers:  ${customersA.length}`);
  console.log(`    Products:   ${productsA.length}`);
  console.log(`  Store B:      ${storeB.name} (${storeB.id})`);
  console.log(`    Manager:    ${managerB.email}`);
  console.log(`    Staff:      ${staffB.email}`);
  console.log(`    Customers:  ${customersB.length}`);
  console.log(`    Products:   ${productsB.length}`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

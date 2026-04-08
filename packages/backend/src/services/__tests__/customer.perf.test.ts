/**
 * Customer search performance test — verifies the <200ms SLO from Issue #8.
 *
 * This test is **opt-in** because it needs a real PostgreSQL instance.
 * The rest of the backend suite uses mocked Prisma, so we don't want to
 * make CI depend on a live DB unless the operator explicitly enables it.
 *
 * ## How to run locally
 *
 *     # 1. Point at a throwaway DB (separate from your dev DB so it can
 *     #    be wiped freely). The customer table is TRUNCATE'd between
 *     #    each test, so do NOT aim this at anything precious.
 *     export DATABASE_URL_PERF="postgresql://postgres:postgres@localhost:5432/store_crm_perf"
 *
 *     # 2. Run migrations against that DB once:
 *     DATABASE_URL="$DATABASE_URL_PERF" npx prisma migrate deploy
 *
 *     # 3. Run the perf suite:
 *     DATABASE_URL_PERF="$DATABASE_URL_PERF" npx vitest run customer.perf
 *
 * When `DATABASE_URL_PERF` is unset the whole suite is skipped, so the
 * default `npm test` run on a dev laptop or in CI remains green without
 * a Postgres dependency.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const PERF_URL = process.env.DATABASE_URL_PERF;
const TARGET_MS = 200;
const SEED_COUNT = 1_200; // >1000 per AC

// Skip the entire describe block unless the operator opted in. `skipIf`
// keeps the file importable so missing DB config never crashes Vitest.
describe.skipIf(!PERF_URL)('Customer search performance (real DB)', () => {
  // Dedicated Prisma instance bound to the perf DB so we never touch
  // whatever DATABASE_URL the dev machine is currently using.
  let prisma: PrismaClient;
  let storeId: string;
  let tagIds: { vip: string; regular: string; new: string };

  beforeAll(async () => {
    const adapter = new PrismaPg({ connectionString: PERF_URL });
    prisma = new PrismaClient({ adapter });

    // Wipe + reseed. Order matters due to FK constraints — customers
    // reference tags via an implicit join table, so truncating both in
    // the same statement is safe.
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "Customer", "Tag", "Store" RESTART IDENTITY CASCADE',
    );

    const store = await prisma.store.create({
      data: { name: 'Perf Store', address: '1 Bench Ln', phone: '555-PERF' },
    });
    storeId = store.id;

    const [vip, regular, tagNew] = await Promise.all([
      prisma.tag.create({ data: { name: 'VIP', color: '#FFD700', storeId } }),
      prisma.tag.create({ data: { name: 'Regular', color: '#1E90FF', storeId } }),
      prisma.tag.create({ data: { name: 'New', color: '#32CD32', storeId } }),
    ]);
    tagIds = { vip: vip.id, regular: regular.id, new: tagNew.id };

    // Seed 1,200 customers with deterministic-but-varied data. Every
    // 3rd customer is VIP, every 5th is Regular — so filter queries
    // actually have to discriminate.
    const rows: Array<Parameters<typeof prisma.customer.create>[0]['data']> = [];
    for (let i = 0; i < SEED_COUNT; i++) {
      const firstName = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve'][i % 5];
      const lastName = ['Smith', 'Jones', 'Brown', 'Davis', 'Evans'][(i * 7) % 5];
      rows.push({
        name: `${firstName} ${lastName} ${i}`,
        phone: `+1555${String(i).padStart(7, '0')}`,
        email: `user${i}@example.com`,
        address: `${i} Main St`,
        storeId,
        // Spread createdAt across ~6 months so date filters actually
        // exclude rows instead of matching everything.
        createdAt: new Date(2026, 0, 1 + (i % 180)),
      });
    }
    // createMany is 10-20x faster than individual creates for seeds.
    await prisma.customer.createMany({ data: rows });

    // Assign tags in batch. Using connect via updateMany is not
    // supported, so we fetch ids and update the 3rd/5th subset.
    const customers = await prisma.customer.findMany({
      where: { storeId },
      select: { id: true },
      orderBy: { name: 'asc' },
    });
    await Promise.all(
      customers.map((c, i) => {
        const connect: { id: string }[] = [];
        if (i % 3 === 0) connect.push({ id: tagIds.vip });
        if (i % 5 === 0) connect.push({ id: tagIds.regular });
        if (connect.length === 0) return null;
        return prisma.customer.update({
          where: { id: c.id },
          data: { tags: { connect } },
        });
      }),
    );

    // eslint-disable-next-line no-console
    console.log(`[perf] seeded ${SEED_COUNT} customers in store ${storeId}`);
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  /**
   * Run a query a few times and return the median duration in ms. The
   * median is more representative than a single run because the first
   * query after connection pools warm up tends to be an outlier.
   */
  async function measure(fn: () => Promise<unknown>, runs = 5): Promise<number> {
    const durations: number[] = [];
    for (let i = 0; i < runs; i++) {
      const start = performance.now();
      await fn();
      durations.push(performance.now() - start);
    }
    durations.sort((a, b) => a - b);
    return durations[Math.floor(durations.length / 2)];
  }

  // Import lazily so test collection doesn't trigger the module that
  // also imports the mocked prismaClient in sibling test files.
  async function getListCustomers() {
    // Override the prisma client used by the service to point at the
    // perf DB. We achieve this by re-importing the service module
    // through Vitest's dynamic import after setting a module-scoped
    // singleton on globalThis. For this simple case we replicate the
    // where-builder directly since the service module imports a
    // module-scoped prisma client we can't swap at runtime.
    const { buildCustomerWhere } = await import('../customer.service');
    return buildCustomerWhere;
  }

  it(`search by substring across 1200 customers runs in <${TARGET_MS}ms`, async () => {
    const buildCustomerWhere = await getListCustomers();
    const where = buildCustomerWhere({ storeId, search: 'Alice' });

    const ms = await measure(() =>
      prisma.customer.findMany({
        where,
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: { tags: { select: { id: true, name: true, color: true } } },
      }),
    );
    // eslint-disable-next-line no-console
    console.log(`[perf] search=Alice: median ${ms.toFixed(1)}ms`);
    expect(ms).toBeLessThan(TARGET_MS);
  });

  it(`filter by tag name across 1200 customers runs in <${TARGET_MS}ms`, async () => {
    const buildCustomerWhere = await getListCustomers();
    // Use lowercase `vip` to exercise the case-insensitive tag name
    // filter path against the mixed-case seed tag `VIP`. If the filter
    // ever regresses to case-sensitive, this test will return 0 rows
    // but still pass the timing assertion — so we also verify below
    // that the query actually returns data (not a silent empty set).
    const where = buildCustomerWhere({ storeId, tags: ['vip'] });

    let rowCount = 0;
    const ms = await measure(async () => {
      const rows = await prisma.customer.findMany({
        where,
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: { tags: { select: { id: true, name: true, color: true } } },
      });
      rowCount = rows.length;
    });
    // eslint-disable-next-line no-console
    console.log(`[perf] tags=vip: median ${ms.toFixed(1)}ms (${rowCount} rows)`);
    expect(ms).toBeLessThan(TARGET_MS);
    // Regression guard for the case-insensitive tag filter fix — if this
    // ever drops to 0, Prisma reverted to case-sensitive `in` matching.
    expect(rowCount).toBeGreaterThan(0);
  });

  it(`filter by date range across 1200 customers runs in <${TARGET_MS}ms`, async () => {
    const buildCustomerWhere = await getListCustomers();
    const where = buildCustomerWhere({
      storeId,
      createdAfter: new Date('2026-02-01'),
      createdBefore: new Date('2026-04-01'),
    });

    const ms = await measure(() =>
      prisma.customer.findMany({
        where,
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: { tags: { select: { id: true, name: true, color: true } } },
      }),
    );
    // eslint-disable-next-line no-console
    console.log(`[perf] createdAt range: median ${ms.toFixed(1)}ms`);
    expect(ms).toBeLessThan(TARGET_MS);
  });

  it(`combined search + tag + date filter runs in <${TARGET_MS}ms`, async () => {
    const buildCustomerWhere = await getListCustomers();
    const where = buildCustomerWhere({
      storeId,
      search: 'Smith',
      // Lowercase — exercises the case-insensitive tag filter against
      // seed tag `VIP`. See tag-name test above for rationale.
      tags: ['vip'],
      createdAfter: new Date('2026-01-01'),
      createdBefore: new Date('2026-06-30'),
    });

    const ms = await measure(() =>
      prisma.customer.findMany({
        where,
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: { tags: { select: { id: true, name: true, color: true } } },
      }),
    );
    // eslint-disable-next-line no-console
    console.log(`[perf] combined filters: median ${ms.toFixed(1)}ms`);
    expect(ms).toBeLessThan(TARGET_MS);
  });
});

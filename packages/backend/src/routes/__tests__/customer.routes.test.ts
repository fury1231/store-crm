import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';

// ── Mock Prisma (vi.hoisted so mock is available at hoist time) ──
const mockCustomer = vi.hoisted(() => ({
  create: vi.fn(),
  findMany: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  count: vi.fn(),
}));

const mockUser = vi.hoisted(() => ({
  findUnique: vi.fn(),
}));

vi.mock('../../prismaClient', () => ({
  prisma: { customer: mockCustomer, user: mockUser },
}));

// Import app + auth helpers after mock setup
import { app } from '../../app';
import {
  TEST_JWT_SECRET,
  authHeader,
  defaultTestUser,
} from '../../testHelpers/auth';

// ── Fixtures ───────────────────────────────────────────
const fakeCustomer = {
  id: 'cus_abc123',
  name: 'John Doe',
  phone: '+1234567890',
  email: 'john@example.com',
  address: '123 Main St',
  notes: 'VIP customer',
  storeId: 'str_abc123',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
};

// Customers — every role can CRUD. STAFF is the most restrictive role
// that should still pass, so default to STAFF for the existing test suite.
const adminAuth = () => authHeader({ role: 'ADMIN' });
const managerAuth = () => authHeader({ role: 'MANAGER' });
const staffAuth = () => authHeader({ role: 'STAFF' });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  // authenticate middleware looks up the user from the JWT — return one by default.
  mockUser.findUnique.mockResolvedValue({
    id: defaultTestUser.id,
    email: defaultTestUser.email,
    role: 'STAFF',
    storeId: defaultTestUser.storeId,
  });
});

afterEach(() => {
  delete process.env.JWT_SECRET;
});

// ── POST /api/customers ───────────────────────────────
describe('POST /api/customers', () => {
  it('should create a customer and return 201 with tags:[] and empty warnings', async () => {
    mockCustomer.findFirst.mockResolvedValue(null); // no duplicates
    mockCustomer.create.mockResolvedValue(fakeCustomer);

    const res = await request(app)
      .post('/api/customers')
      .set('Authorization', staffAuth())
      .send({
        name: 'John Doe',
        phone: '+1234567890',
        email: 'john@example.com',
        address: '123 Main St',
        notes: 'VIP customer',
        storeId: 'str_abc123',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe('cus_abc123');
    expect(res.body.data.tags).toEqual([]);
    expect(res.body.data).not.toHaveProperty('deletedAt');
    expect(res.body.warnings).toEqual([]);
  });

  it('should return 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/customers')
      .set('Authorization', staffAuth())
      .send({ storeId: 'str_abc123' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toBeDefined();
  });

  it('should return 400 when storeId is missing', async () => {
    const res = await request(app)
      .post('/api/customers')
      .set('Authorization', staffAuth())
      .send({ name: 'John Doe' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 for invalid email format', async () => {
    const res = await request(app)
      .post('/api/customers')
      .set('Authorization', staffAuth())
      .send({
        name: 'John',
        storeId: 'str_abc123',
        email: 'not-an-email',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 for invalid phone format', async () => {
    const res = await request(app)
      .post('/api/customers')
      .set('Authorization', staffAuth())
      .send({
        name: 'John',
        storeId: 'str_abc123',
        phone: 'abc',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 when name is empty string', async () => {
    const res = await request(app)
      .post('/api/customers')
      .set('Authorization', staffAuth())
      .send({
        name: '',
        storeId: 'str_abc123',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should create customer with minimal fields (name + storeId)', async () => {
    mockCustomer.findFirst.mockResolvedValue(null);
    const minimal = {
      ...fakeCustomer,
      phone: null,
      email: null,
      address: null,
      notes: null,
    };
    mockCustomer.create.mockResolvedValue(minimal);

    const res = await request(app)
      .post('/api/customers')
      .set('Authorization', staffAuth())
      .send({
        name: 'John Doe',
        storeId: 'str_abc123',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.phone).toBeNull();
    expect(res.body.data.tags).toEqual([]);
  });

  it('should return warnings array but still create when phone duplicate detected', async () => {
    mockCustomer.findFirst
      .mockResolvedValueOnce({ id: 'existing_1' }) // phone
      .mockResolvedValueOnce(null); // email
    mockCustomer.create.mockResolvedValue(fakeCustomer);

    const res = await request(app)
      .post('/api/customers')
      .set('Authorization', staffAuth())
      .send({
        name: 'John Doe',
        phone: '+1234567890',
        email: 'john@example.com',
        storeId: 'str_abc123',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe('cus_abc123');
    expect(res.body.warnings).toHaveLength(1);
    expect(res.body.warnings[0].field).toBe('phone');
    expect(res.body.warnings[0].existingCustomerId).toBe('existing_1');
  });
});

// ── GET /api/customers ────────────────────────────────
describe('GET /api/customers', () => {
  it('should return paginated customers with meta and tags:[] in each', async () => {
    mockCustomer.count.mockResolvedValue(1);
    mockCustomer.findMany.mockResolvedValue([fakeCustomer]);

    const res = await request(app)
      .get('/api/customers')
      .set('Authorization', staffAuth());

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].tags).toEqual([]);
    expect(res.body.data[0]).not.toHaveProperty('deletedAt');
    expect(res.body.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
  });

  it('should respect page and limit query params', async () => {
    mockCustomer.count.mockResolvedValue(50);
    mockCustomer.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/customers?page=3&limit=10')
      .set('Authorization', staffAuth());

    expect(res.status).toBe(200);
    expect(res.body.meta.page).toBe(3);
    expect(res.body.meta.limit).toBe(10);
    expect(res.body.meta.totalPages).toBe(5);
  });

  it('should apply search query across name, phone, email', async () => {
    mockCustomer.count.mockResolvedValue(1);
    mockCustomer.findMany.mockResolvedValue([fakeCustomer]);

    const res = await request(app)
      .get('/api/customers?search=john')
      .set('Authorization', staffAuth());

    expect(res.status).toBe(200);
    // The where-builder wraps every filter (including the default
    // soft-delete exclusion) in an AND array once more than one clause
    // is present — so search adds a second clause containing the OR.
    expect(mockCustomer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { deletedAt: null },
            {
              OR: [
                { name: { contains: 'john', mode: 'insensitive' } },
                { phone: { contains: 'john', mode: 'insensitive' } },
                { email: { contains: 'john', mode: 'insensitive' } },
              ],
            },
          ],
        },
      }),
    );
  });

  it('should respect sortBy=name&order=asc', async () => {
    mockCustomer.count.mockResolvedValue(0);
    mockCustomer.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/customers?sortBy=name&order=asc')
      .set('Authorization', staffAuth());

    expect(res.status).toBe(200);
    expect(mockCustomer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { name: 'asc' } }),
    );
  });

  it('should default to sortBy=createdAt&order=desc', async () => {
    mockCustomer.count.mockResolvedValue(0);
    mockCustomer.findMany.mockResolvedValue([]);

    await request(app).get('/api/customers').set('Authorization', staffAuth());

    expect(mockCustomer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    );
  });

  it('should return 400 for invalid sortBy', async () => {
    const res = await request(app)
      .get('/api/customers?sortBy=password')
      .set('Authorization', staffAuth());

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 for invalid order', async () => {
    const res = await request(app)
      .get('/api/customers?order=sideways')
      .set('Authorization', staffAuth());

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 for invalid pagination', async () => {
    const res = await request(app)
      .get('/api/customers?page=-1')
      .set('Authorization', staffAuth());

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 when limit exceeds max (100)', async () => {
    const res = await request(app)
      .get('/api/customers?limit=200')
      .set('Authorization', staffAuth());

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return empty data when no customers exist', async () => {
    mockCustomer.count.mockResolvedValue(0);
    mockCustomer.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/customers')
      .set('Authorization', staffAuth());

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.total).toBe(0);
  });

  it('should filter by storeId when provided', async () => {
    mockCustomer.count.mockResolvedValue(0);
    mockCustomer.findMany.mockResolvedValue([]);

    await request(app)
      .get('/api/customers?storeId=str_abc123')
      .set('Authorization', staffAuth());

    expect(mockCustomer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [{ deletedAt: null }, { storeId: 'str_abc123' }],
        },
      }),
    );
  });

  // ── New M1 filter query params (#8) ──────────────────
  it('should filter by email via field-specific contains', async () => {
    mockCustomer.count.mockResolvedValue(0);
    mockCustomer.findMany.mockResolvedValue([]);

    await request(app)
      .get('/api/customers?email=john@example.com')
      .set('Authorization', staffAuth());

    expect(mockCustomer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { deletedAt: null },
            { email: { contains: 'john@example.com', mode: 'insensitive' } },
          ],
        },
      }),
    );
  });

  it('should filter by phone via field-specific contains', async () => {
    mockCustomer.count.mockResolvedValue(0);
    mockCustomer.findMany.mockResolvedValue([]);

    await request(app)
      .get('/api/customers?phone=555')
      .set('Authorization', staffAuth());

    expect(mockCustomer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { deletedAt: null },
            { phone: { contains: '555', mode: 'insensitive' } },
          ],
        },
      }),
    );
  });

  it('should filter by tagId via tags.some subquery', async () => {
    mockCustomer.count.mockResolvedValue(0);
    mockCustomer.findMany.mockResolvedValue([]);

    await request(app)
      .get('/api/customers?tagId=tag_vip')
      .set('Authorization', staffAuth());

    expect(mockCustomer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { deletedAt: null },
            { tags: { some: { id: 'tag_vip' } } },
          ],
        },
      }),
    );
  });

  it('should filter by comma-separated tag names', async () => {
    mockCustomer.count.mockResolvedValue(0);
    mockCustomer.findMany.mockResolvedValue([]);

    await request(app)
      .get('/api/customers?tags=vip,regular')
      .set('Authorization', staffAuth());

    expect(mockCustomer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { deletedAt: null },
            { tags: { some: { name: { in: ['vip', 'regular'] } } } },
          ],
        },
      }),
    );
  });

  it('should filter by group as a single-tag-name alias', async () => {
    mockCustomer.count.mockResolvedValue(0);
    mockCustomer.findMany.mockResolvedValue([]);

    await request(app)
      .get('/api/customers?group=vip')
      .set('Authorization', staffAuth());

    expect(mockCustomer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { deletedAt: null },
            { tags: { some: { name: { in: ['vip'] } } } },
          ],
        },
      }),
    );
  });

  it('should filter by createdAfter date', async () => {
    mockCustomer.count.mockResolvedValue(0);
    mockCustomer.findMany.mockResolvedValue([]);

    await request(app)
      .get('/api/customers?createdAfter=2026-01-01')
      .set('Authorization', staffAuth());

    expect(mockCustomer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { deletedAt: null },
            { createdAt: { gte: new Date('2026-01-01') } },
          ],
        },
      }),
    );
  });

  it('should filter by createdBefore date', async () => {
    mockCustomer.count.mockResolvedValue(0);
    mockCustomer.findMany.mockResolvedValue([]);

    await request(app)
      .get('/api/customers?createdBefore=2026-06-01')
      .set('Authorization', staffAuth());

    expect(mockCustomer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { deletedAt: null },
            { createdAt: { lte: new Date('2026-06-01') } },
          ],
        },
      }),
    );
  });

  it('should combine createdAfter and createdBefore into a single DateTime filter', async () => {
    mockCustomer.count.mockResolvedValue(0);
    mockCustomer.findMany.mockResolvedValue([]);

    await request(app)
      .get('/api/customers?createdAfter=2026-01-01&createdBefore=2026-06-01')
      .set('Authorization', staffAuth());

    expect(mockCustomer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { deletedAt: null },
            {
              createdAt: {
                gte: new Date('2026-01-01'),
                lte: new Date('2026-06-01'),
              },
            },
          ],
        },
      }),
    );
  });

  it('should return 400 when createdAfter > createdBefore', async () => {
    const res = await request(app)
      .get('/api/customers?createdAfter=2026-12-31&createdBefore=2026-01-01')
      .set('Authorization', staffAuth());
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 for invalid date format', async () => {
    const res = await request(app)
      .get('/api/customers?createdAfter=not-a-date')
      .set('Authorization', staffAuth());
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should combine storeId + search + email + tags + date into one AND clause', async () => {
    mockCustomer.count.mockResolvedValue(0);
    mockCustomer.findMany.mockResolvedValue([]);

    await request(app)
      .get(
        '/api/customers?storeId=str_abc123&search=john&email=john@example.com&tags=vip,regular&createdAfter=2026-01-01',
      )
      .set('Authorization', staffAuth());

    const call = mockCustomer.findMany.mock.calls[0][0];
    expect(call.where).toHaveProperty('AND');
    const clauses = call.where.AND;
    // deletedAt + storeId + search + email + tags + createdAt = 6
    expect(clauses).toHaveLength(6);
    expect(clauses).toContainEqual({ deletedAt: null });
    expect(clauses).toContainEqual({ storeId: 'str_abc123' });
    expect(clauses).toContainEqual({
      email: { contains: 'john@example.com', mode: 'insensitive' },
    });
    expect(clauses).toContainEqual({
      tags: { some: { name: { in: ['vip', 'regular'] } } },
    });
    expect(clauses).toContainEqual({
      createdAt: { gte: new Date('2026-01-01') },
    });
  });
});

// ── GET /api/customers/export ─────────────────────────
describe('GET /api/customers/export', () => {
  it('should return 200 with text/csv content-type and header row', async () => {
    mockCustomer.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/customers/export?format=csv')
      .set('Authorization', staffAuth());

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="customers-/);
    expect(res.text).toBe('name,phone,email,address,tags,createdAt');
  });

  it('should default format to csv when omitted', async () => {
    mockCustomer.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/customers/export')
      .set('Authorization', staffAuth());

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/csv/);
  });

  it('should include customer rows with tags flattened as pipe-separated names', async () => {
    mockCustomer.findMany.mockResolvedValue([
      {
        ...fakeCustomer,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        tags: [
          { id: 'tag_vip', name: 'VIP', color: '#FFD700' },
          { id: 'tag_reg', name: 'Regular', color: '#1E90FF' },
        ],
      },
    ]);

    const res = await request(app)
      .get('/api/customers/export?format=csv')
      .set('Authorization', staffAuth());

    expect(res.status).toBe(200);
    const lines = res.text.split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('name,phone,email,address,tags,createdAt');
    // Phone is prefixed with `'` by the formula-injection guard — `+`
    // is a leading formula char in Excel/Sheets.
    expect(lines[1]).toBe(
      "John Doe,'+1234567890,john@example.com,123 Main St,VIP|Regular,2026-01-01T00:00:00.000Z",
    );
  });

  it('should honour the same filters as the list endpoint', async () => {
    mockCustomer.findMany.mockResolvedValue([]);

    await request(app)
      .get('/api/customers/export?storeId=str_abc123&search=alice&tags=vip')
      .set('Authorization', staffAuth());

    const call = mockCustomer.findMany.mock.calls[0][0];
    expect(call.where).toEqual({
      AND: [
        { deletedAt: null },
        { storeId: 'str_abc123' },
        {
          OR: [
            { name: { contains: 'alice', mode: 'insensitive' } },
            { phone: { contains: 'alice', mode: 'insensitive' } },
            { email: { contains: 'alice', mode: 'insensitive' } },
          ],
        },
        { tags: { some: { name: { in: ['vip'] } } } },
      ],
    });
    // The service must cap exports at 10,000 rows — verify the take.
    expect(call.take).toBe(10_000);
  });

  it('should escape commas and quotes in exported fields', async () => {
    mockCustomer.findMany.mockResolvedValue([
      {
        ...fakeCustomer,
        name: 'Smith, Jo "Jojo"',
        address: '1 Main, Apt 2',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        tags: [],
      },
    ]);

    const res = await request(app)
      .get('/api/customers/export')
      .set('Authorization', staffAuth());

    const lines = res.text.split('\r\n');
    expect(lines[1]).toContain('"Smith, Jo ""Jojo"""');
    expect(lines[1]).toContain('"1 Main, Apt 2"');
  });

  it('should NOT allow GET /api/customers/export to be matched by GET /:id', async () => {
    // Regression: when route ordering is wrong, Express treats "export"
    // as an :id param and calls getCustomerById which throws 404.
    mockCustomer.findMany.mockResolvedValue([]);
    mockCustomer.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/customers/export')
      .set('Authorization', staffAuth());
    expect(res.status).toBe(200);
    expect(mockCustomer.findFirst).not.toHaveBeenCalled();
  });

  it('should return 400 for invalid format', async () => {
    const res = await request(app)
      .get('/api/customers/export?format=xlsx')
      .set('Authorization', staffAuth());

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should require authentication', async () => {
    const res = await request(app).get('/api/customers/export');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it.each([
    ['ADMIN', adminAuth],
    ['MANAGER', managerAuth],
    ['STAFF', staffAuth],
  ])('allows %s to export (customers:read permission)', async (role, makeAuth) => {
    mockUser.findUnique.mockResolvedValue({
      id: defaultTestUser.id,
      email: defaultTestUser.email,
      role,
      storeId: defaultTestUser.storeId,
    });
    mockCustomer.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/customers/export')
      .set('Authorization', makeAuth());
    expect(res.status).toBe(200);
  });
});

// ── GET /api/customers/:id ────────────────────────────
describe('GET /api/customers/:id', () => {
  it('should return a customer with tags:[]', async () => {
    mockCustomer.findFirst.mockResolvedValue(fakeCustomer);

    const res = await request(app)
      .get('/api/customers/cus_abc123')
      .set('Authorization', staffAuth());

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('cus_abc123');
    expect(res.body.data.tags).toEqual([]);
    expect(res.body.data).not.toHaveProperty('deletedAt');
  });

  it('should return 404 when customer not found', async () => {
    mockCustomer.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/customers/nonexistent')
      .set('Authorization', staffAuth());

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.message).toContain('nonexistent');
  });
});

// ── PUT /api/customers/:id ────────────────────────────
describe('PUT /api/customers/:id', () => {
  it('should update a customer and return tags:[]', async () => {
    mockCustomer.findFirst.mockResolvedValue(fakeCustomer);
    mockCustomer.update.mockResolvedValue({ ...fakeCustomer, name: 'Jane Doe' });

    const res = await request(app)
      .put('/api/customers/cus_abc123')
      .set('Authorization', staffAuth())
      .send({ name: 'Jane Doe' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Jane Doe');
    expect(res.body.data.tags).toEqual([]);
    expect(res.body.warnings).toEqual([]);
  });

  it('should return 404 when updating non-existent customer', async () => {
    mockCustomer.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .put('/api/customers/nonexistent')
      .set('Authorization', staffAuth())
      .send({ name: 'Jane Doe' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('should return 400 for invalid email on update', async () => {
    const res = await request(app)
      .put('/api/customers/cus_abc123')
      .set('Authorization', staffAuth())
      .send({ email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should allow clearing nullable fields with null', async () => {
    mockCustomer.findFirst.mockResolvedValue(fakeCustomer);
    mockCustomer.update.mockResolvedValue({ ...fakeCustomer, phone: null });

    const res = await request(app)
      .put('/api/customers/cus_abc123')
      .set('Authorization', staffAuth())
      .send({ phone: null });

    expect(res.status).toBe(200);
    expect(res.body.data.phone).toBeNull();
  });

  it('should return warnings when updated phone collides with another customer', async () => {
    mockCustomer.findFirst
      .mockResolvedValueOnce(fakeCustomer) // existence
      .mockResolvedValueOnce({ id: 'other_cus' }); // phone collision
    mockCustomer.update.mockResolvedValue({ ...fakeCustomer, phone: '+9999999999' });

    const res = await request(app)
      .put('/api/customers/cus_abc123')
      .set('Authorization', staffAuth())
      .send({ phone: '+9999999999' });

    expect(res.status).toBe(200);
    expect(res.body.warnings).toHaveLength(1);
    expect(res.body.warnings[0].field).toBe('phone');
  });
});

// ── DELETE /api/customers/:id ─────────────────────────
describe('DELETE /api/customers/:id', () => {
  it('should soft-delete and return 204', async () => {
    mockCustomer.findFirst.mockResolvedValue(fakeCustomer);
    mockCustomer.update.mockResolvedValue({ ...fakeCustomer, deletedAt: new Date() });

    const res = await request(app)
      .delete('/api/customers/cus_abc123')
      .set('Authorization', staffAuth());

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
    expect(mockCustomer.update).toHaveBeenCalledWith({
      where: { id: 'cus_abc123' },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('should return 404 when deleting non-existent customer', async () => {
    mockCustomer.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .delete('/api/customers/nonexistent')
      .set('Authorization', staffAuth());

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

// ── Error handling ────────────────────────────────────
describe('Error handling', () => {
  it('should return 500 for unexpected errors', async () => {
    mockCustomer.count.mockRejectedValue(new Error('DB connection failed'));

    const res = await request(app)
      .get('/api/customers')
      .set('Authorization', staffAuth());

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
  });

  it('should return consistent error format', async () => {
    mockCustomer.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/customers/nonexistent')
      .set('Authorization', staffAuth());

    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toHaveProperty('code');
    expect(res.body.error).toHaveProperty('message');
  });
});

// ── Authentication & Authorization ───────────────────────
describe('Auth — customer routes', () => {
  it('returns 401 without an Authorization header', async () => {
    const res = await request(app).get('/api/customers');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 with a malformed Authorization header', async () => {
    const res = await request(app)
      .get('/api/customers')
      .set('Authorization', 'NotBearer x');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 with an invalid token', async () => {
    const res = await request(app)
      .get('/api/customers')
      .set('Authorization', 'Bearer invalid.token.here');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  // All three roles can read AND write customers — verify each.
  it.each([
    ['ADMIN', adminAuth],
    ['MANAGER', managerAuth],
    ['STAFF', staffAuth],
  ])('GET /api/customers allows %s', async (role, makeAuth) => {
    mockUser.findUnique.mockResolvedValue({
      id: defaultTestUser.id,
      email: defaultTestUser.email,
      role,
      storeId: defaultTestUser.storeId,
    });
    mockCustomer.count.mockResolvedValue(0);
    mockCustomer.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/customers')
      .set('Authorization', makeAuth());
    expect(res.status).toBe(200);
  });

  it.each([
    ['ADMIN', adminAuth],
    ['MANAGER', managerAuth],
    ['STAFF', staffAuth],
  ])('POST /api/customers allows %s', async (role, makeAuth) => {
    mockUser.findUnique.mockResolvedValue({
      id: defaultTestUser.id,
      email: defaultTestUser.email,
      role,
      storeId: defaultTestUser.storeId,
    });
    mockCustomer.findFirst.mockResolvedValue(null);
    mockCustomer.create.mockResolvedValue(fakeCustomer);

    const res = await request(app)
      .post('/api/customers')
      .set('Authorization', makeAuth())
      .send({ name: 'X', storeId: 'str_abc123' });
    expect(res.status).toBe(201);
  });
});

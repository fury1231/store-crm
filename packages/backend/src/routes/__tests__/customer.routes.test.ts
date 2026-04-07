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

// `storeContext` middleware (M2) calls `prisma.store.findFirst` for ADMIN
// requests that omit the `X-Store-Id` header (to default to the first store).
// Even non-ADMIN tests touch this path indirectly, so the mock must exist.
const mockStore = vi.hoisted(() => ({
  findFirst: vi.fn(),
}));

vi.mock('../../prismaClient', () => ({
  prisma: { customer: mockCustomer, user: mockUser, store: mockStore },
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
  // ADMIN requests with no `X-Store-Id` header default to the first non-deleted
  // store. Tests that switch the role to ADMIN rely on this lookup succeeding.
  mockStore.findFirst.mockResolvedValue({ id: defaultTestUser.storeId });
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

  it('should ignore any storeId sent in the request body (storeId comes from context)', async () => {
    // Defence-in-depth: even if a malicious client tries to inject a foreign
    // store id, the validator must strip it and the service must use the
    // store id from `req.storeId` (resolved by storeContext middleware).
    mockCustomer.findFirst.mockResolvedValue(null);
    mockCustomer.create.mockResolvedValue(fakeCustomer);

    const res = await request(app)
      .post('/api/customers')
      .set('Authorization', staffAuth())
      .send({ name: 'John Doe', storeId: 'str_HIJACKED' });

    expect(res.status).toBe(201);
    // The service was invoked with the user's actual storeId, not the one
    // from the body.
    expect(mockCustomer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ storeId: defaultTestUser.storeId }),
    });
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
    expect(mockCustomer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { name: { contains: 'john', mode: 'insensitive' } },
            { phone: { contains: 'john', mode: 'insensitive' } },
            { email: { contains: 'john', mode: 'insensitive' } },
          ],
        }),
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

  it('should always scope by the user\'s storeId from context (ignores ?storeId query)', async () => {
    // M2: storeId comes from the resolved store context (req.storeId),
    // never from a query parameter — sending one must NOT change the filter.
    mockCustomer.count.mockResolvedValue(0);
    mockCustomer.findMany.mockResolvedValue([]);

    await request(app)
      .get('/api/customers?storeId=str_HIJACKED')
      .set('Authorization', staffAuth());

    expect(mockCustomer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: defaultTestUser.storeId }),
      }),
    );
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
      .send({ name: 'X' });
    expect(res.status).toBe(201);
  });
});

// ── Multi-store isolation (M2 — Issue #12) ───────────────
describe('Multi-store data isolation', () => {
  it('STAFF cannot read a customer from another store (404, not 403)', async () => {
    // STAFF assigned to STORE_A asks for a customer that lives in STORE_B.
    // The service queries with `storeId = STORE_A` so the row is invisible
    // and Prisma returns null → controller raises NotFoundError.
    mockUser.findUnique.mockResolvedValue({
      id: defaultTestUser.id,
      email: defaultTestUser.email,
      role: 'STAFF',
      storeId: 'str_A',
    });
    mockCustomer.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/customers/cus_in_store_B')
      .set('Authorization', staffAuth());

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    // The actual where clause used the staff member's store, not the
    // attacker-controlled URL or any header.
    expect(mockCustomer.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({ storeId: 'str_A' }),
    });
  });

  it('STAFF cannot widen scope by sending an X-Store-Id header (404)', async () => {
    // The header MUST be ignored for non-admin users; if it points elsewhere
    // the request is rejected with 404 (no existence leak).
    mockUser.findUnique.mockResolvedValue({
      id: defaultTestUser.id,
      email: defaultTestUser.email,
      role: 'STAFF',
      storeId: 'str_A',
    });

    const res = await request(app)
      .get('/api/customers')
      .set('Authorization', staffAuth())
      .set('X-Store-Id', 'str_B');

    expect(res.status).toBe(404);
    // listCustomers must never have been reached for the foreign store.
    expect(mockCustomer.findMany).not.toHaveBeenCalled();
  });

  it('STAFF without an assigned store is rejected with 403', async () => {
    mockUser.findUnique.mockResolvedValue({
      id: defaultTestUser.id,
      email: defaultTestUser.email,
      role: 'STAFF',
      storeId: null,
    });

    const res = await request(app)
      .get('/api/customers')
      .set('Authorization', staffAuth());

    expect(res.status).toBe(403);
    expect(mockCustomer.findMany).not.toHaveBeenCalled();
  });

  it('ADMIN can target any store via X-Store-Id header', async () => {
    mockUser.findUnique.mockResolvedValue({
      id: defaultTestUser.id,
      email: defaultTestUser.email,
      role: 'ADMIN',
      storeId: null,
    });
    // The middleware verifies the header points at a real store first.
    mockStore.findFirst.mockResolvedValue({ id: 'str_B' });
    mockCustomer.count.mockResolvedValue(0);
    mockCustomer.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/customers')
      .set('Authorization', adminAuth())
      .set('X-Store-Id', 'str_B');

    expect(res.status).toBe(200);
    expect(mockCustomer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: 'str_B' }),
      }),
    );
  });

  it('ADMIN with no header defaults to the first non-deleted store', async () => {
    mockUser.findUnique.mockResolvedValue({
      id: defaultTestUser.id,
      email: defaultTestUser.email,
      role: 'ADMIN',
      storeId: null,
    });
    mockStore.findFirst.mockResolvedValue({ id: 'str_DEFAULT' });
    mockCustomer.count.mockResolvedValue(0);
    mockCustomer.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/customers')
      .set('Authorization', adminAuth());

    expect(res.status).toBe(200);
    expect(mockCustomer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: 'str_DEFAULT' }),
      }),
    );
  });

  it('ADMIN with an unknown X-Store-Id is rejected with 404', async () => {
    mockUser.findUnique.mockResolvedValue({
      id: defaultTestUser.id,
      email: defaultTestUser.email,
      role: 'ADMIN',
      storeId: null,
    });
    mockStore.findFirst.mockResolvedValue(null); // header points at nothing

    const res = await request(app)
      .get('/api/customers')
      .set('Authorization', adminAuth())
      .set('X-Store-Id', 'str_GHOST');

    expect(res.status).toBe(404);
    expect(mockCustomer.findMany).not.toHaveBeenCalled();
  });
});

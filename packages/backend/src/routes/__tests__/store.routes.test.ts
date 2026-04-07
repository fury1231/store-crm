import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';

// ── Mock Prisma (vi.hoisted so mock is available at hoist time) ──
const mockStore = vi.hoisted(() => ({
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
  prisma: { store: mockStore, user: mockUser },
}));

// Import app + auth helpers after mock setup
import { app } from '../../app';
import {
  TEST_JWT_SECRET,
  authHeader,
  defaultTestUser,
} from '../../testHelpers/auth';

// ── Fixtures ───────────────────────────────────────────
const fakeStore = {
  id: 'cls_abc123',
  name: 'Test Store',
  address: '123 Main St',
  phone: '+1234567890',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
};

// ADMIN by default — store routes require ADMIN for writes.
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
    role: 'ADMIN',
    storeId: defaultTestUser.storeId,
  });
});

afterEach(() => {
  delete process.env.JWT_SECRET;
});

// ── POST /api/stores ──────────────────────────────────
describe('POST /api/stores', () => {
  it('should create a store and return 201', async () => {
    mockStore.create.mockResolvedValue(fakeStore);

    const res = await request(app)
      .post('/api/stores')
      .set('Authorization', adminAuth())
      .send({ name: 'Test Store', address: '123 Main St', phone: '+1234567890' });

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual(fakeStore);
  });

  it('should return 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/stores')
      .set('Authorization', adminAuth())
      .send({ address: '123 Main St' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toBeDefined();
  });

  it('should return 400 for invalid phone format', async () => {
    const res = await request(app)
      .post('/api/stores')
      .set('Authorization', adminAuth())
      .send({ name: 'Store', phone: 'abc' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should create a store with name only', async () => {
    const minimal = { ...fakeStore, address: null, phone: null };
    mockStore.create.mockResolvedValue(minimal);

    const res = await request(app)
      .post('/api/stores')
      .set('Authorization', adminAuth())
      .send({ name: 'Test Store' });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Test Store');
  });

  it('should return 400 when name is empty string', async () => {
    const res = await request(app)
      .post('/api/stores')
      .set('Authorization', adminAuth())
      .send({ name: '' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ── GET /api/stores ───────────────────────────────────
describe('GET /api/stores', () => {
  it('should return paginated stores with meta', async () => {
    mockStore.count.mockResolvedValue(1);
    mockStore.findMany.mockResolvedValue([fakeStore]);

    const res = await request(app).get('/api/stores').set('Authorization', adminAuth());

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([fakeStore]);
    expect(res.body.meta).toEqual({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });
  });

  it('should respect page and limit query params', async () => {
    mockStore.count.mockResolvedValue(50);
    mockStore.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/stores?page=3&limit=10')
      .set('Authorization', adminAuth());

    expect(res.status).toBe(200);
    expect(res.body.meta.page).toBe(3);
    expect(res.body.meta.limit).toBe(10);
    expect(res.body.meta.total).toBe(50);
    expect(res.body.meta.totalPages).toBe(5);
  });

  it('should return 400 for invalid pagination params', async () => {
    const res = await request(app)
      .get('/api/stores?page=-1')
      .set('Authorization', adminAuth());

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return empty array when no stores exist', async () => {
    mockStore.count.mockResolvedValue(0);
    mockStore.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/stores').set('Authorization', adminAuth());

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.total).toBe(0);
  });
});

// ── GET /api/stores/:id ───────────────────────────────
describe('GET /api/stores/:id', () => {
  it('should return a store by id', async () => {
    mockStore.findFirst.mockResolvedValue(fakeStore);

    const res = await request(app)
      .get('/api/stores/cls_abc123')
      .set('Authorization', adminAuth());

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(fakeStore);
  });

  it('should return 404 when store not found', async () => {
    mockStore.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/stores/nonexistent')
      .set('Authorization', adminAuth());

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.message).toContain('nonexistent');
  });
});

// ── PUT /api/stores/:id ───────────────────────────────
describe('PUT /api/stores/:id', () => {
  it('should update a store', async () => {
    const updated = { ...fakeStore, name: 'Updated' };
    mockStore.findFirst.mockResolvedValue(fakeStore);
    mockStore.update.mockResolvedValue(updated);

    const res = await request(app)
      .put('/api/stores/cls_abc123')
      .set('Authorization', adminAuth())
      .send({ name: 'Updated' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Updated');
  });

  it('should return 404 when updating non-existent store', async () => {
    mockStore.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .put('/api/stores/nonexistent')
      .set('Authorization', adminAuth())
      .send({ name: 'Updated' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('should return 400 for invalid phone on update', async () => {
    const res = await request(app)
      .put('/api/stores/cls_abc123')
      .set('Authorization', adminAuth())
      .send({ phone: 'not-a-phone' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should allow clearing nullable fields with null', async () => {
    const cleared = { ...fakeStore, phone: null };
    mockStore.findFirst.mockResolvedValue(fakeStore);
    mockStore.update.mockResolvedValue(cleared);

    const res = await request(app)
      .put('/api/stores/cls_abc123')
      .set('Authorization', adminAuth())
      .send({ phone: null });

    expect(res.status).toBe(200);
    expect(res.body.data.phone).toBeNull();
  });
});

// ── DELETE /api/stores/:id ────────────────────────────
describe('DELETE /api/stores/:id', () => {
  it('should soft-delete a store and return 204', async () => {
    mockStore.findFirst.mockResolvedValue(fakeStore);
    mockStore.update.mockResolvedValue({ ...fakeStore, deletedAt: new Date() });

    const res = await request(app)
      .delete('/api/stores/cls_abc123')
      .set('Authorization', adminAuth());

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
  });

  it('should return 404 when deleting non-existent store', async () => {
    mockStore.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .delete('/api/stores/nonexistent')
      .set('Authorization', adminAuth());

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

// ── Error handling ────────────────────────────────────
describe('Error handling', () => {
  it('should return 500 for unexpected errors', async () => {
    mockStore.count.mockRejectedValue(new Error('DB connection failed'));

    const res = await request(app).get('/api/stores').set('Authorization', adminAuth());

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(res.body.error.message).toBe('An unexpected error occurred');
  });

  it('should return consistent error format', async () => {
    mockStore.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/stores/nonexistent')
      .set('Authorization', adminAuth());

    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toHaveProperty('code');
    expect(res.body.error).toHaveProperty('message');
  });
});

// ── Authentication & Authorization ───────────────────────
describe('Auth — store routes', () => {
  it('returns 401 without an Authorization header', async () => {
    const res = await request(app).get('/api/stores');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 with a malformed Authorization header', async () => {
    const res = await request(app).get('/api/stores').set('Authorization', 'NotBearer x');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 with an invalid token', async () => {
    const res = await request(app)
      .get('/api/stores')
      .set('Authorization', 'Bearer invalid.token.here');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when authenticated user no longer exists', async () => {
    mockUser.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/stores').set('Authorization', staffAuth());
    expect(res.status).toBe(401);
  });

  // Read access — every role should pass
  it.each([
    ['ADMIN', adminAuth],
    ['MANAGER', managerAuth],
    ['STAFF', staffAuth],
  ])('GET /api/stores allows %s', async (role, makeAuth) => {
    mockUser.findUnique.mockResolvedValue({
      id: defaultTestUser.id,
      email: defaultTestUser.email,
      role,
      storeId: defaultTestUser.storeId,
    });
    mockStore.count.mockResolvedValue(0);
    mockStore.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/stores').set('Authorization', makeAuth());
    expect(res.status).toBe(200);
  });

  // Write access — only ADMIN should pass
  it.each([
    ['MANAGER', managerAuth, 403],
    ['STAFF', staffAuth, 403],
  ])('POST /api/stores forbids %s with 403', async (role, makeAuth, status) => {
    mockUser.findUnique.mockResolvedValue({
      id: defaultTestUser.id,
      email: defaultTestUser.email,
      role,
      storeId: defaultTestUser.storeId,
    });

    const res = await request(app)
      .post('/api/stores')
      .set('Authorization', makeAuth())
      .send({ name: 'Test Store' });

    expect(res.status).toBe(status);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(mockStore.create).not.toHaveBeenCalled();
  });

  it('PUT /api/stores/:id forbids STAFF with 403', async () => {
    mockUser.findUnique.mockResolvedValue({
      id: defaultTestUser.id,
      email: defaultTestUser.email,
      role: 'STAFF',
      storeId: defaultTestUser.storeId,
    });

    const res = await request(app)
      .put('/api/stores/cls_abc123')
      .set('Authorization', staffAuth())
      .send({ name: 'X' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(mockStore.update).not.toHaveBeenCalled();
  });

  it('DELETE /api/stores/:id forbids MANAGER with 403', async () => {
    mockUser.findUnique.mockResolvedValue({
      id: defaultTestUser.id,
      email: defaultTestUser.email,
      role: 'MANAGER',
      storeId: defaultTestUser.storeId,
    });

    const res = await request(app)
      .delete('/api/stores/cls_abc123')
      .set('Authorization', managerAuth());

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

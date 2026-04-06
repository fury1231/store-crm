import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// ── Mock Prisma (vi.hoisted so mock is available at hoist time) ──
const mockStore = vi.hoisted(() => ({
  create: vi.fn(),
  findMany: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  count: vi.fn(),
}));

vi.mock('../../prismaClient', () => ({
  prisma: { store: mockStore },
}));

// Import app after mock setup
import { app } from '../../app';

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

beforeEach(() => {
  vi.clearAllMocks();
});

// ── POST /api/stores ──────────────────────────────────
describe('POST /api/stores', () => {
  it('should create a store and return 201', async () => {
    mockStore.create.mockResolvedValue(fakeStore);

    const res = await request(app)
      .post('/api/stores')
      .send({ name: 'Test Store', address: '123 Main St', phone: '+1234567890' });

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual(fakeStore);
  });

  it('should return 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/stores')
      .send({ address: '123 Main St' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toBeDefined();
  });

  it('should return 400 for invalid phone format', async () => {
    const res = await request(app)
      .post('/api/stores')
      .send({ name: 'Store', phone: 'abc' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should create a store with name only', async () => {
    const minimal = { ...fakeStore, address: null, phone: null };
    mockStore.create.mockResolvedValue(minimal);

    const res = await request(app)
      .post('/api/stores')
      .send({ name: 'Test Store' });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Test Store');
  });

  it('should return 400 when name is empty string', async () => {
    const res = await request(app)
      .post('/api/stores')
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

    const res = await request(app).get('/api/stores');

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

    const res = await request(app).get('/api/stores?page=3&limit=10');

    expect(res.status).toBe(200);
    expect(res.body.meta.page).toBe(3);
    expect(res.body.meta.limit).toBe(10);
    expect(res.body.meta.total).toBe(50);
    expect(res.body.meta.totalPages).toBe(5);
  });

  it('should return 400 for invalid pagination params', async () => {
    const res = await request(app).get('/api/stores?page=-1');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return empty array when no stores exist', async () => {
    mockStore.count.mockResolvedValue(0);
    mockStore.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/stores');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.total).toBe(0);
  });
});

// ── GET /api/stores/:id ───────────────────────────────
describe('GET /api/stores/:id', () => {
  it('should return a store by id', async () => {
    mockStore.findFirst.mockResolvedValue(fakeStore);

    const res = await request(app).get('/api/stores/cls_abc123');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(fakeStore);
  });

  it('should return 404 when store not found', async () => {
    mockStore.findFirst.mockResolvedValue(null);

    const res = await request(app).get('/api/stores/nonexistent');

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
      .send({ name: 'Updated' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Updated');
  });

  it('should return 404 when updating non-existent store', async () => {
    mockStore.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .put('/api/stores/nonexistent')
      .send({ name: 'Updated' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('should return 400 for invalid phone on update', async () => {
    const res = await request(app)
      .put('/api/stores/cls_abc123')
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

    const res = await request(app).delete('/api/stores/cls_abc123');

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
  });

  it('should return 404 when deleting non-existent store', async () => {
    mockStore.findFirst.mockResolvedValue(null);

    const res = await request(app).delete('/api/stores/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

// ── Error handling ────────────────────────────────────
describe('Error handling', () => {
  it('should return 500 for unexpected errors', async () => {
    mockStore.count.mockRejectedValue(new Error('DB connection failed'));

    const res = await request(app).get('/api/stores');

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(res.body.error.message).toBe('An unexpected error occurred');
  });

  it('should return consistent error format', async () => {
    mockStore.findFirst.mockResolvedValue(null);

    const res = await request(app).get('/api/stores/nonexistent');

    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toHaveProperty('code');
    expect(res.body.error).toHaveProperty('message');
  });
});

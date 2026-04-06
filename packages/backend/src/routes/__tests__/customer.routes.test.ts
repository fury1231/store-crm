import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// ── Mock Prisma (vi.hoisted so mock is available at hoist time) ──
const mockCustomer = vi.hoisted(() => ({
  create: vi.fn(),
  findMany: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  count: vi.fn(),
}));

vi.mock('../../prismaClient', () => ({
  prisma: { customer: mockCustomer },
}));

// Import app after mock setup
import { app } from '../../app';

// ── Fixtures ───────────────────────────────────────────
const fakeCustomer = {
  id: 'cust_abc123',
  name: 'John Doe',
  phone: '+1234567890',
  email: 'john@example.com',
  address: '456 Oak Ave',
  notes: 'VIP customer',
  storeId: 'store_xyz',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ── POST /api/customers ──────────────────────────────
describe('POST /api/customers', () => {
  it('should create a customer and return 201', async () => {
    mockCustomer.findFirst.mockResolvedValue(null); // no duplicates
    mockCustomer.create.mockResolvedValue(fakeCustomer);

    const res = await request(app)
      .post('/api/customers')
      .send({
        name: 'John Doe',
        phone: '+1234567890',
        email: 'john@example.com',
        address: '456 Oak Ave',
        notes: 'VIP customer',
        storeId: 'store_xyz',
      });

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ ...fakeCustomer, tags: [] });
  });

  it('should return 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/customers')
      .send({ storeId: 'store_xyz' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toBeDefined();
  });

  it('should return 400 when storeId is missing', async () => {
    const res = await request(app)
      .post('/api/customers')
      .send({ name: 'John Doe' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 for invalid email format', async () => {
    const res = await request(app)
      .post('/api/customers')
      .send({ name: 'John', storeId: 'store_xyz', email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 for invalid phone format', async () => {
    const res = await request(app)
      .post('/api/customers')
      .send({ name: 'John', storeId: 'store_xyz', phone: 'abc' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 when name is empty string', async () => {
    const res = await request(app)
      .post('/api/customers')
      .send({ name: '', storeId: 'store_xyz' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should create with name and storeId only', async () => {
    const minimal = { ...fakeCustomer, phone: null, email: null, address: null, notes: null };
    mockCustomer.create.mockResolvedValue(minimal);

    const res = await request(app)
      .post('/api/customers')
      .send({ name: 'John Doe', storeId: 'store_xyz' });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('John Doe');
    expect(res.body.data.tags).toEqual([]);
  });

  it('should include duplicate warnings in response', async () => {
    mockCustomer.findFirst.mockResolvedValue(fakeCustomer); // duplicate found
    mockCustomer.create.mockResolvedValue(fakeCustomer);

    const res = await request(app)
      .post('/api/customers')
      .send({
        name: 'Jane Doe',
        phone: '+1234567890',
        email: 'john@example.com',
        storeId: 'store_xyz',
      });

    expect(res.status).toBe(201);
    expect(res.body.warnings).toBeDefined();
    expect(res.body.warnings.length).toBeGreaterThan(0);
  });

  it('should not include warnings key when no duplicates', async () => {
    mockCustomer.findFirst.mockResolvedValue(null);
    mockCustomer.create.mockResolvedValue(fakeCustomer);

    const res = await request(app)
      .post('/api/customers')
      .send({ name: 'John Doe', storeId: 'store_xyz' });

    expect(res.status).toBe(201);
    expect(res.body.warnings).toBeUndefined();
  });
});

// ── GET /api/customers ───────────────────────────────
describe('GET /api/customers', () => {
  it('should return paginated customers with meta', async () => {
    mockCustomer.count.mockResolvedValue(1);
    mockCustomer.findMany.mockResolvedValue([fakeCustomer]);

    const res = await request(app).get('/api/customers');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{ ...fakeCustomer, tags: [] }]);
    expect(res.body.meta).toEqual({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });
  });

  it('should respect page and limit query params', async () => {
    mockCustomer.count.mockResolvedValue(50);
    mockCustomer.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/customers?page=3&limit=10');

    expect(res.status).toBe(200);
    expect(res.body.meta.page).toBe(3);
    expect(res.body.meta.limit).toBe(10);
    expect(res.body.meta.total).toBe(50);
    expect(res.body.meta.totalPages).toBe(5);
  });

  it('should return 400 for invalid pagination params', async () => {
    const res = await request(app).get('/api/customers?page=-1');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return empty array when no customers exist', async () => {
    mockCustomer.count.mockResolvedValue(0);
    mockCustomer.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/customers');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.total).toBe(0);
  });

  it('should search across name, phone, email', async () => {
    mockCustomer.count.mockResolvedValue(1);
    mockCustomer.findMany.mockResolvedValue([fakeCustomer]);

    const res = await request(app).get('/api/customers?search=john');

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

  it('should sort by name ascending', async () => {
    mockCustomer.count.mockResolvedValue(1);
    mockCustomer.findMany.mockResolvedValue([fakeCustomer]);

    const res = await request(app).get('/api/customers?sortBy=name&order=asc');

    expect(res.status).toBe(200);
    expect(mockCustomer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { name: 'asc' },
      }),
    );
  });

  it('should filter by storeId', async () => {
    mockCustomer.count.mockResolvedValue(1);
    mockCustomer.findMany.mockResolvedValue([fakeCustomer]);

    const res = await request(app).get('/api/customers?storeId=store_xyz');

    expect(res.status).toBe(200);
    expect(mockCustomer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: 'store_xyz' }),
      }),
    );
  });

  it('should return 400 for invalid sortBy value', async () => {
    const res = await request(app).get('/api/customers?sortBy=invalid');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ── GET /api/customers/:id ───────────────────────────
describe('GET /api/customers/:id', () => {
  it('should return a customer by id with tags', async () => {
    mockCustomer.findFirst.mockResolvedValue(fakeCustomer);

    const res = await request(app).get('/api/customers/cust_abc123');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ ...fakeCustomer, tags: [] });
  });

  it('should return 404 when customer not found', async () => {
    mockCustomer.findFirst.mockResolvedValue(null);

    const res = await request(app).get('/api/customers/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.message).toContain('nonexistent');
  });
});

// ── PUT /api/customers/:id ───────────────────────────
describe('PUT /api/customers/:id', () => {
  it('should update a customer', async () => {
    const updated = { ...fakeCustomer, name: 'Jane Doe' };
    mockCustomer.findFirst.mockResolvedValue(fakeCustomer);
    mockCustomer.update.mockResolvedValue(updated);

    const res = await request(app)
      .put('/api/customers/cust_abc123')
      .send({ name: 'Jane Doe' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Jane Doe');
    expect(res.body.data.tags).toEqual([]);
  });

  it('should return 404 when updating non-existent customer', async () => {
    mockCustomer.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .put('/api/customers/nonexistent')
      .send({ name: 'Updated' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('should return 400 for invalid phone on update', async () => {
    const res = await request(app)
      .put('/api/customers/cust_abc123')
      .send({ phone: 'not-a-phone' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 for invalid email on update', async () => {
    const res = await request(app)
      .put('/api/customers/cust_abc123')
      .send({ email: 'bad-email' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should allow clearing nullable fields with null', async () => {
    const cleared = { ...fakeCustomer, phone: null, email: null };
    mockCustomer.findFirst.mockResolvedValue(fakeCustomer);
    mockCustomer.update.mockResolvedValue(cleared);

    const res = await request(app)
      .put('/api/customers/cust_abc123')
      .send({ phone: null, email: null });

    expect(res.status).toBe(200);
    expect(res.body.data.phone).toBeNull();
    expect(res.body.data.email).toBeNull();
  });

  it('should include duplicate warnings on update', async () => {
    mockCustomer.findFirst.mockResolvedValueOnce(fakeCustomer); // getById
    mockCustomer.findFirst.mockResolvedValueOnce(fakeCustomer); // duplicate check
    mockCustomer.update.mockResolvedValue(fakeCustomer);

    const res = await request(app)
      .put('/api/customers/cust_abc123')
      .send({ phone: '+1234567890' });

    expect(res.status).toBe(200);
    expect(res.body.warnings).toBeDefined();
  });
});

// ── DELETE /api/customers/:id ────────────────────────
describe('DELETE /api/customers/:id', () => {
  it('should soft-delete a customer and return 204', async () => {
    mockCustomer.findFirst.mockResolvedValue(fakeCustomer);
    mockCustomer.update.mockResolvedValue({ ...fakeCustomer, deletedAt: new Date() });

    const res = await request(app).delete('/api/customers/cust_abc123');

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
  });

  it('should return 404 when deleting non-existent customer', async () => {
    mockCustomer.findFirst.mockResolvedValue(null);

    const res = await request(app).delete('/api/customers/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

// ── Error handling ────────────────────────────────────
describe('Error handling', () => {
  it('should return 500 for unexpected errors', async () => {
    mockCustomer.count.mockRejectedValue(new Error('DB connection failed'));

    const res = await request(app).get('/api/customers');

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(res.body.error.message).toBe('An unexpected error occurred');
  });

  it('should return consistent error format', async () => {
    mockCustomer.findFirst.mockResolvedValue(null);

    const res = await request(app).get('/api/customers/nonexistent');

    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toHaveProperty('code');
    expect(res.body.error).toHaveProperty('message');
  });
});

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

beforeEach(() => {
  vi.clearAllMocks();
});

// ── POST /api/customers ───────────────────────────────
describe('POST /api/customers', () => {
  it('should create a customer and return 201 with tags:[] and empty warnings', async () => {
    mockCustomer.findFirst.mockResolvedValue(null); // no duplicates
    mockCustomer.create.mockResolvedValue(fakeCustomer);

    const res = await request(app).post('/api/customers').send({
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
    const res = await request(app).post('/api/customers').send({
      storeId: 'str_abc123',
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toBeDefined();
  });

  it('should return 400 when storeId is missing', async () => {
    const res = await request(app).post('/api/customers').send({
      name: 'John Doe',
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 for invalid email format', async () => {
    const res = await request(app).post('/api/customers').send({
      name: 'John',
      storeId: 'str_abc123',
      email: 'not-an-email',
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 for invalid phone format', async () => {
    const res = await request(app).post('/api/customers').send({
      name: 'John',
      storeId: 'str_abc123',
      phone: 'abc',
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 when name is empty string', async () => {
    const res = await request(app).post('/api/customers').send({
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

    const res = await request(app).post('/api/customers').send({
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

    const res = await request(app).post('/api/customers').send({
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

    const res = await request(app).get('/api/customers');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].tags).toEqual([]);
    expect(res.body.data[0]).not.toHaveProperty('deletedAt');
    expect(res.body.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
  });

  it('should respect page and limit query params', async () => {
    mockCustomer.count.mockResolvedValue(50);
    mockCustomer.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/customers?page=3&limit=10');

    expect(res.status).toBe(200);
    expect(res.body.meta.page).toBe(3);
    expect(res.body.meta.limit).toBe(10);
    expect(res.body.meta.totalPages).toBe(5);
  });

  it('should apply search query across name, phone, email', async () => {
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

  it('should respect sortBy=name&order=asc', async () => {
    mockCustomer.count.mockResolvedValue(0);
    mockCustomer.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/customers?sortBy=name&order=asc');

    expect(res.status).toBe(200);
    expect(mockCustomer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { name: 'asc' } }),
    );
  });

  it('should default to sortBy=createdAt&order=desc', async () => {
    mockCustomer.count.mockResolvedValue(0);
    mockCustomer.findMany.mockResolvedValue([]);

    await request(app).get('/api/customers');

    expect(mockCustomer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    );
  });

  it('should return 400 for invalid sortBy', async () => {
    const res = await request(app).get('/api/customers?sortBy=password');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 for invalid order', async () => {
    const res = await request(app).get('/api/customers?order=sideways');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 for invalid pagination', async () => {
    const res = await request(app).get('/api/customers?page=-1');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 when limit exceeds max (100)', async () => {
    const res = await request(app).get('/api/customers?limit=200');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return empty data when no customers exist', async () => {
    mockCustomer.count.mockResolvedValue(0);
    mockCustomer.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/customers');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.total).toBe(0);
  });

  it('should filter by storeId when provided', async () => {
    mockCustomer.count.mockResolvedValue(0);
    mockCustomer.findMany.mockResolvedValue([]);

    await request(app).get('/api/customers?storeId=str_abc123');

    expect(mockCustomer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: 'str_abc123' }),
      }),
    );
  });
});

// ── GET /api/customers/:id ────────────────────────────
describe('GET /api/customers/:id', () => {
  it('should return a customer with tags:[]', async () => {
    mockCustomer.findFirst.mockResolvedValue(fakeCustomer);

    const res = await request(app).get('/api/customers/cus_abc123');

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('cus_abc123');
    expect(res.body.data.tags).toEqual([]);
    expect(res.body.data).not.toHaveProperty('deletedAt');
  });

  it('should return 404 when customer not found', async () => {
    mockCustomer.findFirst.mockResolvedValue(null);

    const res = await request(app).get('/api/customers/nonexistent');

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
      .send({ name: 'Jane Doe' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('should return 400 for invalid email on update', async () => {
    const res = await request(app)
      .put('/api/customers/cus_abc123')
      .send({ email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should allow clearing nullable fields with null', async () => {
    mockCustomer.findFirst.mockResolvedValue(fakeCustomer);
    mockCustomer.update.mockResolvedValue({ ...fakeCustomer, phone: null });

    const res = await request(app).put('/api/customers/cus_abc123').send({ phone: null });

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

    const res = await request(app).delete('/api/customers/cus_abc123');

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
    expect(mockCustomer.update).toHaveBeenCalledWith({
      where: { id: 'cus_abc123' },
      data: { deletedAt: expect.any(Date) },
    });
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
  });

  it('should return consistent error format', async () => {
    mockCustomer.findFirst.mockResolvedValue(null);

    const res = await request(app).get('/api/customers/nonexistent');

    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toHaveProperty('code');
    expect(res.body.error).toHaveProperty('message');
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';

// ── Mock Prisma (vi.hoisted so mock is available at hoist time) ──
const mockTag = vi.hoisted(() => ({
  create: vi.fn(),
  findMany: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

const mockCustomer = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
}));

const mockUser = vi.hoisted(() => ({
  findUnique: vi.fn(),
}));

vi.mock('../../prismaClient', () => ({
  prisma: { tag: mockTag, customer: mockCustomer, user: mockUser },
}));

// Import app + auth helpers after mock setup
import { app } from '../../app';
import { TEST_JWT_SECRET, authHeader, defaultTestUser } from '../../testHelpers/auth';

// ── Fixtures ───────────────────────────────────────────
const fakeTag = {
  id: 'tag_vip_1',
  name: 'VIP',
  color: '#FFD700',
  storeId: 'str_abc123',
};

const fakeRegularTag = {
  id: 'tag_reg_1',
  name: 'Regular',
  color: '#1E90FF',
  storeId: 'str_abc123',
};

const adminAuth = () => authHeader({ role: 'ADMIN' });
const managerAuth = () => authHeader({ role: 'MANAGER' });
const staffAuth = () => authHeader({ role: 'STAFF' });

function uniqueViolation(): unknown {
  const err = new Error(
    'Unique constraint failed on the fields: (storeId,name)',
  ) as Error & { code: string; meta?: unknown };
  err.code = 'P2002';
  err.meta = { target: ['storeId', 'name'] };
  return err;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  // Default to MANAGER so the user can both read AND write tags.
  mockUser.findUnique.mockResolvedValue({
    id: defaultTestUser.id,
    email: defaultTestUser.email,
    role: 'MANAGER',
    storeId: defaultTestUser.storeId,
  });
});

afterEach(() => {
  delete process.env.JWT_SECRET;
});

// ── POST /api/tags ────────────────────────────────────
describe('POST /api/tags', () => {
  it('should create a tag and return 201', async () => {
    mockTag.create.mockResolvedValue(fakeTag);

    const res = await request(app)
      .post('/api/tags')
      .set('Authorization', managerAuth())
      .send({ name: 'VIP', color: '#FFD700', storeId: 'str_abc123' });

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual(fakeTag);
  });

  it('should return 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/tags')
      .set('Authorization', managerAuth())
      .send({ color: '#FFD700', storeId: 'str_abc123' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 when name is empty string', async () => {
    const res = await request(app)
      .post('/api/tags')
      .set('Authorization', managerAuth())
      .send({ name: '', color: '#FFD700', storeId: 'str_abc123' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 when name exceeds 50 characters', async () => {
    const res = await request(app)
      .post('/api/tags')
      .set('Authorization', managerAuth())
      .send({ name: 'x'.repeat(51), color: '#FFD700', storeId: 'str_abc123' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 for malformed hex color (no #)', async () => {
    const res = await request(app)
      .post('/api/tags')
      .set('Authorization', managerAuth())
      .send({ name: 'VIP', color: 'FFD700', storeId: 'str_abc123' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 for shorthand 3-char hex color', async () => {
    const res = await request(app)
      .post('/api/tags')
      .set('Authorization', managerAuth())
      .send({ name: 'VIP', color: '#FFF', storeId: 'str_abc123' });

    expect(res.status).toBe(400);
  });

  it('should return 400 for non-hex characters', async () => {
    const res = await request(app)
      .post('/api/tags')
      .set('Authorization', managerAuth())
      .send({ name: 'VIP', color: '#GGGGGG', storeId: 'str_abc123' });

    expect(res.status).toBe(400);
  });

  it('should return 409 when tag name already exists in the store', async () => {
    mockTag.create.mockRejectedValue(uniqueViolation());

    const res = await request(app)
      .post('/api/tags')
      .set('Authorization', managerAuth())
      .send({ name: 'VIP', color: '#FFD700', storeId: 'str_abc123' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.message).toMatch(/already exists/);
  });

  it('should return 403 when STAFF tries to create a tag', async () => {
    mockUser.findUnique.mockResolvedValue({
      id: defaultTestUser.id,
      email: defaultTestUser.email,
      role: 'STAFF',
      storeId: defaultTestUser.storeId,
    });

    const res = await request(app)
      .post('/api/tags')
      .set('Authorization', staffAuth())
      .send({ name: 'VIP', color: '#FFD700', storeId: 'str_abc123' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

// ── GET /api/tags ─────────────────────────────────────
describe('GET /api/tags', () => {
  it('should return all tags for the requested store', async () => {
    mockTag.findMany.mockResolvedValue([fakeRegularTag, fakeTag]);

    const res = await request(app)
      .get('/api/tags?storeId=str_abc123')
      .set('Authorization', managerAuth());

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(mockTag.findMany).toHaveBeenCalledWith({
      where: { storeId: 'str_abc123' },
      orderBy: { name: 'asc' },
    });
  });

  it('should return 400 when storeId query param is missing', async () => {
    const res = await request(app)
      .get('/api/tags')
      .set('Authorization', managerAuth());

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return empty array when store has no tags', async () => {
    mockTag.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/tags?storeId=str_empty')
      .set('Authorization', managerAuth());

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('should allow STAFF to read tags', async () => {
    mockUser.findUnique.mockResolvedValue({
      id: defaultTestUser.id,
      email: defaultTestUser.email,
      role: 'STAFF',
      storeId: defaultTestUser.storeId,
    });
    mockTag.findMany.mockResolvedValue([fakeTag]);

    const res = await request(app)
      .get('/api/tags?storeId=str_abc123')
      .set('Authorization', staffAuth());

    expect(res.status).toBe(200);
  });
});

// ── PUT /api/tags/:id ─────────────────────────────────
describe('PUT /api/tags/:id', () => {
  it('should update tag name', async () => {
    mockTag.findUnique.mockResolvedValue(fakeTag);
    mockTag.update.mockResolvedValue({ ...fakeTag, name: 'VIP+' });

    const res = await request(app)
      .put('/api/tags/tag_vip_1')
      .set('Authorization', managerAuth())
      .send({ name: 'VIP+' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('VIP+');
  });

  it('should update tag color', async () => {
    mockTag.findUnique.mockResolvedValue(fakeTag);
    mockTag.update.mockResolvedValue({ ...fakeTag, color: '#000000' });

    const res = await request(app)
      .put('/api/tags/tag_vip_1')
      .set('Authorization', managerAuth())
      .send({ color: '#000000' });

    expect(res.status).toBe(200);
    expect(res.body.data.color).toBe('#000000');
  });

  it('should return 404 when updating non-existent tag', async () => {
    mockTag.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .put('/api/tags/nonexistent')
      .set('Authorization', managerAuth())
      .send({ name: 'X' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('should return 400 when body is empty (neither name nor color)', async () => {
    const res = await request(app)
      .put('/api/tags/tag_vip_1')
      .set('Authorization', managerAuth())
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 for invalid hex color on update', async () => {
    const res = await request(app)
      .put('/api/tags/tag_vip_1')
      .set('Authorization', managerAuth())
      .send({ color: 'red' });

    expect(res.status).toBe(400);
  });

  it('should return 409 when renaming to an existing tag name', async () => {
    mockTag.findUnique.mockResolvedValue(fakeTag);
    mockTag.update.mockRejectedValue(uniqueViolation());

    const res = await request(app)
      .put('/api/tags/tag_vip_1')
      .set('Authorization', managerAuth())
      .send({ name: 'Regular' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('should return 403 when STAFF tries to update', async () => {
    mockUser.findUnique.mockResolvedValue({
      id: defaultTestUser.id,
      email: defaultTestUser.email,
      role: 'STAFF',
      storeId: defaultTestUser.storeId,
    });

    const res = await request(app)
      .put('/api/tags/tag_vip_1')
      .set('Authorization', staffAuth())
      .send({ name: 'VIP+' });

    expect(res.status).toBe(403);
  });
});

// ── DELETE /api/tags/:id ──────────────────────────────
describe('DELETE /api/tags/:id', () => {
  it('should delete a tag and return 204', async () => {
    mockTag.findUnique.mockResolvedValue(fakeTag);
    mockTag.delete.mockResolvedValue(fakeTag);

    const res = await request(app)
      .delete('/api/tags/tag_vip_1')
      .set('Authorization', managerAuth());

    expect(res.status).toBe(204);
    expect(mockTag.delete).toHaveBeenCalledWith({ where: { id: 'tag_vip_1' } });
  });

  it('should return 404 when deleting a non-existent tag', async () => {
    mockTag.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .delete('/api/tags/nonexistent')
      .set('Authorization', managerAuth());

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('should return 403 when STAFF tries to delete', async () => {
    mockUser.findUnique.mockResolvedValue({
      id: defaultTestUser.id,
      email: defaultTestUser.email,
      role: 'STAFF',
      storeId: defaultTestUser.storeId,
    });

    const res = await request(app)
      .delete('/api/tags/tag_vip_1')
      .set('Authorization', staffAuth());

    expect(res.status).toBe(403);
  });
});

// ── Auth — tag routes ─────────────────────────────────
describe('Auth — tag routes', () => {
  it('returns 401 without an Authorization header', async () => {
    const res = await request(app).get('/api/tags?storeId=str_abc123');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 with an invalid token', async () => {
    const res = await request(app)
      .get('/api/tags?storeId=str_abc123')
      .set('Authorization', 'Bearer invalid.token.here');
    expect(res.status).toBe(401);
  });

  it.each([
    ['ADMIN', adminAuth],
    ['MANAGER', managerAuth],
  ])('POST /api/tags allows %s', async (role, makeAuth) => {
    mockUser.findUnique.mockResolvedValue({
      id: defaultTestUser.id,
      email: defaultTestUser.email,
      role,
      storeId: defaultTestUser.storeId,
    });
    mockTag.create.mockResolvedValue(fakeTag);

    const res = await request(app)
      .post('/api/tags')
      .set('Authorization', makeAuth())
      .send({ name: 'VIP', color: '#FFD700', storeId: 'str_abc123' });

    expect(res.status).toBe(201);
  });
});

// ── POST /api/customers/:id/tags ──────────────────────
describe('POST /api/customers/:id/tags', () => {
  it('should assign tags to a customer and return populated tags', async () => {
    mockCustomer.findFirst.mockResolvedValue({
      id: 'cus_abc123',
      storeId: 'str_abc123',
    });
    mockTag.findMany.mockResolvedValue([{ id: 'tag_vip_1' }, { id: 'tag_reg_1' }]);
    mockCustomer.update.mockResolvedValue({
      tags: [
        { id: 'tag_vip_1', name: 'VIP', color: '#FFD700' },
        { id: 'tag_reg_1', name: 'Regular', color: '#1E90FF' },
      ],
    });

    const res = await request(app)
      .post('/api/customers/cus_abc123/tags')
      .set('Authorization', staffAuth())
      .send({ tagIds: ['tag_vip_1', 'tag_reg_1'] });

    expect(res.status).toBe(200);
    expect(res.body.data.tags).toHaveLength(2);
  });

  it('should allow STAFF to assign tags (tags:assign permission)', async () => {
    mockUser.findUnique.mockResolvedValue({
      id: defaultTestUser.id,
      email: defaultTestUser.email,
      role: 'STAFF',
      storeId: defaultTestUser.storeId,
    });
    mockCustomer.findFirst.mockResolvedValue({
      id: 'cus_abc123',
      storeId: 'str_abc123',
    });
    mockTag.findMany.mockResolvedValue([{ id: 'tag_vip_1' }]);
    mockCustomer.update.mockResolvedValue({
      tags: [{ id: 'tag_vip_1', name: 'VIP', color: '#FFD700' }],
    });

    const res = await request(app)
      .post('/api/customers/cus_abc123/tags')
      .set('Authorization', staffAuth())
      .send({ tagIds: ['tag_vip_1'] });

    expect(res.status).toBe(200);
  });

  it('should return 400 when tagIds is empty', async () => {
    const res = await request(app)
      .post('/api/customers/cus_abc123/tags')
      .set('Authorization', staffAuth())
      .send({ tagIds: [] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 when tagIds is missing', async () => {
    const res = await request(app)
      .post('/api/customers/cus_abc123/tags')
      .set('Authorization', staffAuth())
      .send({});

    expect(res.status).toBe(400);
  });

  it('should return 404 when customer does not exist', async () => {
    mockCustomer.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/customers/nonexistent/tags')
      .set('Authorization', staffAuth())
      .send({ tagIds: ['tag_vip_1'] });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('should return 400 when a tagId belongs to a different store', async () => {
    mockCustomer.findFirst.mockResolvedValue({
      id: 'cus_abc123',
      storeId: 'str_abc123',
    });
    mockTag.findMany.mockResolvedValue([{ id: 'tag_vip_1' }]); // missing tag_other_store

    const res = await request(app)
      .post('/api/customers/cus_abc123/tags')
      .set('Authorization', staffAuth())
      .send({ tagIds: ['tag_vip_1', 'tag_other_store'] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toMatch(/tag_other_store/);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post('/api/customers/cus_abc123/tags')
      .send({ tagIds: ['tag_vip_1'] });
    expect(res.status).toBe(401);
  });
});

// ── DELETE /api/customers/:id/tags/:tagId ─────────────
describe('DELETE /api/customers/:id/tags/:tagId', () => {
  it('should remove a tag and return remaining tags', async () => {
    mockCustomer.findFirst.mockResolvedValue({
      id: 'cus_abc123',
      storeId: 'str_abc123',
    });
    mockCustomer.update.mockResolvedValue({
      tags: [{ id: 'tag_reg_1', name: 'Regular', color: '#1E90FF' }],
    });

    const res = await request(app)
      .delete('/api/customers/cus_abc123/tags/tag_vip_1')
      .set('Authorization', staffAuth());

    expect(res.status).toBe(200);
    expect(res.body.data.tags).toHaveLength(1);
    expect(mockCustomer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cus_abc123' },
        data: { tags: { disconnect: { id: 'tag_vip_1' } } },
      }),
    );
  });

  it('should return 404 when customer does not exist', async () => {
    mockCustomer.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .delete('/api/customers/nonexistent/tags/tag_vip_1')
      .set('Authorization', staffAuth());

    expect(res.status).toBe(404);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).delete(
      '/api/customers/cus_abc123/tags/tag_vip_1',
    );
    expect(res.status).toBe(401);
  });
});

// ── GET /api/customers/:id (now with populated tags) ──
describe('GET /api/customers/:id with populated tags', () => {
  it('should include tags array in the customer response', async () => {
    mockCustomer.findFirst.mockResolvedValue({
      id: 'cus_abc123',
      name: 'John',
      phone: null,
      email: null,
      address: null,
      notes: null,
      storeId: 'str_abc123',
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      deletedAt: null,
      tags: [
        { id: 'tag_vip_1', name: 'VIP', color: '#FFD700' },
        { id: 'tag_reg_1', name: 'Regular', color: '#1E90FF' },
      ],
    });

    const res = await request(app)
      .get('/api/customers/cus_abc123')
      .set('Authorization', staffAuth());

    expect(res.status).toBe(200);
    expect(res.body.data.tags).toHaveLength(2);
    expect(res.body.data.tags[0]).toEqual({
      id: 'tag_vip_1',
      name: 'VIP',
      color: '#FFD700',
    });
    // Verify the service called Prisma with the include clause.
    expect(mockCustomer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          tags: { select: { id: true, name: true, color: true } },
        },
      }),
    );
  });
});

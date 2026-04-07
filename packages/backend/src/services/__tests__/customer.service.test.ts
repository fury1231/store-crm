import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundError } from '../../utils/errors';

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

// Import after mock setup
import {
  createCustomer,
  listCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
  checkDuplicates,
} from '../customer.service';

// ── Fixtures ───────────────────────────────────────────
const STORE_A = 'str_abc123';
const STORE_B = 'str_other_999';

const fakeCustomer = {
  id: 'cus_abc123',
  name: 'John Doe',
  phone: '+1234567890',
  email: 'john@example.com',
  address: '123 Main St',
  notes: 'VIP customer',
  storeId: STORE_A,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  deletedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ── createCustomer ─────────────────────────────────────
describe('createCustomer', () => {
  it('should create a customer with all fields and return tags:[]', async () => {
    mockCustomer.findFirst.mockResolvedValue(null); // no duplicates
    mockCustomer.create.mockResolvedValue(fakeCustomer);

    const result = await createCustomer(STORE_A, {
      name: 'John Doe',
      phone: '+1234567890',
      email: 'john@example.com',
      address: '123 Main St',
      notes: 'VIP customer',
    });

    expect(mockCustomer.create).toHaveBeenCalledWith({
      data: {
        name: 'John Doe',
        phone: '+1234567890',
        email: 'john@example.com',
        address: '123 Main St',
        notes: 'VIP customer',
        storeId: STORE_A,
      },
    });
    expect(result.customer.name).toBe('John Doe');
    expect(result.customer.tags).toEqual([]);
    expect(result.customer).not.toHaveProperty('deletedAt');
    expect(result.warnings).toEqual([]);
  });

  it('should always inject storeId from context, ignoring any in body data', async () => {
    mockCustomer.findFirst.mockResolvedValue(null);
    mockCustomer.create.mockResolvedValue(fakeCustomer);

    await createCustomer(STORE_A, { name: 'John Doe' });

    // The storeId on the persisted record always comes from the first arg.
    expect(mockCustomer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ storeId: STORE_A }),
    });
  });

  it('should create a minimal customer (name only — storeId from context)', async () => {
    mockCustomer.findFirst.mockResolvedValue(null);
    const minimal = {
      ...fakeCustomer,
      phone: null,
      email: null,
      address: null,
      notes: null,
    };
    mockCustomer.create.mockResolvedValue(minimal);

    const result = await createCustomer(STORE_A, { name: 'John Doe' });

    expect(result.customer.phone).toBeNull();
    expect(result.customer.email).toBeNull();
    expect(result.customer.tags).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('should return duplicate warning when phone exists in same store', async () => {
    mockCustomer.findFirst
      .mockResolvedValueOnce({ id: 'existing_1' }) // phone check
      .mockResolvedValueOnce(null); // email check
    mockCustomer.create.mockResolvedValue(fakeCustomer);

    const result = await createCustomer(STORE_A, {
      name: 'John Doe',
      phone: '+1234567890',
      email: 'john@example.com',
    });

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].field).toBe('phone');
    expect(result.warnings[0].existingCustomerId).toBe('existing_1');
    expect(mockCustomer.create).toHaveBeenCalled();
  });

  it('should return duplicate warning when email exists in same store', async () => {
    mockCustomer.findFirst
      .mockResolvedValueOnce(null) // phone check
      .mockResolvedValueOnce({ id: 'existing_2' }); // email check
    mockCustomer.create.mockResolvedValue(fakeCustomer);

    const result = await createCustomer(STORE_A, {
      name: 'John Doe',
      phone: '+1234567890',
      email: 'john@example.com',
    });

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].field).toBe('email');
    expect(mockCustomer.create).toHaveBeenCalled();
  });

  it('should return both warnings if both phone and email match', async () => {
    mockCustomer.findFirst
      .mockResolvedValueOnce({ id: 'existing_phone' })
      .mockResolvedValueOnce({ id: 'existing_email' });
    mockCustomer.create.mockResolvedValue(fakeCustomer);

    const result = await createCustomer(STORE_A, {
      name: 'John Doe',
      phone: '+1234567890',
      email: 'john@example.com',
    });

    expect(result.warnings).toHaveLength(2);
    expect(result.warnings.map((w) => w.field).sort()).toEqual(['email', 'phone']);
  });
});

// ── listCustomers ──────────────────────────────────────
describe('listCustomers', () => {
  it('should return paginated customers scoped to storeId with meta and tags:[]', async () => {
    mockCustomer.count.mockResolvedValue(25);
    mockCustomer.findMany.mockResolvedValue([fakeCustomer]);

    const result = await listCustomers(STORE_A, {
      page: 2,
      limit: 10,
      sortBy: 'createdAt',
      order: 'desc',
    });

    expect(mockCustomer.count).toHaveBeenCalledWith({
      where: { deletedAt: null, storeId: STORE_A },
    });
    expect(mockCustomer.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null, storeId: STORE_A },
      skip: 10,
      take: 10,
      orderBy: { createdAt: 'desc' },
    });
    expect(result.meta).toEqual({ page: 2, limit: 10, total: 25, totalPages: 3 });
    expect(result.customers).toHaveLength(1);
    expect(result.customers[0].tags).toEqual([]);
  });

  it('should always include storeId in the where clause (no leak across stores)', async () => {
    mockCustomer.count.mockResolvedValue(0);
    mockCustomer.findMany.mockResolvedValue([]);

    await listCustomers(STORE_B, {
      page: 1,
      limit: 20,
      sortBy: 'createdAt',
      order: 'desc',
    });

    expect(mockCustomer.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ storeId: STORE_B }),
    });
    expect(mockCustomer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: STORE_B }),
      }),
    );
  });

  it('should apply search across name, phone, email AND keep storeId filter', async () => {
    mockCustomer.count.mockResolvedValue(1);
    mockCustomer.findMany.mockResolvedValue([fakeCustomer]);

    await listCustomers(STORE_A, {
      page: 1,
      limit: 20,
      search: 'john',
      sortBy: 'createdAt',
      order: 'desc',
    });

    expect(mockCustomer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          storeId: STORE_A,
          OR: [
            { name: { contains: 'john', mode: 'insensitive' } },
            { phone: { contains: 'john', mode: 'insensitive' } },
            { email: { contains: 'john', mode: 'insensitive' } },
          ],
        },
      }),
    );
  });

  it('should respect sortBy=name and order=asc', async () => {
    mockCustomer.count.mockResolvedValue(0);
    mockCustomer.findMany.mockResolvedValue([]);

    await listCustomers(STORE_A, {
      page: 1,
      limit: 20,
      sortBy: 'name',
      order: 'asc',
    });

    expect(mockCustomer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { name: 'asc' } }),
    );
  });

  it('should exclude soft-deleted customers from count and query', async () => {
    mockCustomer.count.mockResolvedValue(0);
    mockCustomer.findMany.mockResolvedValue([]);

    await listCustomers(STORE_A, { page: 1, limit: 20, sortBy: 'createdAt', order: 'desc' });

    expect(mockCustomer.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ deletedAt: null }) }),
    );
    expect(mockCustomer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ deletedAt: null }) }),
    );
  });

  it('should return empty list when no customers match', async () => {
    mockCustomer.count.mockResolvedValue(0);
    mockCustomer.findMany.mockResolvedValue([]);

    const result = await listCustomers(STORE_A, {
      page: 1,
      limit: 20,
      sortBy: 'createdAt',
      order: 'desc',
    });

    expect(result.customers).toEqual([]);
    expect(result.meta.total).toBe(0);
    expect(result.meta.totalPages).toBe(0);
  });
});

// ── getCustomerById ────────────────────────────────────
describe('getCustomerById', () => {
  it('should return a customer with tags:[] when found in scope', async () => {
    mockCustomer.findFirst.mockResolvedValue(fakeCustomer);

    const result = await getCustomerById(STORE_A, 'cus_abc123');

    expect(mockCustomer.findFirst).toHaveBeenCalledWith({
      where: { id: 'cus_abc123', deletedAt: null, storeId: STORE_A },
    });
    expect(result.id).toBe('cus_abc123');
    expect(result.tags).toEqual([]);
    expect(result).not.toHaveProperty('deletedAt');
  });

  it('should throw NotFoundError when customer does not exist', async () => {
    mockCustomer.findFirst.mockResolvedValue(null);

    await expect(getCustomerById(STORE_A, 'nonexistent')).rejects.toThrow(NotFoundError);
    await expect(getCustomerById(STORE_A, 'nonexistent')).rejects.toThrow(
      "Customer with id 'nonexistent' not found",
    );
  });

  it('should throw NotFoundError for a customer in another store (no existence leak)', async () => {
    // Even though the customer exists in STORE_A, querying with STORE_B
    // returns nothing because the storeId filter is part of the where clause.
    mockCustomer.findFirst.mockResolvedValue(null);

    await expect(getCustomerById(STORE_B, 'cus_abc123')).rejects.toThrow(NotFoundError);
    expect(mockCustomer.findFirst).toHaveBeenCalledWith({
      where: { id: 'cus_abc123', deletedAt: null, storeId: STORE_B },
    });
  });

  it('should throw NotFoundError for a soft-deleted customer', async () => {
    mockCustomer.findFirst.mockResolvedValue(null);

    await expect(getCustomerById(STORE_A, 'deleted_id')).rejects.toThrow(NotFoundError);
  });
});

// ── updateCustomer ─────────────────────────────────────
describe('updateCustomer', () => {
  it('should update an existing customer in scope and return tags:[]', async () => {
    mockCustomer.findFirst.mockResolvedValue(fakeCustomer);
    const updated = { ...fakeCustomer, name: 'Jane Doe' };
    mockCustomer.update.mockResolvedValue(updated);

    const result = await updateCustomer(STORE_A, 'cus_abc123', { name: 'Jane Doe' });

    expect(mockCustomer.findFirst).toHaveBeenCalledWith({
      where: { id: 'cus_abc123', deletedAt: null, storeId: STORE_A },
    });
    expect(mockCustomer.update).toHaveBeenCalledWith({
      where: { id: 'cus_abc123' },
      data: { name: 'Jane Doe' },
    });
    expect(result.customer.name).toBe('Jane Doe');
    expect(result.customer.tags).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('should throw NotFoundError when customer is not in scope (cross-store)', async () => {
    mockCustomer.findFirst.mockResolvedValue(null); // not visible to STORE_B

    await expect(
      updateCustomer(STORE_B, 'cus_abc123', { name: 'Hijack' }),
    ).rejects.toThrow(NotFoundError);
    expect(mockCustomer.update).not.toHaveBeenCalled();
  });

  it('should throw NotFoundError when updating non-existent customer', async () => {
    mockCustomer.findFirst.mockResolvedValue(null);

    await expect(
      updateCustomer(STORE_A, 'nonexistent', { name: 'X' }),
    ).rejects.toThrow(NotFoundError);
    expect(mockCustomer.update).not.toHaveBeenCalled();
  });

  it('should allow clearing nullable fields to null', async () => {
    mockCustomer.findFirst.mockResolvedValue(fakeCustomer);
    const cleared = { ...fakeCustomer, phone: null };
    mockCustomer.update.mockResolvedValue(cleared);

    const result = await updateCustomer(STORE_A, 'cus_abc123', { phone: null });

    expect(mockCustomer.update).toHaveBeenCalledWith({
      where: { id: 'cus_abc123' },
      data: { phone: null },
    });
    expect(result.customer.phone).toBeNull();
    expect(result.warnings).toEqual([]);
  });

  it('should NOT flag customer as duplicate of itself on no-op update', async () => {
    mockCustomer.findFirst.mockResolvedValue(fakeCustomer);
    mockCustomer.update.mockResolvedValue(fakeCustomer);

    const result = await updateCustomer(STORE_A, 'cus_abc123', {
      phone: fakeCustomer.phone,
      email: fakeCustomer.email,
    });

    expect(mockCustomer.findFirst).toHaveBeenCalledTimes(1);
    expect(result.warnings).toEqual([]);
  });

  it('should warn on update when new phone collides with another customer in same store', async () => {
    mockCustomer.findFirst
      .mockResolvedValueOnce(fakeCustomer) // existence check
      .mockResolvedValueOnce({ id: 'other_cus' }); // phone duplicate check
    mockCustomer.update.mockResolvedValue({ ...fakeCustomer, phone: '+9999999999' });

    const result = await updateCustomer(STORE_A, 'cus_abc123', { phone: '+9999999999' });

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].field).toBe('phone');
    expect(result.warnings[0].existingCustomerId).toBe('other_cus');
    expect(mockCustomer.update).toHaveBeenCalled();
  });
});

// ── deleteCustomer ─────────────────────────────────────
describe('deleteCustomer', () => {
  it('should soft-delete by setting deletedAt', async () => {
    mockCustomer.findFirst.mockResolvedValue(fakeCustomer);
    mockCustomer.update.mockResolvedValue({ ...fakeCustomer, deletedAt: new Date() });

    await deleteCustomer(STORE_A, 'cus_abc123');

    expect(mockCustomer.findFirst).toHaveBeenCalledWith({
      where: { id: 'cus_abc123', deletedAt: null, storeId: STORE_A },
    });
    expect(mockCustomer.update).toHaveBeenCalledWith({
      where: { id: 'cus_abc123' },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('should throw NotFoundError when deleting a customer in another store', async () => {
    mockCustomer.findFirst.mockResolvedValue(null); // STORE_B cannot see STORE_A's customer

    await expect(deleteCustomer(STORE_B, 'cus_abc123')).rejects.toThrow(NotFoundError);
    expect(mockCustomer.update).not.toHaveBeenCalled();
  });

  it('should throw NotFoundError when deleting non-existent customer', async () => {
    mockCustomer.findFirst.mockResolvedValue(null);

    await expect(deleteCustomer(STORE_A, 'nonexistent')).rejects.toThrow(NotFoundError);
    expect(mockCustomer.update).not.toHaveBeenCalled();
  });

  it('should throw NotFoundError when deleting an already-deleted customer', async () => {
    mockCustomer.findFirst.mockResolvedValue(null);

    await expect(deleteCustomer(STORE_A, 'already_deleted')).rejects.toThrow(NotFoundError);
  });
});

// ── checkDuplicates ────────────────────────────────────
describe('checkDuplicates', () => {
  it('should return empty array when no fields provided', async () => {
    const warnings = await checkDuplicates(STORE_A, {});
    expect(warnings).toEqual([]);
    expect(mockCustomer.findFirst).not.toHaveBeenCalled();
  });

  it('should skip phone check when phone is null', async () => {
    mockCustomer.findFirst.mockResolvedValue(null);

    await checkDuplicates(STORE_A, { phone: null, email: 'a@b.com' });

    expect(mockCustomer.findFirst).toHaveBeenCalledTimes(1);
    expect(mockCustomer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ email: 'a@b.com' }),
      }),
    );
  });

  it('should pass excludeId as NOT filter', async () => {
    mockCustomer.findFirst.mockResolvedValue(null);

    await checkDuplicates(STORE_A, { phone: '+1111111111' }, 'cus_self');

    expect(mockCustomer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          NOT: { id: 'cus_self' },
        }),
      }),
    );
  });

  it('should only query soft-not-deleted customers', async () => {
    mockCustomer.findFirst.mockResolvedValue(null);

    await checkDuplicates(STORE_A, { phone: '+1111111111' });

    expect(mockCustomer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null }),
      }),
    );
  });
});

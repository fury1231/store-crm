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
const fakeCustomer = {
  id: 'cust_abc123',
  name: 'John Doe',
  phone: '+1234567890',
  email: 'john@example.com',
  address: '456 Oak Ave',
  notes: 'VIP customer',
  storeId: 'store_xyz',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  deletedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ── checkDuplicates ───────────────────────────────────
describe('checkDuplicates', () => {
  it('should return empty warnings when no duplicates', async () => {
    mockCustomer.findFirst.mockResolvedValue(null);

    const warnings = await checkDuplicates('store_xyz', '+1234567890', 'john@example.com');

    expect(warnings).toEqual([]);
  });

  it('should warn when phone already exists in same store', async () => {
    mockCustomer.findFirst.mockResolvedValueOnce(fakeCustomer); // phone match
    mockCustomer.findFirst.mockResolvedValueOnce(null);          // email no match

    const warnings = await checkDuplicates('store_xyz', '+1234567890', 'other@example.com');

    expect(warnings).toHaveLength(1);
    expect(warnings[0].field).toBe('phone');
  });

  it('should warn when email already exists in same store', async () => {
    mockCustomer.findFirst.mockResolvedValueOnce(null);          // phone no match
    mockCustomer.findFirst.mockResolvedValueOnce(fakeCustomer); // email match

    const warnings = await checkDuplicates('store_xyz', '+9999999999', 'john@example.com');

    expect(warnings).toHaveLength(1);
    expect(warnings[0].field).toBe('email');
  });

  it('should warn for both phone and email duplicates', async () => {
    mockCustomer.findFirst.mockResolvedValue(fakeCustomer);

    const warnings = await checkDuplicates('store_xyz', '+1234567890', 'john@example.com');

    expect(warnings).toHaveLength(2);
    expect(warnings.map((w) => w.field)).toEqual(['phone', 'email']);
  });

  it('should skip check when phone/email not provided', async () => {
    const warnings = await checkDuplicates('store_xyz', undefined, undefined);

    expect(warnings).toEqual([]);
    expect(mockCustomer.findFirst).not.toHaveBeenCalled();
  });

  it('should skip check for null phone/email', async () => {
    const warnings = await checkDuplicates('store_xyz', null, null);

    expect(warnings).toEqual([]);
    expect(mockCustomer.findFirst).not.toHaveBeenCalled();
  });

  it('should exclude current customer id when checking for updates', async () => {
    mockCustomer.findFirst.mockResolvedValue(null);

    await checkDuplicates('store_xyz', '+1234567890', null, 'cust_abc123');

    expect(mockCustomer.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: { not: 'cust_abc123' },
      }),
    });
  });
});

// ── createCustomer ────────────────────────────────────
describe('createCustomer', () => {
  it('should create a customer with valid data', async () => {
    mockCustomer.findFirst.mockResolvedValue(null); // no duplicates
    mockCustomer.create.mockResolvedValue(fakeCustomer);

    const result = await createCustomer({
      name: 'John Doe',
      phone: '+1234567890',
      email: 'john@example.com',
      address: '456 Oak Ave',
      notes: 'VIP customer',
      storeId: 'store_xyz',
    });

    expect(mockCustomer.create).toHaveBeenCalledWith({
      data: {
        name: 'John Doe',
        phone: '+1234567890',
        email: 'john@example.com',
        address: '456 Oak Ave',
        notes: 'VIP customer',
        storeId: 'store_xyz',
      },
    });
    expect(result.customer).toEqual({ ...fakeCustomer, tags: [] });
    expect(result.warnings).toEqual([]);
  });

  it('should create with name and storeId only (optional fields omitted)', async () => {
    const minimal = { ...fakeCustomer, phone: null, email: null, address: null, notes: null };
    mockCustomer.create.mockResolvedValue(minimal);

    const result = await createCustomer({ name: 'John Doe', storeId: 'store_xyz' });

    expect(mockCustomer.create).toHaveBeenCalledWith({
      data: { name: 'John Doe', storeId: 'store_xyz' },
    });
    expect(result.customer.tags).toEqual([]);
  });

  it('should return duplicate warnings but still create', async () => {
    mockCustomer.findFirst.mockResolvedValue(fakeCustomer); // both phone & email duplicate
    mockCustomer.create.mockResolvedValue(fakeCustomer);

    const result = await createCustomer({
      name: 'Jane Doe',
      phone: '+1234567890',
      email: 'john@example.com',
      storeId: 'store_xyz',
    });

    expect(result.warnings).toHaveLength(2);
    expect(result.customer).toBeDefined();
  });
});

// ── listCustomers ─────────────────────────────────────
describe('listCustomers', () => {
  it('should return paginated customers with meta', async () => {
    mockCustomer.count.mockResolvedValue(25);
    mockCustomer.findMany.mockResolvedValue([fakeCustomer]);

    const result = await listCustomers({
      page: 2,
      limit: 10,
      sortBy: 'createdAt',
      order: 'desc',
    });

    expect(mockCustomer.count).toHaveBeenCalledWith({
      where: { deletedAt: null },
    });
    expect(mockCustomer.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      skip: 10,
      take: 10,
      orderBy: { createdAt: 'desc' },
    });
    expect(result.meta).toEqual({
      page: 2,
      limit: 10,
      total: 25,
      totalPages: 3,
    });
    expect(result.customers).toEqual([{ ...fakeCustomer, tags: [] }]);
  });

  it('should use default pagination (page 1, limit 20)', async () => {
    mockCustomer.count.mockResolvedValue(0);
    mockCustomer.findMany.mockResolvedValue([]);

    const result = await listCustomers({
      page: 1,
      limit: 20,
      sortBy: 'createdAt',
      order: 'desc',
    });

    expect(mockCustomer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 20 }),
    );
    expect(result.meta.totalPages).toBe(0);
    expect(result.customers).toEqual([]);
  });

  it('should filter by storeId', async () => {
    mockCustomer.count.mockResolvedValue(5);
    mockCustomer.findMany.mockResolvedValue([fakeCustomer]);

    await listCustomers({
      page: 1,
      limit: 20,
      storeId: 'store_xyz',
      sortBy: 'createdAt',
      order: 'desc',
    });

    expect(mockCustomer.count).toHaveBeenCalledWith({
      where: { deletedAt: null, storeId: 'store_xyz' },
    });
    expect(mockCustomer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null, storeId: 'store_xyz' },
      }),
    );
  });

  it('should apply search across name, phone, email', async () => {
    mockCustomer.count.mockResolvedValue(1);
    mockCustomer.findMany.mockResolvedValue([fakeCustomer]);

    await listCustomers({
      page: 1,
      limit: 20,
      search: 'john',
      sortBy: 'createdAt',
      order: 'desc',
    });

    expect(mockCustomer.count).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        OR: [
          { name: { contains: 'john', mode: 'insensitive' } },
          { phone: { contains: 'john', mode: 'insensitive' } },
          { email: { contains: 'john', mode: 'insensitive' } },
        ],
      },
    });
  });

  it('should sort by specified field and order', async () => {
    mockCustomer.count.mockResolvedValue(1);
    mockCustomer.findMany.mockResolvedValue([fakeCustomer]);

    await listCustomers({
      page: 1,
      limit: 20,
      sortBy: 'name',
      order: 'asc',
    });

    expect(mockCustomer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { name: 'asc' },
      }),
    );
  });

  it('should exclude soft-deleted customers', async () => {
    mockCustomer.count.mockResolvedValue(0);
    mockCustomer.findMany.mockResolvedValue([]);

    await listCustomers({
      page: 1,
      limit: 20,
      sortBy: 'createdAt',
      order: 'desc',
    });

    expect(mockCustomer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null }),
      }),
    );
  });

  it('should combine search and storeId filters', async () => {
    mockCustomer.count.mockResolvedValue(1);
    mockCustomer.findMany.mockResolvedValue([fakeCustomer]);

    await listCustomers({
      page: 1,
      limit: 20,
      search: 'john',
      storeId: 'store_xyz',
      sortBy: 'createdAt',
      order: 'desc',
    });

    expect(mockCustomer.count).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        storeId: 'store_xyz',
        OR: [
          { name: { contains: 'john', mode: 'insensitive' } },
          { phone: { contains: 'john', mode: 'insensitive' } },
          { email: { contains: 'john', mode: 'insensitive' } },
        ],
      },
    });
  });
});

// ── getCustomerById ───────────────────────────────────
describe('getCustomerById', () => {
  it('should return a customer with tags when found', async () => {
    mockCustomer.findFirst.mockResolvedValue(fakeCustomer);

    const result = await getCustomerById('cust_abc123');

    expect(mockCustomer.findFirst).toHaveBeenCalledWith({
      where: { id: 'cust_abc123', deletedAt: null },
    });
    expect(result).toEqual({ ...fakeCustomer, tags: [] });
  });

  it('should throw NotFoundError when customer does not exist', async () => {
    mockCustomer.findFirst.mockResolvedValue(null);

    await expect(getCustomerById('nonexistent')).rejects.toThrow(NotFoundError);
    await expect(getCustomerById('nonexistent')).rejects.toThrow(
      "Customer with id 'nonexistent' not found",
    );
  });

  it('should throw NotFoundError for a soft-deleted customer', async () => {
    mockCustomer.findFirst.mockResolvedValue(null);

    await expect(getCustomerById('deleted_id')).rejects.toThrow(NotFoundError);
  });
});

// ── updateCustomer ────────────────────────────────────
describe('updateCustomer', () => {
  it('should update an existing customer', async () => {
    const updated = { ...fakeCustomer, name: 'Jane Doe' };
    mockCustomer.findFirst.mockResolvedValue(fakeCustomer);
    mockCustomer.update.mockResolvedValue(updated);

    const result = await updateCustomer('cust_abc123', { name: 'Jane Doe' });

    expect(mockCustomer.findFirst).toHaveBeenCalledWith({
      where: { id: 'cust_abc123', deletedAt: null },
    });
    expect(mockCustomer.update).toHaveBeenCalledWith({
      where: { id: 'cust_abc123' },
      data: { name: 'Jane Doe' },
    });
    expect(result.customer.name).toBe('Jane Doe');
    expect(result.customer.tags).toEqual([]);
  });

  it('should throw NotFoundError when updating non-existent customer', async () => {
    mockCustomer.findFirst.mockResolvedValue(null);

    await expect(updateCustomer('nonexistent', { name: 'X' })).rejects.toThrow(NotFoundError);
    expect(mockCustomer.update).not.toHaveBeenCalled();
  });

  it('should allow setting nullable fields to null', async () => {
    const cleared = { ...fakeCustomer, phone: null };
    mockCustomer.findFirst.mockResolvedValue(fakeCustomer);
    mockCustomer.update.mockResolvedValue(cleared);

    const result = await updateCustomer('cust_abc123', { phone: null });

    expect(mockCustomer.update).toHaveBeenCalledWith({
      where: { id: 'cust_abc123' },
      data: { phone: null },
    });
    expect(result.customer.phone).toBeNull();
  });

  it('should return duplicate warnings on update', async () => {
    mockCustomer.findFirst.mockResolvedValueOnce(fakeCustomer); // getById check
    mockCustomer.findFirst.mockResolvedValueOnce(fakeCustomer); // duplicate phone check
    mockCustomer.update.mockResolvedValue(fakeCustomer);

    const result = await updateCustomer('cust_abc123', { phone: '+1234567890' });

    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
  });
});

// ── deleteCustomer ────────────────────────────────────
describe('deleteCustomer', () => {
  it('should soft-delete an existing customer by setting deletedAt', async () => {
    const deleted = { ...fakeCustomer, deletedAt: new Date() };
    mockCustomer.findFirst.mockResolvedValue(fakeCustomer);
    mockCustomer.update.mockResolvedValue(deleted);

    const result = await deleteCustomer('cust_abc123');

    expect(mockCustomer.update).toHaveBeenCalledWith({
      where: { id: 'cust_abc123' },
      data: { deletedAt: expect.any(Date) },
    });
    expect(result.deletedAt).not.toBeNull();
  });

  it('should throw NotFoundError when deleting non-existent customer', async () => {
    mockCustomer.findFirst.mockResolvedValue(null);

    await expect(deleteCustomer('nonexistent')).rejects.toThrow(NotFoundError);
    expect(mockCustomer.update).not.toHaveBeenCalled();
  });

  it('should throw NotFoundError when deleting already-deleted customer', async () => {
    mockCustomer.findFirst.mockResolvedValue(null);

    await expect(deleteCustomer('already_deleted')).rejects.toThrow(NotFoundError);
  });
});

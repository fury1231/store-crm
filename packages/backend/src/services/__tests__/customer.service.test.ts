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
  buildCustomerWhere,
  exportCustomersCsv,
} from '../customer.service';

// ── Fixtures ───────────────────────────────────────────
const fakeCustomer = {
  id: 'cus_abc123',
  name: 'John Doe',
  phone: '+1234567890',
  email: 'john@example.com',
  address: '123 Main St',
  notes: 'VIP customer',
  storeId: 'str_abc123',
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

    const result = await createCustomer({
      name: 'John Doe',
      phone: '+1234567890',
      email: 'john@example.com',
      address: '123 Main St',
      notes: 'VIP customer',
      storeId: 'str_abc123',
    });

    expect(mockCustomer.create).toHaveBeenCalledWith({
      data: {
        name: 'John Doe',
        phone: '+1234567890',
        email: 'john@example.com',
        address: '123 Main St',
        notes: 'VIP customer',
        storeId: 'str_abc123',
      },
    });
    expect(result.customer.name).toBe('John Doe');
    expect(result.customer.tags).toEqual([]);
    expect(result.customer).not.toHaveProperty('deletedAt');
    expect(result.warnings).toEqual([]);
  });

  it('should create a minimal customer (name + storeId only)', async () => {
    mockCustomer.findFirst.mockResolvedValue(null);
    const minimal = {
      ...fakeCustomer,
      phone: null,
      email: null,
      address: null,
      notes: null,
    };
    mockCustomer.create.mockResolvedValue(minimal);

    const result = await createCustomer({
      name: 'John Doe',
      storeId: 'str_abc123',
    });

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

    const result = await createCustomer({
      name: 'John Doe',
      phone: '+1234567890',
      email: 'john@example.com',
      storeId: 'str_abc123',
    });

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].field).toBe('phone');
    expect(result.warnings[0].existingCustomerId).toBe('existing_1');
    // Critically: the customer was still created despite the warning.
    expect(mockCustomer.create).toHaveBeenCalled();
  });

  it('should return duplicate warning when email exists in same store', async () => {
    mockCustomer.findFirst
      .mockResolvedValueOnce(null) // phone check
      .mockResolvedValueOnce({ id: 'existing_2' }); // email check
    mockCustomer.create.mockResolvedValue(fakeCustomer);

    const result = await createCustomer({
      name: 'John Doe',
      phone: '+1234567890',
      email: 'john@example.com',
      storeId: 'str_abc123',
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

    const result = await createCustomer({
      name: 'John Doe',
      phone: '+1234567890',
      email: 'john@example.com',
      storeId: 'str_abc123',
    });

    expect(result.warnings).toHaveLength(2);
    expect(result.warnings.map((w) => w.field).sort()).toEqual(['email', 'phone']);
  });
});

// ── listCustomers ──────────────────────────────────────
describe('listCustomers', () => {
  it('should return paginated customers with meta and tags:[]', async () => {
    mockCustomer.count.mockResolvedValue(25);
    mockCustomer.findMany.mockResolvedValue([fakeCustomer]);

    const result = await listCustomers({
      page: 2,
      limit: 10,
      sortBy: 'createdAt',
      order: 'desc',
    });

    // With no filters, the where clause collapses to a single deletedAt:null.
    expect(mockCustomer.count).toHaveBeenCalledWith({ where: { deletedAt: null } });
    expect(mockCustomer.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      skip: 10,
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        tags: { select: { id: true, name: true, color: true } },
      },
    });
    expect(result.meta).toEqual({ page: 2, limit: 10, total: 25, totalPages: 3 });
    expect(result.customers).toHaveLength(1);
    // Fixture has no `tags` relation, so toCustomerResponse normalises to [].
    expect(result.customers[0].tags).toEqual([]);
  });

  it('should apply search across name, phone, email using contains+insensitive', async () => {
    mockCustomer.count.mockResolvedValue(1);
    mockCustomer.findMany.mockResolvedValue([fakeCustomer]);

    await listCustomers({
      page: 1,
      limit: 20,
      search: 'john',
      sortBy: 'createdAt',
      order: 'desc',
    });

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

  it('should respect sortBy=name and order=asc', async () => {
    mockCustomer.count.mockResolvedValue(0);
    mockCustomer.findMany.mockResolvedValue([]);

    await listCustomers({
      page: 1,
      limit: 20,
      sortBy: 'name',
      order: 'asc',
    });

    expect(mockCustomer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { name: 'asc' } }),
    );
  });

  it('should filter by storeId when provided', async () => {
    mockCustomer.count.mockResolvedValue(0);
    mockCustomer.findMany.mockResolvedValue([]);

    await listCustomers({
      page: 1,
      limit: 20,
      storeId: 'str_abc123',
      sortBy: 'createdAt',
      order: 'desc',
    });

    expect(mockCustomer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [{ deletedAt: null }, { storeId: 'str_abc123' }],
        },
      }),
    );
  });

  it('should exclude soft-deleted customers from count and query', async () => {
    mockCustomer.count.mockResolvedValue(0);
    mockCustomer.findMany.mockResolvedValue([]);

    await listCustomers({ page: 1, limit: 20, sortBy: 'createdAt', order: 'desc' });

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

    const result = await listCustomers({
      page: 1,
      limit: 20,
      sortBy: 'createdAt',
      order: 'desc',
    });

    expect(result.customers).toEqual([]);
    expect(result.meta.total).toBe(0);
    expect(result.meta.totalPages).toBe(0);
  });

  it('should populate tags when the relation is loaded by findMany', async () => {
    mockCustomer.count.mockResolvedValue(1);
    const tags = [{ id: 'tag_vip', name: 'VIP', color: '#FFD700' }];
    mockCustomer.findMany.mockResolvedValue([{ ...fakeCustomer, tags }]);

    const result = await listCustomers({
      page: 1,
      limit: 20,
      sortBy: 'createdAt',
      order: 'desc',
    });

    expect(result.customers[0].tags).toEqual(tags);
  });
});

// ── getCustomerById ────────────────────────────────────
describe('getCustomerById', () => {
  it('should return a customer with empty tags when none assigned', async () => {
    mockCustomer.findFirst.mockResolvedValue({ ...fakeCustomer, tags: [] });

    const result = await getCustomerById('cus_abc123');

    expect(mockCustomer.findFirst).toHaveBeenCalledWith({
      where: { id: 'cus_abc123', deletedAt: null },
      include: {
        tags: { select: { id: true, name: true, color: true } },
      },
    });
    expect(result.id).toBe('cus_abc123');
    expect(result.tags).toEqual([]);
    expect(result).not.toHaveProperty('deletedAt');
  });

  it('should return populated tags when the customer has tags assigned', async () => {
    const tags = [
      { id: 'tag_vip', name: 'VIP', color: '#FFD700' },
      { id: 'tag_reg', name: 'Regular', color: '#1E90FF' },
    ];
    mockCustomer.findFirst.mockResolvedValue({ ...fakeCustomer, tags });

    const result = await getCustomerById('cus_abc123');

    expect(result.tags).toEqual(tags);
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

// ── updateCustomer ─────────────────────────────────────
describe('updateCustomer', () => {
  it('should update an existing customer and return tags:[]', async () => {
    mockCustomer.findFirst.mockResolvedValue(fakeCustomer);
    const updated = { ...fakeCustomer, name: 'Jane Doe' };
    mockCustomer.update.mockResolvedValue(updated);

    const result = await updateCustomer('cus_abc123', { name: 'Jane Doe' });

    expect(mockCustomer.update).toHaveBeenCalledWith({
      where: { id: 'cus_abc123' },
      data: { name: 'Jane Doe' },
    });
    expect(result.customer.name).toBe('Jane Doe');
    expect(result.customer.tags).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('should throw NotFoundError when updating non-existent customer', async () => {
    mockCustomer.findFirst.mockResolvedValue(null);

    await expect(updateCustomer('nonexistent', { name: 'X' })).rejects.toThrow(NotFoundError);
    expect(mockCustomer.update).not.toHaveBeenCalled();
  });

  it('should allow clearing nullable fields to null', async () => {
    mockCustomer.findFirst.mockResolvedValue(fakeCustomer);
    const cleared = { ...fakeCustomer, phone: null };
    mockCustomer.update.mockResolvedValue(cleared);

    const result = await updateCustomer('cus_abc123', { phone: null });

    expect(mockCustomer.update).toHaveBeenCalledWith({
      where: { id: 'cus_abc123' },
      data: { phone: null },
    });
    expect(result.customer.phone).toBeNull();
    // Clearing to null should never trigger duplicate warnings.
    expect(result.warnings).toEqual([]);
  });

  it('should NOT flag customer as duplicate of itself on no-op update', async () => {
    mockCustomer.findFirst.mockResolvedValue(fakeCustomer);
    mockCustomer.update.mockResolvedValue(fakeCustomer);

    // Updating with the SAME phone/email — should not perform dup check at all.
    const result = await updateCustomer('cus_abc123', {
      phone: fakeCustomer.phone,
      email: fakeCustomer.email,
    });

    // Only the initial findFirst for existence check — no extra queries.
    expect(mockCustomer.findFirst).toHaveBeenCalledTimes(1);
    expect(result.warnings).toEqual([]);
  });

  it('should warn on update when new phone collides with another customer in same store', async () => {
    mockCustomer.findFirst
      .mockResolvedValueOnce(fakeCustomer) // existence check
      .mockResolvedValueOnce({ id: 'other_cus' }); // phone duplicate check
    mockCustomer.update.mockResolvedValue({ ...fakeCustomer, phone: '+9999999999' });

    const result = await updateCustomer('cus_abc123', { phone: '+9999999999' });

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].field).toBe('phone');
    expect(result.warnings[0].existingCustomerId).toBe('other_cus');
    // Update still proceeds — warning is soft.
    expect(mockCustomer.update).toHaveBeenCalled();
  });
});

// ── deleteCustomer ─────────────────────────────────────
describe('deleteCustomer', () => {
  it('should soft-delete by setting deletedAt', async () => {
    mockCustomer.findFirst.mockResolvedValue(fakeCustomer);
    mockCustomer.update.mockResolvedValue({ ...fakeCustomer, deletedAt: new Date() });

    await deleteCustomer('cus_abc123');

    expect(mockCustomer.update).toHaveBeenCalledWith({
      where: { id: 'cus_abc123' },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('should throw NotFoundError when deleting non-existent customer', async () => {
    mockCustomer.findFirst.mockResolvedValue(null);

    await expect(deleteCustomer('nonexistent')).rejects.toThrow(NotFoundError);
    expect(mockCustomer.update).not.toHaveBeenCalled();
  });

  it('should throw NotFoundError when deleting an already-deleted customer', async () => {
    mockCustomer.findFirst.mockResolvedValue(null);

    await expect(deleteCustomer('already_deleted')).rejects.toThrow(NotFoundError);
  });
});

// ── checkDuplicates ────────────────────────────────────
describe('checkDuplicates', () => {
  it('should return empty array when no fields provided', async () => {
    const warnings = await checkDuplicates('str_abc123', {});
    expect(warnings).toEqual([]);
    expect(mockCustomer.findFirst).not.toHaveBeenCalled();
  });

  it('should skip phone check when phone is null', async () => {
    mockCustomer.findFirst.mockResolvedValue(null);

    await checkDuplicates('str_abc123', { phone: null, email: 'a@b.com' });

    expect(mockCustomer.findFirst).toHaveBeenCalledTimes(1);
    expect(mockCustomer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ email: 'a@b.com' }),
      }),
    );
  });

  it('should pass excludeId as NOT filter', async () => {
    mockCustomer.findFirst.mockResolvedValue(null);

    await checkDuplicates(
      'str_abc123',
      { phone: '+1111111111' },
      'cus_self',
    );

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

    await checkDuplicates('str_abc123', { phone: '+1111111111' });

    expect(mockCustomer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null }),
      }),
    );
  });
});

// ── buildCustomerWhere ─────────────────────────────────
// Pure function tests — no Prisma calls required. Verifies the
// composable where-builder produces the exact shape the service
// will hand to Prisma for every combination of filter query params.
describe('buildCustomerWhere', () => {
  it('returns a flat deletedAt:null clause when no filters are supplied', () => {
    const where = buildCustomerWhere({});
    expect(where).toEqual({ deletedAt: null });
  });

  it('adds storeId as an AND clause', () => {
    const where = buildCustomerWhere({ storeId: 'str_1' });
    expect(where).toEqual({
      AND: [{ deletedAt: null }, { storeId: 'str_1' }],
    });
  });

  it('adds a case-insensitive multi-field OR for search', () => {
    const where = buildCustomerWhere({ search: 'Alice' });
    expect(where).toEqual({
      AND: [
        { deletedAt: null },
        {
          OR: [
            { name: { contains: 'Alice', mode: 'insensitive' } },
            { phone: { contains: 'Alice', mode: 'insensitive' } },
            { email: { contains: 'Alice', mode: 'insensitive' } },
          ],
        },
      ],
    });
  });

  it('adds email field-specific filter as case-insensitive contains', () => {
    const where = buildCustomerWhere({ email: 'john@example.com' });
    expect(where).toEqual({
      AND: [
        { deletedAt: null },
        { email: { contains: 'john@example.com', mode: 'insensitive' } },
      ],
    });
  });

  it('adds phone field-specific filter as case-insensitive contains', () => {
    const where = buildCustomerWhere({ phone: '555' });
    expect(where).toEqual({
      AND: [
        { deletedAt: null },
        { phone: { contains: '555', mode: 'insensitive' } },
      ],
    });
  });

  it('adds a tag subquery for tagId', () => {
    const where = buildCustomerWhere({ tagId: 'tag_vip' });
    expect(where).toEqual({
      AND: [
        { deletedAt: null },
        { tags: { some: { id: 'tag_vip' } } },
      ],
    });
  });

  it('adds a tag subquery for comma-separated tag names', () => {
    const where = buildCustomerWhere({ tags: ['vip', 'regular'] });
    expect(where).toEqual({
      AND: [
        { deletedAt: null },
        { tags: { some: { name: { in: ['vip', 'regular'] } } } },
      ],
    });
  });

  it('treats `group` as an alias for a single tag name', () => {
    const where = buildCustomerWhere({ group: 'vip' });
    expect(where).toEqual({
      AND: [
        { deletedAt: null },
        { tags: { some: { name: { in: ['vip'] } } } },
      ],
    });
  });

  it('merges tagId, tags, and group into a single EXISTS subquery', () => {
    const where = buildCustomerWhere({
      tagId: 'tag_123',
      tags: ['vip', 'regular'],
      group: 'gold',
    });
    expect(where).toEqual({
      AND: [
        { deletedAt: null },
        {
          tags: {
            some: {
              OR: [
                { id: 'tag_123' },
                { name: { in: ['vip', 'regular', 'gold'] } },
              ],
            },
          },
        },
      ],
    });
  });

  it('deduplicates tag names when group overlaps with tags list', () => {
    const where = buildCustomerWhere({
      tags: ['vip', 'regular'],
      group: 'vip',
    });
    // "vip" should appear only once in the `in` array.
    expect(where).toEqual({
      AND: [
        { deletedAt: null },
        { tags: { some: { name: { in: ['vip', 'regular'] } } } },
      ],
    });
  });

  it('adds createdAt gte when only createdAfter is supplied', () => {
    const after = new Date('2026-01-01T00:00:00.000Z');
    const where = buildCustomerWhere({ createdAfter: after });
    expect(where).toEqual({
      AND: [{ deletedAt: null }, { createdAt: { gte: after } }],
    });
  });

  it('adds createdAt lte when only createdBefore is supplied', () => {
    const before = new Date('2026-06-01T00:00:00.000Z');
    const where = buildCustomerWhere({ createdBefore: before });
    expect(where).toEqual({
      AND: [{ deletedAt: null }, { createdAt: { lte: before } }],
    });
  });

  it('combines createdAfter and createdBefore into a single DateTimeFilter', () => {
    const after = new Date('2026-01-01T00:00:00.000Z');
    const before = new Date('2026-06-01T00:00:00.000Z');
    const where = buildCustomerWhere({ createdAfter: after, createdBefore: before });
    expect(where).toEqual({
      AND: [
        { deletedAt: null },
        { createdAt: { gte: after, lte: before } },
      ],
    });
  });

  it('composes every filter together with AND logic', () => {
    const after = new Date('2026-01-01T00:00:00.000Z');
    const where = buildCustomerWhere({
      storeId: 'str_1',
      search: 'john',
      email: 'john@example.com',
      phone: '555',
      tags: ['vip'],
      createdAfter: after,
    });
    // All six clauses plus the baseline deletedAt exclusion = 7.
    expect(where).toHaveProperty('AND');
    const clauses = (where as { AND: unknown[] }).AND;
    expect(clauses).toHaveLength(7);
    expect(clauses[0]).toEqual({ deletedAt: null });
    expect(clauses).toContainEqual({ storeId: 'str_1' });
    expect(clauses).toContainEqual({ createdAt: { gte: after } });
  });
});

// ── exportCustomersCsv ─────────────────────────────────
describe('exportCustomersCsv', () => {
  it('returns a CSV with header row and zero data rows when no customers match', async () => {
    mockCustomer.findMany.mockResolvedValue([]);

    const result = await exportCustomersCsv({
      format: 'csv',
      sortBy: 'createdAt',
      order: 'desc',
    });

    expect(result.rowCount).toBe(0);
    expect(result.csv).toBe('name,phone,email,address,tags,createdAt');
  });

  it('serialises each customer into a CSV row including tag names', async () => {
    mockCustomer.findMany.mockResolvedValue([
      {
        ...fakeCustomer,
        tags: [
          { id: 'tag_vip', name: 'VIP', color: '#FFD700' },
          { id: 'tag_reg', name: 'Regular', color: '#1E90FF' },
        ],
      },
    ]);

    const result = await exportCustomersCsv({
      format: 'csv',
      sortBy: 'createdAt',
      order: 'desc',
    });

    expect(result.rowCount).toBe(1);
    const lines = result.csv.split('\r\n');
    expect(lines[0]).toBe('name,phone,email,address,tags,createdAt');
    // The phone `+1234567890` is prefixed with an apostrophe by the CSV
    // encoder's formula-injection guard — `+` is a leading formula
    // character in Excel/Sheets. This is the secure default.
    expect(lines[1]).toBe(
      "John Doe,'+1234567890,john@example.com,123 Main St,VIP|Regular,2026-01-01T00:00:00.000Z",
    );
  });

  it('caps the number of rows at CSV_EXPORT_MAX_ROWS', async () => {
    mockCustomer.findMany.mockResolvedValue([]);

    await exportCustomersCsv({
      format: 'csv',
      sortBy: 'createdAt',
      order: 'desc',
    });

    expect(mockCustomer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10_000 }),
    );
  });

  it('applies the same where-builder filters as listCustomers', async () => {
    mockCustomer.findMany.mockResolvedValue([]);

    await exportCustomersCsv({
      format: 'csv',
      storeId: 'str_1',
      tags: ['vip'],
      sortBy: 'createdAt',
      order: 'desc',
    });

    expect(mockCustomer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { deletedAt: null },
            { storeId: 'str_1' },
            { tags: { some: { name: { in: ['vip'] } } } },
          ],
        },
      }),
    );
  });

  it('escapes commas and quotes in customer fields', async () => {
    mockCustomer.findMany.mockResolvedValue([
      {
        ...fakeCustomer,
        name: 'Smith, John "Johnny"',
        address: '1 Main St, Apt 2',
        tags: [],
      },
    ]);

    const result = await exportCustomersCsv({
      format: 'csv',
      sortBy: 'createdAt',
      order: 'desc',
    });

    const lines = result.csv.split('\r\n');
    // The name field must be wrapped in quotes and have its internal
    // double quotes doubled per RFC 4180.
    expect(lines[1]).toContain('"Smith, John ""Johnny"""');
    expect(lines[1]).toContain('"1 Main St, Apt 2"');
  });
});

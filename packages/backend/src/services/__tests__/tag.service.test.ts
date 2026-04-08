import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictError, NotFoundError, ValidationError } from '../../utils/errors';

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

vi.mock('../../prismaClient', () => ({
  prisma: { tag: mockTag, customer: mockCustomer },
}));

// Import after mock setup
import {
  createTag,
  listTagsByStore,
  updateTag,
  deleteTag,
  assignTagsToCustomer,
  removeTagFromCustomer,
} from '../tag.service';

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

const fakeCustomerStub = {
  id: 'cus_abc123',
  storeId: 'str_abc123',
};

/**
 * Mimic a Prisma `PrismaClientKnownRequestError` for unique-constraint
 * violations without importing the real class (which lives in the
 * generated client).
 */
function uniqueViolation(target: string[] = ['storeId', 'name']): unknown {
  const err = new Error(
    `Unique constraint failed on the fields: (${target.join(',')})`,
  ) as Error & { code: string; meta?: unknown };
  err.code = 'P2002';
  err.meta = { target };
  return err;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── createTag ──────────────────────────────────────────
describe('createTag', () => {
  it('should create a tag and return it', async () => {
    mockTag.create.mockResolvedValue(fakeTag);

    const result = await createTag({
      name: 'VIP',
      color: '#FFD700',
      storeId: 'str_abc123',
    });

    expect(mockTag.create).toHaveBeenCalledWith({
      data: { name: 'VIP', color: '#FFD700', storeId: 'str_abc123' },
    });
    expect(result).toEqual(fakeTag);
  });

  it('should throw ConflictError on duplicate tag name in the same store', async () => {
    mockTag.create.mockRejectedValue(uniqueViolation());

    await expect(
      createTag({ name: 'VIP', color: '#FFD700', storeId: 'str_abc123' }),
    ).rejects.toThrow(ConflictError);
    await expect(
      createTag({ name: 'VIP', color: '#FFD700', storeId: 'str_abc123' }),
    ).rejects.toThrow(/already exists/);
  });

  it('should re-throw unknown errors unchanged', async () => {
    const dbErr = new Error('connection lost');
    mockTag.create.mockRejectedValue(dbErr);

    await expect(
      createTag({ name: 'VIP', color: '#FFD700', storeId: 'str_abc123' }),
    ).rejects.toThrow('connection lost');
  });
});

// ── listTagsByStore ────────────────────────────────────
describe('listTagsByStore', () => {
  it('should return all tags for the store sorted by name asc', async () => {
    mockTag.findMany.mockResolvedValue([fakeRegularTag, fakeTag]);

    const result = await listTagsByStore('str_abc123');

    expect(mockTag.findMany).toHaveBeenCalledWith({
      where: { storeId: 'str_abc123' },
      orderBy: { name: 'asc' },
    });
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Regular');
  });

  it('should return empty array when store has no tags', async () => {
    mockTag.findMany.mockResolvedValue([]);

    const result = await listTagsByStore('str_empty');

    expect(result).toEqual([]);
  });
});

// ── updateTag ──────────────────────────────────────────
describe('updateTag', () => {
  it('should update name and return the updated tag', async () => {
    mockTag.findUnique.mockResolvedValue(fakeTag);
    mockTag.update.mockResolvedValue({ ...fakeTag, name: 'VIP+' });

    const result = await updateTag('tag_vip_1', { name: 'VIP+' });

    expect(mockTag.update).toHaveBeenCalledWith({
      where: { id: 'tag_vip_1' },
      data: { name: 'VIP+' },
    });
    expect(result.name).toBe('VIP+');
  });

  it('should update color', async () => {
    mockTag.findUnique.mockResolvedValue(fakeTag);
    mockTag.update.mockResolvedValue({ ...fakeTag, color: '#000000' });

    const result = await updateTag('tag_vip_1', { color: '#000000' });

    expect(result.color).toBe('#000000');
  });

  it('should throw NotFoundError when tag does not exist', async () => {
    mockTag.findUnique.mockResolvedValue(null);

    await expect(updateTag('nonexistent', { name: 'X' })).rejects.toThrow(
      NotFoundError,
    );
    expect(mockTag.update).not.toHaveBeenCalled();
  });

  it('should throw ConflictError when renaming to a name that exists', async () => {
    mockTag.findUnique.mockResolvedValue(fakeTag);
    mockTag.update.mockRejectedValue(uniqueViolation());

    await expect(updateTag('tag_vip_1', { name: 'Regular' })).rejects.toThrow(
      ConflictError,
    );
  });
});

// ── deleteTag ──────────────────────────────────────────
describe('deleteTag', () => {
  it('should delete an existing tag', async () => {
    mockTag.findUnique.mockResolvedValue(fakeTag);
    mockTag.delete.mockResolvedValue(fakeTag);

    await deleteTag('tag_vip_1');

    expect(mockTag.delete).toHaveBeenCalledWith({ where: { id: 'tag_vip_1' } });
  });

  it('should throw NotFoundError when deleting a non-existent tag', async () => {
    mockTag.findUnique.mockResolvedValue(null);

    await expect(deleteTag('nonexistent')).rejects.toThrow(NotFoundError);
    expect(mockTag.delete).not.toHaveBeenCalled();
  });
});

// ── assignTagsToCustomer ──────────────────────────────
describe('assignTagsToCustomer', () => {
  it('should assign tags from the same store and return the updated tag list', async () => {
    mockCustomer.findFirst.mockResolvedValue(fakeCustomerStub);
    mockTag.findMany.mockResolvedValue([{ id: 'tag_vip_1' }, { id: 'tag_reg_1' }]);
    mockCustomer.update.mockResolvedValue({
      tags: [
        { id: 'tag_vip_1', name: 'VIP', color: '#FFD700' },
        { id: 'tag_reg_1', name: 'Regular', color: '#1E90FF' },
      ],
    });

    const result = await assignTagsToCustomer('cus_abc123', [
      'tag_vip_1',
      'tag_reg_1',
    ]);

    expect(mockTag.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['tag_vip_1', 'tag_reg_1'] }, storeId: 'str_abc123' },
      select: { id: true },
    });
    expect(mockCustomer.update).toHaveBeenCalledWith({
      where: { id: 'cus_abc123' },
      data: {
        tags: { connect: [{ id: 'tag_vip_1' }, { id: 'tag_reg_1' }] },
      },
      select: {
        tags: { select: { id: true, name: true, color: true } },
      },
    });
    expect(result).toHaveLength(2);
  });

  it('should deduplicate tagIds before issuing the query', async () => {
    mockCustomer.findFirst.mockResolvedValue(fakeCustomerStub);
    mockTag.findMany.mockResolvedValue([{ id: 'tag_vip_1' }]);
    mockCustomer.update.mockResolvedValue({ tags: [] });

    await assignTagsToCustomer('cus_abc123', [
      'tag_vip_1',
      'tag_vip_1',
      'tag_vip_1',
    ]);

    expect(mockTag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['tag_vip_1'] },
        }),
      }),
    );
  });

  it('should throw NotFoundError when the customer does not exist', async () => {
    mockCustomer.findFirst.mockResolvedValue(null);

    await expect(
      assignTagsToCustomer('nonexistent', ['tag_vip_1']),
    ).rejects.toThrow(NotFoundError);
    expect(mockCustomer.update).not.toHaveBeenCalled();
  });

  it('should throw NotFoundError for a soft-deleted customer', async () => {
    mockCustomer.findFirst.mockResolvedValue(null);

    await expect(
      assignTagsToCustomer('deleted_cus', ['tag_vip_1']),
    ).rejects.toThrow(NotFoundError);
  });

  it('should throw ValidationError when a tagId belongs to a different store', async () => {
    mockCustomer.findFirst.mockResolvedValue(fakeCustomerStub);
    // Only one of the two tagIds resolves in this store.
    mockTag.findMany.mockResolvedValue([{ id: 'tag_vip_1' }]);

    await expect(
      assignTagsToCustomer('cus_abc123', ['tag_vip_1', 'tag_other_store']),
    ).rejects.toThrow(ValidationError);
    await expect(
      assignTagsToCustomer('cus_abc123', ['tag_vip_1', 'tag_other_store']),
    ).rejects.toThrow(/tag_other_store/);

    expect(mockCustomer.update).not.toHaveBeenCalled();
  });

  it('should throw ValidationError when a tagId does not exist at all', async () => {
    mockCustomer.findFirst.mockResolvedValue(fakeCustomerStub);
    mockTag.findMany.mockResolvedValue([]);

    await expect(
      assignTagsToCustomer('cus_abc123', ['ghost_tag']),
    ).rejects.toThrow(ValidationError);
  });
});

// ── removeTagFromCustomer ──────────────────────────────
describe('removeTagFromCustomer', () => {
  it('should disconnect the tag and return the updated tag list', async () => {
    mockCustomer.findFirst.mockResolvedValue(fakeCustomerStub);
    mockCustomer.update.mockResolvedValue({
      tags: [{ id: 'tag_reg_1', name: 'Regular', color: '#1E90FF' }],
    });

    const result = await removeTagFromCustomer('cus_abc123', 'tag_vip_1');

    expect(mockCustomer.update).toHaveBeenCalledWith({
      where: { id: 'cus_abc123' },
      data: { tags: { disconnect: { id: 'tag_vip_1' } } },
      select: {
        tags: { select: { id: true, name: true, color: true } },
      },
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('tag_reg_1');
  });

  it('should throw NotFoundError when the customer does not exist', async () => {
    mockCustomer.findFirst.mockResolvedValue(null);

    await expect(
      removeTagFromCustomer('nonexistent', 'tag_vip_1'),
    ).rejects.toThrow(NotFoundError);
    expect(mockCustomer.update).not.toHaveBeenCalled();
  });

  it('should be idempotent — removing an unassigned tag still resolves', async () => {
    mockCustomer.findFirst.mockResolvedValue(fakeCustomerStub);
    mockCustomer.update.mockResolvedValue({ tags: [] });

    const result = await removeTagFromCustomer('cus_abc123', 'tag_unassigned');

    expect(result).toEqual([]);
  });
});

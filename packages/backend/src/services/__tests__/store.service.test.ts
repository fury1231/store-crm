import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundError } from '../../utils/errors';

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

// Import after mock setup
import { createStore, listStores, getStoreById, updateStore, deleteStore } from '../store.service';

// ── Fixtures ───────────────────────────────────────────
const fakeStore = {
  id: 'cls_abc123',
  name: 'Test Store',
  address: '123 Main St',
  phone: '+1234567890',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  deletedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ── createStore ────────────────────────────────────────
describe('createStore', () => {
  it('should create a store with valid data', async () => {
    mockStore.create.mockResolvedValue(fakeStore);

    const result = await createStore({
      name: 'Test Store',
      address: '123 Main St',
      phone: '+1234567890',
    });

    expect(mockStore.create).toHaveBeenCalledWith({
      data: { name: 'Test Store', address: '123 Main St', phone: '+1234567890' },
    });
    expect(result).toEqual(fakeStore);
  });

  it('should create a store with name only (optional fields omitted)', async () => {
    const minimal = { ...fakeStore, address: null, phone: null };
    mockStore.create.mockResolvedValue(minimal);

    const result = await createStore({ name: 'Test Store' });

    expect(mockStore.create).toHaveBeenCalledWith({
      data: { name: 'Test Store' },
    });
    expect(result).toEqual(minimal);
  });
});

// ── listStores ─────────────────────────────────────────
describe('listStores', () => {
  it('should return paginated stores with meta', async () => {
    mockStore.count.mockResolvedValue(25);
    mockStore.findMany.mockResolvedValue([fakeStore]);

    const result = await listStores({ page: 2, limit: 10 });

    expect(mockStore.count).toHaveBeenCalledWith({ where: { deletedAt: null } });
    expect(mockStore.findMany).toHaveBeenCalledWith({
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
    expect(result.stores).toEqual([fakeStore]);
  });

  it('should use default pagination (page 1, limit 20)', async () => {
    mockStore.count.mockResolvedValue(0);
    mockStore.findMany.mockResolvedValue([]);

    const result = await listStores({ page: 1, limit: 20 });

    expect(mockStore.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 20 }),
    );
    expect(result.meta.totalPages).toBe(0);
    expect(result.stores).toEqual([]);
  });

  it('should exclude soft-deleted stores', async () => {
    mockStore.count.mockResolvedValue(0);
    mockStore.findMany.mockResolvedValue([]);

    await listStores({ page: 1, limit: 20 });

    expect(mockStore.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: null } }),
    );
  });
});

// ── getStoreById ───────────────────────────────────────
describe('getStoreById', () => {
  it('should return a store when found', async () => {
    mockStore.findFirst.mockResolvedValue(fakeStore);

    const result = await getStoreById('cls_abc123');

    expect(mockStore.findFirst).toHaveBeenCalledWith({
      where: { id: 'cls_abc123', deletedAt: null },
    });
    expect(result).toEqual(fakeStore);
  });

  it('should throw NotFoundError when store does not exist', async () => {
    mockStore.findFirst.mockResolvedValue(null);

    await expect(getStoreById('nonexistent')).rejects.toThrow(NotFoundError);
    await expect(getStoreById('nonexistent')).rejects.toThrow(
      "Store with id 'nonexistent' not found",
    );
  });

  it('should throw NotFoundError for a soft-deleted store', async () => {
    mockStore.findFirst.mockResolvedValue(null);

    await expect(getStoreById('deleted_id')).rejects.toThrow(NotFoundError);
  });
});

// ── updateStore ────────────────────────────────────────
describe('updateStore', () => {
  it('should update an existing store', async () => {
    const updated = { ...fakeStore, name: 'Updated Name' };
    mockStore.findFirst.mockResolvedValue(fakeStore);
    mockStore.update.mockResolvedValue(updated);

    const result = await updateStore('cls_abc123', { name: 'Updated Name' });

    expect(mockStore.findFirst).toHaveBeenCalledWith({
      where: { id: 'cls_abc123', deletedAt: null },
    });
    expect(mockStore.update).toHaveBeenCalledWith({
      where: { id: 'cls_abc123' },
      data: { name: 'Updated Name' },
    });
    expect(result.name).toBe('Updated Name');
  });

  it('should throw NotFoundError when updating non-existent store', async () => {
    mockStore.findFirst.mockResolvedValue(null);

    await expect(updateStore('nonexistent', { name: 'X' })).rejects.toThrow(NotFoundError);
    expect(mockStore.update).not.toHaveBeenCalled();
  });

  it('should allow setting nullable fields to null', async () => {
    const cleared = { ...fakeStore, phone: null };
    mockStore.findFirst.mockResolvedValue(fakeStore);
    mockStore.update.mockResolvedValue(cleared);

    const result = await updateStore('cls_abc123', { phone: null });

    expect(mockStore.update).toHaveBeenCalledWith({
      where: { id: 'cls_abc123' },
      data: { phone: null },
    });
    expect(result.phone).toBeNull();
  });
});

// ── deleteStore ────────────────────────────────────────
describe('deleteStore', () => {
  it('should soft-delete an existing store by setting deletedAt', async () => {
    const deleted = { ...fakeStore, deletedAt: new Date() };
    mockStore.findFirst.mockResolvedValue(fakeStore);
    mockStore.update.mockResolvedValue(deleted);

    const result = await deleteStore('cls_abc123');

    expect(mockStore.update).toHaveBeenCalledWith({
      where: { id: 'cls_abc123' },
      data: { deletedAt: expect.any(Date) },
    });
    expect(result.deletedAt).not.toBeNull();
  });

  it('should throw NotFoundError when deleting non-existent store', async () => {
    mockStore.findFirst.mockResolvedValue(null);

    await expect(deleteStore('nonexistent')).rejects.toThrow(NotFoundError);
    expect(mockStore.update).not.toHaveBeenCalled();
  });

  it('should throw NotFoundError when deleting an already-deleted store', async () => {
    mockStore.findFirst.mockResolvedValue(null);

    await expect(deleteStore('already_deleted')).rejects.toThrow(NotFoundError);
  });
});

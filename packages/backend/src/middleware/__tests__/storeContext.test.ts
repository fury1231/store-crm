import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '../../utils/errors';

// ── Mock Prisma (vi.hoisted so the mock is available before module import) ──
const mockStore = vi.hoisted(() => ({
  findFirst: vi.fn(),
}));

vi.mock('../../prismaClient', () => ({
  prisma: { store: mockStore },
}));

// Import after mock setup
import { storeContext } from '../storeContext';

// ── Helpers ──────────────────────────────────────────────
type Role = 'ADMIN' | 'MANAGER' | 'STAFF';

function buildReq(opts: {
  role?: Role;
  storeId?: string | null;
  headerStoreId?: string;
}): Request {
  const headers: Record<string, string> = {};
  if (opts.headerStoreId !== undefined) {
    headers['x-store-id'] = opts.headerStoreId;
  }
  return {
    user: opts.role
      ? {
          id: 'usr_1',
          email: 'a@b.com',
          role: opts.role,
          storeId: opts.storeId ?? null,
        }
      : undefined,
    headers,
  } as unknown as Request;
}

function runMiddleware(req: Request) {
  const res = {} as Response;
  const next: NextFunction = vi.fn();
  return { req, res, next };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Defensive: missing user ─────────────────────────────
describe('storeContext — without authenticate', () => {
  it('throws UnauthorizedError if req.user is missing', async () => {
    const { req, res, next } = runMiddleware(buildReq({}));
    await expect(storeContext(req, res, next)).rejects.toThrow(UnauthorizedError);
    expect(next).not.toHaveBeenCalled();
  });
});

// ── ADMIN behaviour ─────────────────────────────────────
describe('storeContext — ADMIN', () => {
  it('uses X-Store-Id header when it points at an existing store', async () => {
    mockStore.findFirst.mockResolvedValue({ id: 'str_target' });
    const { req, res, next } = runMiddleware(
      buildReq({ role: 'ADMIN', headerStoreId: 'str_target' }),
    );

    await storeContext(req, res, next);

    expect(mockStore.findFirst).toHaveBeenCalledWith({
      where: { id: 'str_target', deletedAt: null },
      select: { id: true },
    });
    expect(req.storeId).toBe('str_target');
    expect(req.availableStoreIds).toBe('all');
    expect(next).toHaveBeenCalledOnce();
  });

  it('rejects with NotFoundError when X-Store-Id points at a missing/deleted store', async () => {
    mockStore.findFirst.mockResolvedValue(null);
    const { req, res, next } = runMiddleware(
      buildReq({ role: 'ADMIN', headerStoreId: 'str_ghost' }),
    );

    await expect(storeContext(req, res, next)).rejects.toThrow(NotFoundError);
    expect(req.storeId).toBeUndefined();
    expect(next).not.toHaveBeenCalled();
  });

  it('defaults to the oldest non-deleted store when no header is sent', async () => {
    mockStore.findFirst.mockResolvedValue({ id: 'str_default' });
    const { req, res, next } = runMiddleware(buildReq({ role: 'ADMIN' }));

    await storeContext(req, res, next);

    expect(mockStore.findFirst).toHaveBeenCalledWith({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    expect(req.storeId).toBe('str_default');
    expect(req.availableStoreIds).toBe('all');
    expect(next).toHaveBeenCalledOnce();
  });

  it('still calls next() when no stores exist (req.storeId stays undefined)', async () => {
    // Edge case: a fresh DB with no stores. Admin endpoints like
    // POST /api/stores must still be reachable so the admin can bootstrap.
    mockStore.findFirst.mockResolvedValue(null);
    const { req, res, next } = runMiddleware(buildReq({ role: 'ADMIN' }));

    await storeContext(req, res, next);

    expect(req.storeId).toBeUndefined();
    expect(req.availableStoreIds).toBe('all');
    expect(next).toHaveBeenCalledOnce();
  });
});

// ── STAFF / MANAGER behaviour ───────────────────────────
describe.each(['STAFF', 'MANAGER'] as const)('storeContext — %s', (role) => {
  it('sets req.storeId from the user record and skips the DB lookup', async () => {
    const { req, res, next } = runMiddleware(
      buildReq({ role, storeId: 'str_assigned' }),
    );

    await storeContext(req, res, next);

    expect(mockStore.findFirst).not.toHaveBeenCalled();
    expect(req.storeId).toBe('str_assigned');
    expect(req.availableStoreIds).toEqual(['str_assigned']);
    expect(next).toHaveBeenCalledOnce();
  });

  it('throws ForbiddenError when the user has no assigned store', async () => {
    const { req, res, next } = runMiddleware(
      buildReq({ role, storeId: null }),
    );

    await expect(storeContext(req, res, next)).rejects.toThrow(ForbiddenError);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows X-Store-Id header when it matches the assigned store', async () => {
    const { req, res, next } = runMiddleware(
      buildReq({ role, storeId: 'str_assigned', headerStoreId: 'str_assigned' }),
    );

    await storeContext(req, res, next);

    expect(req.storeId).toBe('str_assigned');
    expect(next).toHaveBeenCalledOnce();
  });

  it('throws NotFoundError when X-Store-Id targets a different store (no existence leak)', async () => {
    const { req, res, next } = runMiddleware(
      buildReq({
        role,
        storeId: 'str_assigned',
        headerStoreId: 'str_other',
      }),
    );

    await expect(storeContext(req, res, next)).rejects.toThrow(NotFoundError);
    // Crucially NOT a ForbiddenError — that would leak that the store exists.
    expect(mockStore.findFirst).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});

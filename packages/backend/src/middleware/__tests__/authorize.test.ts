import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { authorize, requirePermission, permissions, type Role } from '../authorize';
import { ForbiddenError, UnauthorizedError } from '../../utils/errors';

// ── Helpers ──────────────────────────────────────────────
function buildReq(role?: Role): Request {
  return {
    user: role
      ? { id: 'usr_1', email: 'a@b.com', role, storeId: 'str_1' }
      : undefined,
  } as unknown as Request;
}

function buildRes(): Response {
  return {} as Response;
}

function runMiddleware(role: Role | undefined, allowed: Role[]) {
  const req = buildReq(role);
  const res = buildRes();
  const next: NextFunction = vi.fn();
  let thrown: unknown = null;
  try {
    authorize(...allowed)(req, res, next);
  } catch (err) {
    thrown = err;
  }
  return { next, thrown };
}

// ── authorize() factory contract ─────────────────────────
describe('authorize()', () => {
  it('throws synchronously when called with no roles', () => {
    expect(() => authorize()).toThrow(/at least one role/);
  });

  it('returns a middleware function', () => {
    const mw = authorize('ADMIN');
    expect(typeof mw).toBe('function');
    expect(mw.length).toBe(3); // (req, res, next)
  });
});

// ── Permission matrix — exhaustive role × allowed-list ──
describe('authorize() — role × allowed-list matrix', () => {
  const ALL_ROLES: Role[] = ['ADMIN', 'MANAGER', 'STAFF'];

  // Build a row for every (current role, allowed roles) combination.
  const cases: Array<{ role: Role; allowed: Role[]; shouldPass: boolean }> = [];
  for (const role of ALL_ROLES) {
    // Single-role allow lists
    for (const allowedRole of ALL_ROLES) {
      cases.push({
        role,
        allowed: [allowedRole],
        shouldPass: role === allowedRole,
      });
    }
    // ADMIN+MANAGER allow list
    cases.push({
      role,
      allowed: ['ADMIN', 'MANAGER'],
      shouldPass: role === 'ADMIN' || role === 'MANAGER',
    });
    // All roles
    cases.push({
      role,
      allowed: ALL_ROLES,
      shouldPass: true,
    });
  }

  it.each(cases)(
    'role=$role allowed=$allowed → pass=$shouldPass',
    ({ role, allowed, shouldPass }) => {
      const { next, thrown } = runMiddleware(role, allowed);
      if (shouldPass) {
        expect(thrown).toBeNull();
        expect(next).toHaveBeenCalledOnce();
      } else {
        expect(thrown).toBeInstanceOf(ForbiddenError);
        expect((thrown as ForbiddenError).statusCode).toBe(403);
        expect(next).not.toHaveBeenCalled();
      }
    },
  );
});

// ── Edge cases ───────────────────────────────────────────
describe('authorize() — edge cases', () => {
  it('throws UnauthorizedError when req.user is missing (authenticate skipped)', () => {
    const { next, thrown } = runMiddleware(undefined, ['ADMIN']);
    expect(thrown).toBeInstanceOf(UnauthorizedError);
    expect((thrown as UnauthorizedError).statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 with a message including the user role and required roles', () => {
    const req = buildReq('STAFF');
    const next: NextFunction = vi.fn();
    expect(() => authorize('ADMIN')(req, buildRes(), next)).toThrow(ForbiddenError);
    try {
      authorize('ADMIN', 'MANAGER')(req, buildRes(), next);
    } catch (err) {
      expect((err as Error).message).toContain('STAFF');
      expect((err as Error).message).toContain('ADMIN');
      expect((err as Error).message).toContain('MANAGER');
    }
  });

  it('uses FORBIDDEN error code', () => {
    const { thrown } = runMiddleware('STAFF', ['ADMIN']);
    expect((thrown as ForbiddenError).code).toBe('FORBIDDEN');
  });

  it('does not call next() on failure', () => {
    const { next } = runMiddleware('STAFF', ['ADMIN']);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() exactly once on success', () => {
    const { next } = runMiddleware('ADMIN', ['ADMIN']);
    expect(next).toHaveBeenCalledTimes(1);
  });
});

// ── Permissions matrix integrity ─────────────────────────
describe('permissions matrix', () => {
  it('has stores write restricted to ADMIN', () => {
    expect(permissions['stores:write']).toEqual(['ADMIN']);
  });

  it('allows all roles to read stores', () => {
    expect(permissions['stores:read']).toEqual(['ADMIN', 'MANAGER', 'STAFF']);
  });

  it('allows ADMIN and MANAGER to write products', () => {
    expect(permissions['products:write']).toEqual(['ADMIN', 'MANAGER']);
  });

  it('allows only ADMIN/MANAGER to manage tags but all roles to assign them', () => {
    expect(permissions['tags:write']).toEqual(['ADMIN', 'MANAGER']);
    expect(permissions['tags:assign']).toEqual(['ADMIN', 'MANAGER', 'STAFF']);
  });

  it('allows all roles to read and write customers', () => {
    expect(permissions['customers:write']).toEqual(['ADMIN', 'MANAGER', 'STAFF']);
    expect(permissions['customers:read']).toEqual(['ADMIN', 'MANAGER', 'STAFF']);
  });
});

// ── requirePermission() sugar ────────────────────────────
describe('requirePermission()', () => {
  it('STAFF cannot pass stores:write', () => {
    const req = buildReq('STAFF');
    const next: NextFunction = vi.fn();
    expect(() => requirePermission('stores:write')(req, buildRes(), next)).toThrow(
      ForbiddenError,
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('ADMIN can pass stores:write', () => {
    const req = buildReq('ADMIN');
    const next: NextFunction = vi.fn();
    requirePermission('stores:write')(req, buildRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('MANAGER can pass products:write but not stores:write', () => {
    const next1: NextFunction = vi.fn();
    const next2: NextFunction = vi.fn();
    requirePermission('products:write')(buildReq('MANAGER'), buildRes(), next1);
    expect(next1).toHaveBeenCalledOnce();

    expect(() =>
      requirePermission('stores:write')(buildReq('MANAGER'), buildRes(), next2),
    ).toThrow(ForbiddenError);
    expect(next2).not.toHaveBeenCalled();
  });

  it('STAFF can read products but cannot write them', () => {
    const next1: NextFunction = vi.fn();
    const next2: NextFunction = vi.fn();
    requirePermission('products:read')(buildReq('STAFF'), buildRes(), next1);
    expect(next1).toHaveBeenCalledOnce();

    expect(() =>
      requirePermission('products:write')(buildReq('STAFF'), buildRes(), next2),
    ).toThrow(ForbiddenError);
    expect(next2).not.toHaveBeenCalled();
  });

  it('STAFF can assign tags but cannot write tags', () => {
    const next1: NextFunction = vi.fn();
    const next2: NextFunction = vi.fn();
    requirePermission('tags:assign')(buildReq('STAFF'), buildRes(), next1);
    expect(next1).toHaveBeenCalledOnce();

    expect(() =>
      requirePermission('tags:write')(buildReq('STAFF'), buildRes(), next2),
    ).toThrow(ForbiddenError);
    expect(next2).not.toHaveBeenCalled();
  });
});

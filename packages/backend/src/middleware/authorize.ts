import { Request, Response, NextFunction } from 'express';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';

/**
 * Role identifiers used by the RBAC system. Mirrors the Prisma `Role` enum
 * but is declared locally to avoid coupling middleware to generated types
 * and to keep the permissions matrix self-contained.
 */
export type Role = 'ADMIN' | 'MANAGER' | 'STAFF';

/**
 * Permission matrix — maps a `<resource>:<action>` key to the roles allowed
 * to perform it. Editing this object is the single source of truth for RBAC.
 *
 * Resource ownership (e.g. "MANAGER can read own store") is enforced by the
 * service layer; this map only checks role-level access.
 */
export const permissions = {
  // Stores
  'stores:read': ['ADMIN', 'MANAGER', 'STAFF'],
  'stores:write': ['ADMIN'],

  // Products
  'products:read': ['ADMIN', 'MANAGER', 'STAFF'],
  'products:write': ['ADMIN', 'MANAGER'],

  // Customers — every role inside a store can manage customers
  'customers:read': ['ADMIN', 'MANAGER', 'STAFF'],
  'customers:write': ['ADMIN', 'MANAGER', 'STAFF'],

  // Tags — STAFF can read and assign to customers, but cannot CRUD tags themselves
  'tags:read': ['ADMIN', 'MANAGER', 'STAFF'],
  'tags:write': ['ADMIN', 'MANAGER'],
  'tags:assign': ['ADMIN', 'MANAGER', 'STAFF'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof permissions;

/**
 * `authorize(...roles)` — middleware factory.
 *
 * Returns Express middleware that allows the request to proceed only when
 * `req.user.role` is one of the supplied roles. Must run AFTER `authenticate`,
 * which is responsible for populating `req.user`.
 *
 * Usage:
 *   router.delete('/:id', authenticate, authorize('ADMIN', 'MANAGER'), ctrl.delete);
 */
export function authorize(...allowedRoles: Role[]) {
  if (allowedRoles.length === 0) {
    throw new Error('authorize() requires at least one role');
  }

  return function authorizeMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): void {
    if (!req.user) {
      // authenticate middleware was not run, or did not populate req.user.
      // Treat as unauthenticated rather than forbidden — the client must log in first.
      throw new UnauthorizedError('Authentication required');
    }

    if (!allowedRoles.includes(req.user.role as Role)) {
      throw new ForbiddenError(
        `Role '${req.user.role}' is not permitted to access this resource. ` +
          `Required role(s): ${allowedRoles.join(', ')}`,
      );
    }

    next();
  };
}

/**
 * `requirePermission('stores:write')` — sugar over `authorize(...)` that
 * looks up the allowed roles in the permissions matrix. Prefer this over
 * hard-coding role lists at call sites so the matrix stays the single source
 * of truth.
 *
 * Usage:
 *   router.post('/', authenticate, requirePermission('stores:write'), ctrl.create);
 */
export function requirePermission(permission: Permission) {
  const allowedRoles = permissions[permission];
  if (!allowedRoles) {
    throw new Error(`Unknown permission: ${permission}`);
  }
  // Spread is safe — readonly array narrows to Role[] for authorize().
  return authorize(...(allowedRoles as readonly Role[]));
}

import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prismaClient';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../utils/errors';

/**
 * `storeContext` — middleware that resolves the active store for the current
 * request. MUST run AFTER `authenticate`, which populates `req.user`.
 *
 * Resolution rules:
 *
 *   STAFF / MANAGER
 *     - The user MUST have a `storeId` on their record. If not → 403.
 *     - `req.storeId` is set to that store id. The `X-Store-Id` header is
 *       only honoured if it MATCHES the user's assigned store; if it points
 *       at a different store the request is rejected with 404 (existence
 *       leaks are avoided by mirroring the not-found response).
 *     - `req.availableStoreIds` is set to `[user.storeId]`.
 *
 *   ADMIN
 *     - May target any non-deleted store via the `X-Store-Id` header.
 *     - If the header is omitted, defaults to the first non-deleted store
 *       (ordered by createdAt asc) so admin requests still work without it.
 *     - If the header points at an unknown / deleted store → 404.
 *     - If no stores exist at all the request still proceeds with no
 *       `req.storeId`; downstream services should handle the absence.
 *     - `req.availableStoreIds` is set to `'all'`.
 *
 * After this middleware runs, downstream services can safely call
 * `scopedWhere(req.storeId, …)` and trust that they will only ever see
 * data the current user is permitted to access.
 */
export async function storeContext(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.user) {
    // Defensive — `authenticate` should have run first.
    throw new UnauthorizedError('Authentication required');
  }

  const headerRaw = req.headers['x-store-id'];
  const headerStoreId = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;

  if (req.user.role === 'ADMIN') {
    if (headerStoreId) {
      const store = await prisma.store.findFirst({
        where: { id: headerStoreId, deletedAt: null },
        select: { id: true },
      });
      if (!store) {
        // Admin asked for a store that does not exist (or is soft-deleted).
        throw new NotFoundError('Store', headerStoreId);
      }
      req.storeId = store.id;
    } else {
      // Default to the first store so admin tooling works without the header.
      const first = await prisma.store.findFirst({
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (first) {
        req.storeId = first.id;
      }
      // No stores yet → leave req.storeId undefined; admin-only endpoints
      // (e.g. POST /api/stores) do not need a current store anyway.
    }
    req.availableStoreIds = 'all';
    next();
    return;
  }

  // STAFF / MANAGER — must be assigned to exactly one store.
  if (!req.user.storeId) {
    throw new ForbiddenError(
      'User has no assigned store. Contact an administrator to assign one.',
    );
  }

  if (headerStoreId && headerStoreId !== req.user.storeId) {
    // Asking for a different store — return 404 to avoid leaking that the
    // store exists. Mirrors how cross-store record access is handled.
    throw new NotFoundError('Store', headerStoreId);
  }

  req.storeId = req.user.storeId;
  req.availableStoreIds = [req.user.storeId];
  next();
}

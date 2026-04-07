/**
 * Extend Express Request with authenticated user payload and the
 * store context resolved by middleware.
 *
 * - `req.user`              — populated by `authenticate` after JWT verification.
 * - `req.storeId`           — populated by `storeContext` after store resolution.
 *                              This is the active store the current request operates on.
 * - `req.availableStoreIds` — populated by `storeContext`. The list of stores the
 *                              current user is allowed to read; `'all'` for ADMIN.
 */
declare namespace Express {
  interface Request {
    user?: {
      id: string;
      email: string;
      role: import('../generated/prisma/client').Role;
      storeId: string | null;
    };
    storeId?: string;
    availableStoreIds?: string[] | 'all';
  }
}

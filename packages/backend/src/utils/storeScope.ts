/**
 * Multi-store data isolation helper.
 *
 * `scopedWhere` returns a Prisma `where` object that always carries
 * `storeId`. It is the single source of truth for store-scoped queries:
 * services should never assemble a `where` clause without funnelling it
 * through this helper. This way, forgetting to filter by store becomes
 * impossible at the call site.
 *
 *   const where = scopedWhere(req.storeId, { deletedAt: null, ... });
 *
 * @param storeId — the active store id, sourced from `req.storeId` which
 *                  was set by the `storeContext` middleware.
 * @param where   — optional additional Prisma filter conditions to merge.
 */
export function scopedWhere<T extends Record<string, unknown>>(
  storeId: string,
  where?: T,
): T & { storeId: string } {
  return { ...(where ?? ({} as T)), storeId };
}

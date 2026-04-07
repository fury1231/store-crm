import { Prisma } from '../generated/prisma/client';
import { prisma } from '../prismaClient';
import { CreateStoreInput, UpdateStoreInput } from '../validators/store.validator';
import { NotFoundError } from '../utils/errors';
import { PaginationQuery, buildPagination } from '../utils/pagination';

/** Condition that excludes soft-deleted records. */
const notDeleted = { deletedAt: null };

/**
 * Set of stores the current request may access.
 *
 *   - `'all'`        — admin context, no filter applied.
 *   - `string[]`     — staff/manager context; only the listed ids are visible.
 *
 * Mirrors the type produced by `req.availableStoreIds` (set by `storeContext`).
 */
export type StoreScope = 'all' | string[];

/** Build a Prisma `where` filter from a `StoreScope`. */
function scopeFilter(scope: StoreScope): Prisma.StoreWhereInput {
  if (scope === 'all') {
    return { ...notDeleted };
  }
  return { ...notDeleted, id: { in: scope } };
}

export async function createStore(data: CreateStoreInput) {
  return prisma.store.create({ data });
}

/**
 * List stores visible to the current user.
 *
 * @param scope — `'all'` for admin, otherwise an explicit allow-list of
 *                store ids (typically the single store the user is assigned to).
 *                Sourced from `req.availableStoreIds`.
 */
export async function listStores(query: PaginationQuery, scope: StoreScope) {
  const where = scopeFilter(scope);

  const total = await prisma.store.count({ where });
  const { skip, take, meta } = buildPagination(query, total);

  const stores = await prisma.store.findMany({
    where,
    skip,
    take,
    orderBy: { createdAt: 'desc' },
  });

  return { stores, meta };
}

/**
 * Fetch a store by id, restricted to the user's `scope`. Cross-store access
 * returns NotFoundError so the existence of unrelated stores is never leaked.
 *
 * For a fetch-by-id "scope check" reduces to "is this id in the allow-list?".
 * We short-circuit there so we never even hit the database for ids the user
 * is not permitted to see — and the response is indistinguishable from a
 * genuinely missing record.
 */
export async function getStoreById(id: string, scope: StoreScope) {
  if (scope !== 'all' && !scope.includes(id)) {
    throw new NotFoundError('Store', id);
  }

  const store = await prisma.store.findFirst({
    where: { id, ...notDeleted },
  });

  if (!store) {
    throw new NotFoundError('Store', id);
  }

  return store;
}

/**
 * Update a store. Writes are admin-only at the route layer, but we still
 * pipe a `scope` through so the service contract is uniform and adding new
 * write-capable roles in the future cannot accidentally bypass isolation.
 */
export async function updateStore(
  id: string,
  data: UpdateStoreInput,
  scope: StoreScope,
) {
  // Verify exists, not deleted, and inside the user's scope.
  await getStoreById(id, scope);

  return prisma.store.update({
    where: { id },
    data,
  });
}

export async function deleteStore(id: string, scope: StoreScope) {
  await getStoreById(id, scope);

  return prisma.store.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

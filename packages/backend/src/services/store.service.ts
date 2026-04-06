import { prisma } from '../prismaClient';
import { CreateStoreInput, UpdateStoreInput } from '../validators/store.validator';
import { NotFoundError } from '../utils/errors';
import { PaginationQuery, buildPagination } from '../utils/pagination';

/** Condition that excludes soft-deleted records. */
const notDeleted = { deletedAt: null };

export async function createStore(data: CreateStoreInput) {
  return prisma.store.create({ data });
}

export async function listStores(query: PaginationQuery) {
  const total = await prisma.store.count({ where: notDeleted });
  const { skip, take, meta } = buildPagination(query, total);

  const stores = await prisma.store.findMany({
    where: notDeleted,
    skip,
    take,
    orderBy: { createdAt: 'desc' },
  });

  return { stores, meta };
}

export async function getStoreById(id: string) {
  const store = await prisma.store.findFirst({
    where: { id, ...notDeleted },
  });

  if (!store) {
    throw new NotFoundError('Store', id);
  }

  return store;
}

export async function updateStore(id: string, data: UpdateStoreInput) {
  // Verify exists and not deleted
  await getStoreById(id);

  return prisma.store.update({
    where: { id },
    data,
  });
}

export async function deleteStore(id: string) {
  // Verify exists and not deleted
  await getStoreById(id);

  return prisma.store.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

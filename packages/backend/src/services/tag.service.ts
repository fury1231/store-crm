import { prisma } from '../prismaClient';
import {
  CreateTagInput,
  UpdateTagInput,
} from '../validators/tag.validator';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors';

/**
 * Shape of a tag as returned from the API. The internal `storeId` is
 * preserved so the frontend can verify ownership when caching.
 */
export interface TagResponse {
  id: string;
  name: string;
  color: string;
  storeId: string;
}

/**
 * Slim shape used inside `customer.tags` — the storeId is implied by
 * the customer so we omit it to keep the payload small.
 */
export interface TagSummary {
  id: string;
  name: string;
  color: string;
}

/**
 * Duck-type guard for Prisma's known unique-constraint violation. We avoid
 * importing `Prisma.PrismaClientKnownRequestError` so this module doesn't
 * hard-depend on the generated client at compile time.
 */
function isUniqueViolation(err: unknown): err is { code: 'P2002' } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'P2002'
  );
}

function toTagResponse(tag: {
  id: string;
  name: string;
  color: string;
  storeId: string;
}): TagResponse {
  return {
    id: tag.id,
    name: tag.name,
    color: tag.color,
    storeId: tag.storeId,
  };
}

/**
 * Create a new tag scoped to a store. Throws `ConflictError` if a tag
 * with the same name already exists in the store (the unique index
 * `(storeId, name)` enforces this at the DB level).
 */
export async function createTag(data: CreateTagInput): Promise<TagResponse> {
  try {
    const tag = await prisma.tag.create({ data });
    return toTagResponse(tag);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ConflictError(
        `A tag with name '${data.name}' already exists in this store`,
      );
    }
    throw err;
  }
}

/**
 * List every tag belonging to a store. Sorted by name (ascending) so
 * the UI can render a stable, predictable list without extra work.
 */
export async function listTagsByStore(storeId: string): Promise<TagResponse[]> {
  const tags = await prisma.tag.findMany({
    where: { storeId },
    orderBy: { name: 'asc' },
  });
  return tags.map(toTagResponse);
}

/**
 * Update name and/or color of an existing tag. Either field may be
 * omitted (the validator already enforces "at least one"). Throws:
 * - `NotFoundError` if the tag does not exist
 * - `ConflictError` if the new name collides with another tag in the same store
 */
export async function updateTag(
  id: string,
  data: UpdateTagInput,
): Promise<TagResponse> {
  const existing = await prisma.tag.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundError('Tag', id);
  }

  try {
    const updated = await prisma.tag.update({
      where: { id },
      data,
    });
    return toTagResponse(updated);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ConflictError(
        `A tag with name '${data.name}' already exists in this store`,
      );
    }
    throw err;
  }
}

/**
 * Delete a tag. Prisma's implicit many-to-many automatically removes
 * the corresponding rows from the `_CustomerTags` join table — customers
 * themselves are NOT touched.
 */
export async function deleteTag(id: string): Promise<void> {
  const existing = await prisma.tag.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundError('Tag', id);
  }

  await prisma.tag.delete({ where: { id } });
}

/**
 * Assign one or more tags to a customer. Validates that:
 * 1. The customer exists and is not soft-deleted.
 * 2. Every supplied tagId references a tag that belongs to the same store
 *    as the customer (cross-store assignment is rejected).
 *
 * Returns the updated customer's tags (after assignment).
 */
export async function assignTagsToCustomer(
  customerId: string,
  tagIds: string[],
): Promise<TagSummary[]> {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, deletedAt: null },
    select: { id: true, storeId: true },
  });
  if (!customer) {
    throw new NotFoundError('Customer', customerId);
  }

  // Deduplicate tagIds so a malicious or sloppy client can't bloat the query.
  const uniqueTagIds = Array.from(new Set(tagIds));

  // Verify every tag exists AND belongs to the customer's store.
  const tagsInStore = await prisma.tag.findMany({
    where: { id: { in: uniqueTagIds }, storeId: customer.storeId },
    select: { id: true },
  });

  if (tagsInStore.length !== uniqueTagIds.length) {
    const foundIds = new Set(tagsInStore.map((t) => t.id));
    const missing = uniqueTagIds.filter((id) => !foundIds.has(id));
    throw new ValidationError(
      `One or more tags do not exist in this store: ${missing.join(', ')}`,
    );
  }

  const updated = await prisma.customer.update({
    where: { id: customerId },
    data: {
      tags: { connect: uniqueTagIds.map((id) => ({ id })) },
    },
    select: {
      tags: { select: { id: true, name: true, color: true } },
    },
  });

  return updated.tags;
}

/**
 * Remove a single tag from a customer. Idempotent: removing a tag that
 * isn't assigned succeeds silently (Prisma `disconnect` is a no-op in
 * that case). Returns the updated tag list.
 */
export async function removeTagFromCustomer(
  customerId: string,
  tagId: string,
): Promise<TagSummary[]> {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, deletedAt: null },
    select: { id: true },
  });
  if (!customer) {
    throw new NotFoundError('Customer', customerId);
  }

  const updated = await prisma.customer.update({
    where: { id: customerId },
    data: {
      tags: { disconnect: { id: tagId } },
    },
    select: {
      tags: { select: { id: true, name: true, color: true } },
    },
  });

  return updated.tags;
}

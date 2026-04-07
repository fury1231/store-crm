import { Prisma } from '../generated/prisma/client';
import { prisma } from '../prismaClient';
import {
  CreateCustomerInput,
  UpdateCustomerInput,
  ListCustomersQuery,
} from '../validators/customer.validator';
import { NotFoundError } from '../utils/errors';
import { buildPagination } from '../utils/pagination';
import { scopedWhere } from '../utils/storeScope';

/** Condition that excludes soft-deleted records. */
const notDeleted = { deletedAt: null };

/**
 * Shape of a customer as returned from the API. Tags are always
 * included (empty until the tagging system is built in a later
 * milestone) so API consumers can rely on the field existing.
 */
export interface CustomerResponse {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  storeId: string;
  createdAt: Date;
  updatedAt: Date;
  tags: never[];
}

/** Warning shape returned when a potential duplicate is detected. */
export interface DuplicateWarning {
  field: 'phone' | 'email';
  value: string;
  existingCustomerId: string;
  message: string;
}

/**
 * Attach an empty `tags: []` to a raw Prisma customer object.
 * Strips `deletedAt` so internal fields do not leak through the API.
 */
function toCustomerResponse<T extends { deletedAt?: Date | null }>(
  customer: T,
): CustomerResponse {
  const { deletedAt: _deletedAt, ...rest } = customer;
  return { ...(rest as unknown as Omit<CustomerResponse, 'tags'>), tags: [] };
}

/**
 * Check whether a phone or email already exists for a customer in
 * the given store. Returns a warning for each collision (not an error).
 *
 * @param excludeId — optionally exclude a customer id (used by update so a
 *                    customer is not flagged as a duplicate of itself).
 */
export async function checkDuplicates(
  storeId: string,
  fields: { phone?: string | null; email?: string | null },
  excludeId?: string,
): Promise<DuplicateWarning[]> {
  const warnings: DuplicateWarning[] = [];

  if (fields.phone) {
    const existing = await prisma.customer.findFirst({
      where: {
        storeId,
        phone: fields.phone,
        ...notDeleted,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      warnings.push({
        field: 'phone',
        value: fields.phone,
        existingCustomerId: existing.id,
        message: `A customer with phone '${fields.phone}' already exists in this store`,
      });
    }
  }

  if (fields.email) {
    const existing = await prisma.customer.findFirst({
      where: {
        storeId,
        email: fields.email,
        ...notDeleted,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      warnings.push({
        field: 'email',
        value: fields.email,
        existingCustomerId: existing.id,
        message: `A customer with email '${fields.email}' already exists in this store`,
      });
    }
  }

  return warnings;
}

/**
 * Create a customer inside a specific store.
 *
 * `storeId` is sourced from `req.storeId` (set by `storeContext` middleware),
 * NOT from the request body — clients cannot inject a foreign store id.
 */
export async function createCustomer(
  storeId: string,
  data: CreateCustomerInput,
): Promise<{ customer: CustomerResponse; warnings: DuplicateWarning[] }> {
  const warnings = await checkDuplicates(storeId, {
    phone: data.phone,
    email: data.email,
  });

  const customer = await prisma.customer.create({
    data: { ...data, storeId },
  });
  return { customer: toCustomerResponse(customer), warnings };
}

/**
 * List customers, scoped to the active store. The `storeId` argument is
 * required so it is impossible to forget the filter at the call site.
 */
export async function listCustomers(
  storeId: string,
  query: ListCustomersQuery,
) {
  const { search, sortBy, order } = query;

  // Build a Prisma where clause anchored on `storeId`. Using `scopedWhere`
  // means the storeId filter is always present — search/soft-delete are
  // additional, narrowing conditions on top of it.
  const where: Prisma.CustomerWhereInput = scopedWhere(storeId, {
    deletedAt: null,
  });
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }

  const total = await prisma.customer.count({ where });
  const { skip, take, meta } = buildPagination(query, total);

  const customers = await prisma.customer.findMany({
    where,
    skip,
    take,
    orderBy: { [sortBy]: order },
  });

  return {
    customers: customers.map(toCustomerResponse),
    meta,
  };
}

/**
 * Fetch a single customer by id, scoped to a store. Cross-store access
 * returns NotFoundError (404) — not 403 — so existence cannot be probed.
 */
export async function getCustomerById(
  storeId: string,
  id: string,
): Promise<CustomerResponse> {
  const customer = await prisma.customer.findFirst({
    where: scopedWhere(storeId, { id, ...notDeleted }),
  });

  if (!customer) {
    throw new NotFoundError('Customer', id);
  }

  return toCustomerResponse(customer);
}

export async function updateCustomer(
  storeId: string,
  id: string,
  data: UpdateCustomerInput,
): Promise<{ customer: CustomerResponse; warnings: DuplicateWarning[] }> {
  // Fetch the existing customer (verifies it exists, is not deleted,
  // AND lives inside the active store).
  const existing = await prisma.customer.findFirst({
    where: scopedWhere(storeId, { id, ...notDeleted }),
  });

  if (!existing) {
    throw new NotFoundError('Customer', id);
  }

  // Only check for duplicates on fields that are actually being changed
  // to a non-null value — clearing a field to null can never collide.
  const duplicateCheck: { phone?: string; email?: string } = {};
  if (typeof data.phone === 'string' && data.phone !== existing.phone) {
    duplicateCheck.phone = data.phone;
  }
  if (typeof data.email === 'string' && data.email !== existing.email) {
    duplicateCheck.email = data.email;
  }

  const warnings =
    Object.keys(duplicateCheck).length > 0
      ? await checkDuplicates(storeId, duplicateCheck, id)
      : [];

  const updated = await prisma.customer.update({
    where: { id },
    data,
  });

  return { customer: toCustomerResponse(updated), warnings };
}

export async function deleteCustomer(
  storeId: string,
  id: string,
): Promise<void> {
  const existing = await prisma.customer.findFirst({
    where: scopedWhere(storeId, { id, ...notDeleted }),
  });

  if (!existing) {
    throw new NotFoundError('Customer', id);
  }

  await prisma.customer.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

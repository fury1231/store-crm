import { Prisma } from '../generated/prisma/client';
import { prisma } from '../prismaClient';
import {
  CreateCustomerInput,
  UpdateCustomerInput,
  ListCustomersQuery,
} from '../validators/customer.validator';
import { NotFoundError } from '../utils/errors';
import { buildPagination } from '../utils/pagination';

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

export async function createCustomer(
  data: CreateCustomerInput,
): Promise<{ customer: CustomerResponse; warnings: DuplicateWarning[] }> {
  const warnings = await checkDuplicates(data.storeId, {
    phone: data.phone,
    email: data.email,
  });

  const customer = await prisma.customer.create({ data });
  return { customer: toCustomerResponse(customer), warnings };
}

export async function listCustomers(query: ListCustomersQuery) {
  const { search, sortBy, order, storeId } = query;

  // Build the where clause: always exclude soft-deleted, optionally
  // filter by store, and optionally apply a case-insensitive search
  // across name, phone, and email. Typed as Prisma.CustomerWhereInput
  // so typos in field names fail at compile time rather than silently
  // becoming runtime no-ops.
  const where: Prisma.CustomerWhereInput = { deletedAt: null };
  if (storeId) {
    where.storeId = storeId;
  }
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

export async function getCustomerById(id: string): Promise<CustomerResponse> {
  const customer = await prisma.customer.findFirst({
    where: { id, ...notDeleted },
  });

  if (!customer) {
    throw new NotFoundError('Customer', id);
  }

  return toCustomerResponse(customer);
}

export async function updateCustomer(
  id: string,
  data: UpdateCustomerInput,
): Promise<{ customer: CustomerResponse; warnings: DuplicateWarning[] }> {
  // Fetch the existing customer (also verifies it exists and is not deleted).
  const existing = await prisma.customer.findFirst({
    where: { id, ...notDeleted },
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
      ? await checkDuplicates(existing.storeId, duplicateCheck, id)
      : [];

  const updated = await prisma.customer.update({
    where: { id },
    data,
  });

  return { customer: toCustomerResponse(updated), warnings };
}

export async function deleteCustomer(id: string): Promise<void> {
  const existing = await prisma.customer.findFirst({
    where: { id, ...notDeleted },
  });

  if (!existing) {
    throw new NotFoundError('Customer', id);
  }

  await prisma.customer.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

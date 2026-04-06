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

export interface DuplicateWarning {
  field: 'phone' | 'email';
  message: string;
}

/**
 * Check for duplicate phone or email within the same store.
 * Returns warnings (not hard blocks) per the spec.
 */
export async function checkDuplicates(
  storeId: string,
  phone?: string | null,
  email?: string | null,
  excludeId?: string,
): Promise<DuplicateWarning[]> {
  const warnings: DuplicateWarning[] = [];

  if (phone) {
    const existing = await prisma.customer.findFirst({
      where: {
        storeId,
        phone,
        ...notDeleted,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (existing) {
      warnings.push({
        field: 'phone',
        message: `A customer with phone '${phone}' already exists in this store`,
      });
    }
  }

  if (email) {
    const existing = await prisma.customer.findFirst({
      where: {
        storeId,
        email,
        ...notDeleted,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (existing) {
      warnings.push({
        field: 'email',
        message: `A customer with email '${email}' already exists in this store`,
      });
    }
  }

  return warnings;
}

export async function createCustomer(data: CreateCustomerInput) {
  const warnings = await checkDuplicates(data.storeId, data.phone, data.email);

  const customer = await prisma.customer.create({
    data,
  });

  return { customer: { ...customer, tags: [] }, warnings };
}

export async function listCustomers(query: ListCustomersQuery) {
  const { page, limit, search, sortBy, order, storeId } = query;

  // Build where clause
  const where: Record<string, unknown> = { ...notDeleted };

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
  const { skip, take, meta } = buildPagination({ page, limit }, total);

  const customers = await prisma.customer.findMany({
    where,
    skip,
    take,
    orderBy: { [sortBy]: order },
  });

  // Append empty tags array to each customer
  const customersWithTags = customers.map((c) => ({ ...c, tags: [] }));

  return { customers: customersWithTags, meta };
}

export async function getCustomerById(id: string) {
  const customer = await prisma.customer.findFirst({
    where: { id, ...notDeleted },
  });

  if (!customer) {
    throw new NotFoundError('Customer', id);
  }

  return { ...customer, tags: [] };
}

export async function updateCustomer(id: string, data: UpdateCustomerInput) {
  // Verify exists and not deleted
  const existing = await getCustomerById(id);

  // Check duplicates for the updated fields
  const warnings = await checkDuplicates(
    existing.storeId,
    data.phone !== undefined ? data.phone : undefined,
    data.email !== undefined ? data.email : undefined,
    id,
  );

  const customer = await prisma.customer.update({
    where: { id },
    data,
  });

  return { customer: { ...customer, tags: [] }, warnings };
}

export async function deleteCustomer(id: string) {
  // Verify exists and not deleted
  await getCustomerById(id);

  return prisma.customer.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

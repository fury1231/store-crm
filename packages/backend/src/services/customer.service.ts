import { Prisma } from '../generated/prisma/client';
import { prisma } from '../prismaClient';
import {
  CreateCustomerInput,
  UpdateCustomerInput,
  ListCustomersQuery,
  ExportCustomersQuery,
} from '../validators/customer.validator';
import { NotFoundError } from '../utils/errors';
import { buildPagination } from '../utils/pagination';
import { toCsv, CsvColumn } from '../utils/csv';

/** Condition that excludes soft-deleted records. */
const notDeleted = { deletedAt: null };

/**
 * Hard cap on rows returned by the CSV export endpoint. Prevents a single
 * filter-less export from pulling unbounded rows into memory. 10k rows ≈
 * ~2 MB of CSV for a typical customer record, which is safe to hold in
 * memory and send as a single response.
 */
const CSV_EXPORT_MAX_ROWS = 10_000;

/**
 * Shape of a tag as it appears inside a customer response — slim, no
 * `storeId` because the customer already carries that.
 */
export interface CustomerTag {
  id: string;
  name: string;
  color: string;
}

/**
 * Shape of a customer as returned from the API. The `tags` field is
 * always present so consumers can rely on it; it is empty for create
 * / update responses (which don't fetch the relation) and populated
 * for `listCustomers` and `getCustomerById` (which do).
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
  tags: CustomerTag[];
}

/** Warning shape returned when a potential duplicate is detected. */
export interface DuplicateWarning {
  field: 'phone' | 'email';
  value: string;
  existingCustomerId: string;
  message: string;
}

/**
 * Normalise a raw Prisma customer object into the API response shape.
 * Strips `deletedAt` so internal fields do not leak through the API
 * and ensures `tags` is always an array (defaulting to `[]` when the
 * caller did not include the relation).
 */
function toCustomerResponse<
  T extends { deletedAt?: Date | null; tags?: CustomerTag[] },
>(customer: T): CustomerResponse {
  const { deletedAt: _deletedAt, tags, ...rest } = customer;
  return {
    ...(rest as unknown as Omit<CustomerResponse, 'tags'>),
    tags: tags ?? [],
  };
}

// ─────────────────────────────────────────────────────────────
//  Composable where-clause builder
// ─────────────────────────────────────────────────────────────

/**
 * Subset of the list/export query relevant to filtering — every field
 * the where-builder understands. Shared by the list endpoint and the
 * CSV export endpoint so they honour the exact same filter semantics.
 */
export type CustomerFilters = Pick<
  ListCustomersQuery,
  | 'search'
  | 'storeId'
  | 'email'
  | 'phone'
  | 'tagId'
  | 'tags'
  | 'group'
  | 'createdAfter'
  | 'createdBefore'
>;

/**
 * Build a `Prisma.CustomerWhereInput` from the parsed filter query.
 *
 * Each filter is added independently to an `AND` array so composition
 * is associative and commutative — the order in which filters are
 * supplied has no effect on the generated query. Empty filters produce
 * no clause, so `buildCustomerWhere({})` is equivalent to "all non-
 * deleted customers".
 *
 * Tag filtering: `tagId`, `tags` (name list), and `group` (single name)
 * are combined with OR within the tag subquery. That is, passing
 * `tagId=abc&tags=vip,regular` matches customers that have **any** of
 * those tags. This matches intuitive user expectation of "show me
 * VIPs and Regulars and that one tagged customer".
 */
export function buildCustomerWhere(
  filters: CustomerFilters,
): Prisma.CustomerWhereInput {
  const and: Prisma.CustomerWhereInput[] = [{ deletedAt: null }];

  if (filters.storeId) {
    and.push({ storeId: filters.storeId });
  }

  if (filters.search) {
    and.push({
      OR: [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { phone: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
      ],
    });
  }

  if (filters.email) {
    and.push({ email: { contains: filters.email, mode: 'insensitive' } });
  }

  if (filters.phone) {
    and.push({ phone: { contains: filters.phone, mode: 'insensitive' } });
  }

  // Collect tag filters into a single `tags: { some: { OR: [...] } }`
  // so the SQL planner issues a single EXISTS subquery rather than
  // one per tag filter.
  const tagOr: Prisma.TagWhereInput[] = [];
  if (filters.tagId) {
    tagOr.push({ id: filters.tagId });
  }
  const tagNames = new Set<string>();
  if (filters.tags) {
    for (const name of filters.tags) tagNames.add(name);
  }
  if (filters.group) {
    tagNames.add(filters.group);
  }
  if (tagNames.size > 0) {
    // Case-insensitive match so `?tags=vip` still matches a seed tag named
    // `VIP`. Every other string filter in this builder uses `mode: 'insensitive'`;
    // tag names should not be the lone exception. Prisma's `in` operator on
    // Postgres is case-sensitive by default, so this is load-bearing.
    tagOr.push({ name: { in: Array.from(tagNames), mode: 'insensitive' } });
  }
  if (tagOr.length > 0) {
    and.push({
      tags: {
        some: tagOr.length === 1 ? tagOr[0] : { OR: tagOr },
      },
    });
  }

  if (filters.createdAfter || filters.createdBefore) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (filters.createdAfter) createdAt.gte = filters.createdAfter;
    if (filters.createdBefore) createdAt.lte = filters.createdBefore;
    and.push({ createdAt });
  }

  // Flatten single-clause AND for readability in tests and query logs.
  if (and.length === 1) return and[0];
  return { AND: and };
}

// ─────────────────────────────────────────────────────────────
//  Duplicate detection
// ─────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────
//  CRUD
// ─────────────────────────────────────────────────────────────

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
  const { sortBy, order } = query;
  const where = buildCustomerWhere(query);

  const total = await prisma.customer.count({ where });
  const { skip, take, meta } = buildPagination(query, total);

  // Intentionally do NOT `include: { tags }` here — the list endpoint has
  // always returned `tags: []` per `patterns.md`, and filter semantics work
  // purely through the `where` clause (`{ tags: { some: { ... } } }`). Only
  // `getCustomerById` and `exportCustomersCsv` populate tags. This keeps the
  // list query fast (no join against `_CustomerToTag`) and preserves the
  // pre-existing API shape for the list response.
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
    include: {
      tags: { select: { id: true, name: true, color: true } },
    },
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

// ─────────────────────────────────────────────────────────────
//  CSV export
// ─────────────────────────────────────────────────────────────

/**
 * CSV columns exported by `GET /api/customers/export`. Order matters —
 * this is the exact header row users will see. Dates are rendered as
 * ISO-8601 strings so spreadsheets can parse them reliably.
 */
const CSV_COLUMNS: CsvColumn<CustomerResponse>[] = [
  { header: 'name', get: (c) => c.name },
  { header: 'phone', get: (c) => c.phone },
  { header: 'email', get: (c) => c.email },
  { header: 'address', get: (c) => c.address },
  // Tags flattened as a pipe-separated list so the column stays a single
  // value (semicolons are common CSV separators in some locales; pipes
  // are unambiguous and readable).
  {
    header: 'tags',
    get: (c) => c.tags.map((t) => t.name).join('|'),
  },
  {
    header: 'createdAt',
    get: (c) =>
      c.createdAt instanceof Date
        ? c.createdAt.toISOString()
        : new Date(c.createdAt as unknown as string).toISOString(),
  },
];

/**
 * Export customers matching the same filters as the list endpoint as
 * a CSV string. The result is capped at `CSV_EXPORT_MAX_ROWS` to prevent
 * unbounded memory usage; callers hitting the cap should apply stricter
 * filters (or we can add streaming in a later iteration if needed).
 *
 * Returns the serialised CSV body plus the number of rows exported so
 * the controller can log/telemetry the export size.
 */
export async function exportCustomersCsv(
  query: ExportCustomersQuery,
): Promise<{ csv: string; rowCount: number }> {
  const where = buildCustomerWhere(query);
  const customers = await prisma.customer.findMany({
    where,
    orderBy: { [query.sortBy]: query.order },
    take: CSV_EXPORT_MAX_ROWS,
    include: {
      tags: { select: { id: true, name: true, color: true } },
    },
  });

  const responses = customers.map(toCustomerResponse);
  const csv = toCsv(responses, CSV_COLUMNS);
  return { csv, rowCount: responses.length };
}

import { z } from 'zod';

/**
 * Phone: digits, spaces, dashes, parens, and an optional leading '+'.
 * Minimum 7 characters, maximum 20.  Mirrors the store validator.
 */
const phoneRegex = /^[+]?[\d\s()-]{7,20}$/;

export const createCustomerSchema = z.object({
  name: z.string().trim().min(1, 'Customer name is required').max(200),
  phone: z
    .string()
    .trim()
    .regex(phoneRegex, 'Invalid phone format')
    .optional(),
  email: z.string().trim().email('Invalid email format').max(254).optional(),
  address: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(10_000).optional(),
  storeId: z.string().trim().min(1, 'storeId is required'),
});

export const updateCustomerSchema = z.object({
  name: z.string().trim().min(1, 'Customer name is required').max(200).optional(),
  phone: z
    .string()
    .trim()
    .regex(phoneRegex, 'Invalid phone format')
    .nullable()
    .optional(),
  email: z
    .string()
    .trim()
    .email('Invalid email format')
    .max(254)
    .nullable()
    .optional(),
  address: z.string().trim().max(500).nullable().optional(),
  notes: z.string().trim().max(10_000).nullable().optional(),
});

/**
 * Helper: parse a comma-separated string into a trimmed, de-duplicated,
 * non-empty array. Returns `undefined` if the input is empty or only
 * whitespace/commas so downstream code can treat "no filter" uniformly.
 *
 * @example
 *   "vip,regular,,vip" → ["vip", "regular"]
 *   "  " → undefined
 */
function parseCsvList(value: unknown): string[] | undefined {
  if (typeof value !== 'string') return undefined;
  const parts = value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) return undefined;
  return Array.from(new Set(parts));
}

/**
 * Query parameters for `GET /api/customers` and `GET /api/customers/export`.
 *
 * The schema supports:
 *  - Pagination (`page`, `limit`) — ignored by the export endpoint.
 *  - Multi-field fuzzy search (`search`) across name/phone/email.
 *  - Field-specific filters (`email`, `phone`) — case-insensitive `contains`.
 *  - Tag filtering by id (`tagId`) or by comma-separated names (`tags`).
 *  - Customer "group" (`group`) — aliased to a single tag-name filter
 *    since the schema has no separate `group` column. Combining `tags`
 *    and `group` unions the names (OR).
 *  - Date-range filter on `createdAt` via `createdAfter` / `createdBefore`.
 *  - Sort and store scoping.
 *
 * All filters are optional and composed with AND logic in the service.
 */
export const listCustomersQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().min(1).max(200).optional(),
    sortBy: z.enum(['name', 'createdAt', 'updatedAt']).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
    storeId: z.string().trim().min(1).optional(),
    // Field-specific filters (in addition to `search`).
    email: z.string().trim().min(1).max(254).optional(),
    phone: z.string().trim().min(1).max(20).optional(),
    // Tag filters.
    tagId: z.string().trim().min(1).optional(),
    tags: z
      .string()
      .optional()
      .transform(parseCsvList)
      .pipe(z.array(z.string().min(1)).optional()),
    // Alias for a single-tag-name filter. Merged with `tags`.
    group: z.string().trim().min(1).max(100).optional(),
    // Date range on createdAt. Use `z.coerce.date` so ISO strings are
    // accepted from query params and invalid values are rejected with 400.
    createdAfter: z.coerce.date().optional(),
    createdBefore: z.coerce.date().optional(),
  })
  .refine(
    (q) =>
      !q.createdAfter ||
      !q.createdBefore ||
      q.createdAfter.getTime() <= q.createdBefore.getTime(),
    {
      message: 'createdAfter must be before or equal to createdBefore',
      path: ['createdAfter'],
    },
  );

/**
 * Query parameters for `GET /api/customers/export`.
 *
 * Extends the list query with a `format` discriminator. Pagination on
 * export is not meaningful, but we still accept `limit` (capped separately
 * in the service to prevent OOM on full-store exports).
 */
export const exportCustomersQuerySchema = z
  .object({
    format: z.enum(['csv']).default('csv'),
    search: z.string().trim().min(1).max(200).optional(),
    storeId: z.string().trim().min(1).optional(),
    email: z.string().trim().min(1).max(254).optional(),
    phone: z.string().trim().min(1).max(20).optional(),
    tagId: z.string().trim().min(1).optional(),
    tags: z
      .string()
      .optional()
      .transform(parseCsvList)
      .pipe(z.array(z.string().min(1)).optional()),
    group: z.string().trim().min(1).max(100).optional(),
    createdAfter: z.coerce.date().optional(),
    createdBefore: z.coerce.date().optional(),
    sortBy: z.enum(['name', 'createdAt', 'updatedAt']).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .refine(
    (q) =>
      !q.createdAfter ||
      !q.createdBefore ||
      q.createdAfter.getTime() <= q.createdBefore.getTime(),
    {
      message: 'createdAfter must be before or equal to createdBefore',
      path: ['createdAfter'],
    },
  );

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
export type ExportCustomersQuery = z.infer<typeof exportCustomersQuerySchema>;

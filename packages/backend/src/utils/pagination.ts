import { z } from 'zod';

/**
 * Zod schema for pagination query parameters.
 * Defaults: page=1, limit=20.  Max limit capped at 100.
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationQuery = z.infer<typeof paginationSchema>;

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Build pagination meta and Prisma skip/take from parsed query params.
 */
export function buildPagination(query: PaginationQuery, total: number) {
  const { page, limit } = query;
  const skip = (page - 1) * limit;

  const meta: PaginationMeta = {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };

  return { skip, take: limit, meta };
}

import { z } from 'zod';

/**
 * Phone: digits, spaces, dashes, parens, and an optional leading '+'.
 * Minimum 7 characters, maximum 20.  Mirrors the store validator.
 */
const phoneRegex = /^[+]?[\d\s()-]{7,20}$/;

/**
 * `storeId` is intentionally NOT part of the request body — it is supplied
 * by the `storeContext` middleware (`req.storeId`) and applied at the
 * service layer. Letting clients pass it would re-introduce cross-store
 * IDOR exposure.
 */
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
 * Query parameters for `GET /api/customers`.
 * Pagination + optional search + optional sort. Note that `storeId` is
 * NOT a query parameter — listings are always scoped to the active store
 * via the `storeContext` middleware.
 */
export const listCustomersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(200).optional(),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;

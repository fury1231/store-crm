import { z } from 'zod';

/**
 * Phone: optional, but if provided must be a reasonable phone format.
 * Reuses the same regex pattern as store validator.
 */
const phoneRegex = /^[+]?[\d\s()-]{7,20}$/;

export const createCustomerSchema = z.object({
  name: z.string().trim().min(1, 'Customer name is required').max(200),
  phone: z
    .string()
    .trim()
    .regex(phoneRegex, 'Invalid phone format')
    .optional(),
  email: z
    .string()
    .trim()
    .email('Invalid email format')
    .max(254)
    .optional(),
  address: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(5000).optional(),
  storeId: z.string().trim().min(1, 'Store ID is required'),
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
  notes: z.string().trim().max(5000).nullable().optional(),
});

/**
 * Query params for listing customers.
 * Extends pagination with search and sort capabilities.
 */
export const listCustomersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  sortBy: z.enum(['name', 'email', 'phone', 'createdAt']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  storeId: z.string().trim().min(1).optional(),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type ListCustomersQuery = z.infer<typeof listCustomersSchema>;

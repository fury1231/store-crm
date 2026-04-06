import { z } from 'zod';

/**
 * Phone: optional, but if provided must be a reasonable phone format.
 * Allows digits, spaces, dashes, parens, plus sign.  Min 7 chars.
 */
const phoneRegex = /^[+]?[\d\s()-]{7,20}$/;

export const createStoreSchema = z.object({
  name: z.string().trim().min(1, 'Store name is required').max(200),
  address: z.string().trim().max(500).optional(),
  phone: z
    .string()
    .trim()
    .regex(phoneRegex, 'Invalid phone format')
    .optional(),
});

export const updateStoreSchema = z.object({
  name: z.string().trim().min(1, 'Store name is required').max(200).optional(),
  address: z.string().trim().max(500).nullable().optional(),
  phone: z
    .string()
    .trim()
    .regex(phoneRegex, 'Invalid phone format')
    .nullable()
    .optional(),
});

export type CreateStoreInput = z.infer<typeof createStoreSchema>;
export type UpdateStoreInput = z.infer<typeof updateStoreSchema>;

import { z } from 'zod';

/**
 * Tag color must be a 6-digit hex string in the form `#RRGGBB`.
 * Shorthand (#FFF) and named colors are rejected on purpose so the
 * frontend never has to disambiguate.
 */
const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;

export const createTagSchema = z.object({
  name: z.string().trim().min(1, 'Tag name is required').max(50, 'Tag name must be 50 characters or fewer'),
  color: z
    .string()
    .trim()
    .regex(hexColorRegex, 'Color must be a hex string in the form #RRGGBB'),
  storeId: z.string().trim().min(1, 'storeId is required'),
});

export const updateTagSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Tag name is required')
      .max(50, 'Tag name must be 50 characters or fewer')
      .optional(),
    color: z
      .string()
      .trim()
      .regex(hexColorRegex, 'Color must be a hex string in the form #RRGGBB')
      .optional(),
  })
  .refine((data) => data.name !== undefined || data.color !== undefined, {
    message: 'At least one of name or color must be provided',
  });

/**
 * Body shape for `POST /api/customers/:id/tags` — assign one or more
 * existing tags to a customer. tagIds must be a non-empty array of
 * non-empty strings; the service verifies they exist and belong to
 * the customer's store.
 */
export const assignTagsSchema = z.object({
  tagIds: z
    .array(z.string().trim().min(1, 'tagId must be non-empty'))
    .min(1, 'At least one tagId is required'),
});

/**
 * Query parameters for `GET /api/tags` — store-scoped listing.
 */
export const listTagsQuerySchema = z.object({
  storeId: z.string().trim().min(1, 'storeId is required'),
});

export type CreateTagInput = z.infer<typeof createTagSchema>;
export type UpdateTagInput = z.infer<typeof updateTagSchema>;
export type AssignTagsInput = z.infer<typeof assignTagsSchema>;
export type ListTagsQuery = z.infer<typeof listTagsQuerySchema>;

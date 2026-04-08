import { Request, Response } from 'express';
import * as tagService from '../services/tag.service';
import {
  createTagSchema,
  updateTagSchema,
  assignTagsSchema,
  listTagsQuerySchema,
} from '../validators/tag.validator';
import { ValidationError } from '../utils/errors';

export async function create(req: Request, res: Response): Promise<void> {
  const parsed = createTagSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError('Invalid input', parsed.error.flatten().fieldErrors);
  }

  const tag = await tagService.createTag(parsed.data);
  res.status(201).json({ data: tag });
}

export async function list(req: Request, res: Response): Promise<void> {
  const parsed = listTagsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid query parameters',
      parsed.error.flatten().fieldErrors,
    );
  }

  const tags = await tagService.listTagsByStore(parsed.data.storeId);
  res.json({ data: tags });
}

export async function update(req: Request, res: Response): Promise<void> {
  const parsed = updateTagSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError('Invalid input', parsed.error.flatten().fieldErrors);
  }

  const tag = await tagService.updateTag(req.params.id, parsed.data);
  res.json({ data: tag });
}

export async function remove(req: Request, res: Response): Promise<void> {
  await tagService.deleteTag(req.params.id);
  res.status(204).send();
}

// ── Customer-tag assignment endpoints ─────────────────

export async function assignToCustomer(req: Request, res: Response): Promise<void> {
  const parsed = assignTagsSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError('Invalid input', parsed.error.flatten().fieldErrors);
  }

  const tags = await tagService.assignTagsToCustomer(
    req.params.id,
    parsed.data.tagIds,
  );
  res.status(200).json({ data: { tags } });
}

export async function removeFromCustomer(
  req: Request,
  res: Response,
): Promise<void> {
  const tags = await tagService.removeTagFromCustomer(
    req.params.id,
    req.params.tagId,
  );
  res.status(200).json({ data: { tags } });
}

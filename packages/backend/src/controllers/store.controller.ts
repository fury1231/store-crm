import { Request, Response } from 'express';
import * as storeService from '../services/store.service';
import { createStoreSchema, updateStoreSchema } from '../validators/store.validator';
import { paginationSchema } from '../utils/pagination';
import { ValidationError } from '../utils/errors';

export async function create(req: Request, res: Response): Promise<void> {
  const parsed = createStoreSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError('Invalid input', parsed.error.flatten().fieldErrors);
  }

  const store = await storeService.createStore(parsed.data);
  res.status(201).json({ data: store });
}

export async function list(req: Request, res: Response): Promise<void> {
  const parsed = paginationSchema.safeParse(req.query);
  if (!parsed.success) {
    throw new ValidationError('Invalid query parameters', parsed.error.flatten().fieldErrors);
  }

  const { stores, meta } = await storeService.listStores(parsed.data);
  res.json({ data: stores, meta });
}

export async function getById(req: Request, res: Response): Promise<void> {
  const store = await storeService.getStoreById(req.params.id);
  res.json({ data: store });
}

export async function update(req: Request, res: Response): Promise<void> {
  const parsed = updateStoreSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError('Invalid input', parsed.error.flatten().fieldErrors);
  }

  const store = await storeService.updateStore(req.params.id, parsed.data);
  res.json({ data: store });
}

export async function remove(req: Request, res: Response): Promise<void> {
  await storeService.deleteStore(req.params.id);
  res.status(204).send();
}

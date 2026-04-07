import { Request, Response } from 'express';
import * as storeService from '../services/store.service';
import { createStoreSchema, updateStoreSchema } from '../validators/store.validator';
import { paginationSchema } from '../utils/pagination';
import { ValidationError, ForbiddenError } from '../utils/errors';

/**
 * Pull `availableStoreIds` off the request, defaulting to a deny-all
 * empty list when missing rather than `'all'`. This is fail-closed:
 * if the `storeContext` middleware was somehow not run, store reads
 * return nothing instead of leaking data.
 */
function requireScope(req: Request): storeService.StoreScope {
  if (!req.availableStoreIds) {
    throw new ForbiddenError('No store scope on request');
  }
  return req.availableStoreIds;
}

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

  const scope = requireScope(req);
  const { stores, meta } = await storeService.listStores(parsed.data, scope);
  res.json({ data: stores, meta });
}

export async function getById(req: Request, res: Response): Promise<void> {
  const scope = requireScope(req);
  const store = await storeService.getStoreById(req.params.id, scope);
  res.json({ data: store });
}

export async function update(req: Request, res: Response): Promise<void> {
  const parsed = updateStoreSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError('Invalid input', parsed.error.flatten().fieldErrors);
  }

  const scope = requireScope(req);
  const store = await storeService.updateStore(req.params.id, parsed.data, scope);
  res.json({ data: store });
}

export async function remove(req: Request, res: Response): Promise<void> {
  const scope = requireScope(req);
  await storeService.deleteStore(req.params.id, scope);
  res.status(204).send();
}

import { Request, Response } from 'express';
import * as customerService from '../services/customer.service';
import {
  createCustomerSchema,
  updateCustomerSchema,
  listCustomersQuerySchema,
} from '../validators/customer.validator';
import { ValidationError, ForbiddenError } from '../utils/errors';

/**
 * Pull the active store id off the request, throwing a clear error if
 * the `storeContext` middleware was somehow not run. Centralised here
 * so every controller has identical "no store context" behaviour.
 */
function requireStoreId(req: Request): string {
  if (!req.storeId) {
    throw new ForbiddenError('No active store context for this request');
  }
  return req.storeId;
}

export async function create(req: Request, res: Response): Promise<void> {
  const parsed = createCustomerSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError('Invalid input', parsed.error.flatten().fieldErrors);
  }

  const storeId = requireStoreId(req);
  const { customer, warnings } = await customerService.createCustomer(
    storeId,
    parsed.data,
  );
  res.status(201).json({ data: customer, warnings });
}

export async function list(req: Request, res: Response): Promise<void> {
  const parsed = listCustomersQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new ValidationError('Invalid query parameters', parsed.error.flatten().fieldErrors);
  }

  const storeId = requireStoreId(req);
  const { customers, meta } = await customerService.listCustomers(
    storeId,
    parsed.data,
  );
  res.json({ data: customers, meta });
}

export async function getById(req: Request, res: Response): Promise<void> {
  const storeId = requireStoreId(req);
  const customer = await customerService.getCustomerById(storeId, req.params.id);
  res.json({ data: customer });
}

export async function update(req: Request, res: Response): Promise<void> {
  const parsed = updateCustomerSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError('Invalid input', parsed.error.flatten().fieldErrors);
  }

  const storeId = requireStoreId(req);
  const { customer, warnings } = await customerService.updateCustomer(
    storeId,
    req.params.id,
    parsed.data,
  );
  res.json({ data: customer, warnings });
}

export async function remove(req: Request, res: Response): Promise<void> {
  const storeId = requireStoreId(req);
  await customerService.deleteCustomer(storeId, req.params.id);
  res.status(204).send();
}

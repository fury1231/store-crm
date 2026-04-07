import { Request, Response } from 'express';
import * as customerService from '../services/customer.service';
import {
  createCustomerSchema,
  updateCustomerSchema,
  listCustomersQuerySchema,
} from '../validators/customer.validator';
import { ValidationError } from '../utils/errors';

export async function create(req: Request, res: Response): Promise<void> {
  const parsed = createCustomerSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError('Invalid input', parsed.error.flatten().fieldErrors);
  }

  const { customer, warnings } = await customerService.createCustomer(parsed.data);
  res.status(201).json({ data: customer, warnings });
}

export async function list(req: Request, res: Response): Promise<void> {
  const parsed = listCustomersQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new ValidationError('Invalid query parameters', parsed.error.flatten().fieldErrors);
  }

  const { customers, meta } = await customerService.listCustomers(parsed.data);
  res.json({ data: customers, meta });
}

export async function getById(req: Request, res: Response): Promise<void> {
  const customer = await customerService.getCustomerById(req.params.id);
  res.json({ data: customer });
}

export async function update(req: Request, res: Response): Promise<void> {
  const parsed = updateCustomerSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError('Invalid input', parsed.error.flatten().fieldErrors);
  }

  const { customer, warnings } = await customerService.updateCustomer(
    req.params.id,
    parsed.data,
  );
  res.json({ data: customer, warnings });
}

export async function remove(req: Request, res: Response): Promise<void> {
  await customerService.deleteCustomer(req.params.id);
  res.status(204).send();
}

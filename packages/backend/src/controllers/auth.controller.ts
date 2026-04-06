import { Request, Response } from 'express';
import * as authService from '../services/auth.service';
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
} from '../validators/auth.validator';
import { ValidationError, UnauthorizedError } from '../utils/errors';

export async function register(req: Request, res: Response): Promise<void> {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError('Invalid input', parsed.error.flatten().fieldErrors);
  }

  const result = await authService.register(parsed.data);
  res.status(201).json({ data: result });
}

export async function login(req: Request, res: Response): Promise<void> {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError('Invalid input', parsed.error.flatten().fieldErrors);
  }

  const result = await authService.login(parsed.data.email, parsed.data.password);
  res.json({ data: result });
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError('Invalid input', parsed.error.flatten().fieldErrors);
  }

  const result = await authService.refresh(parsed.data.refreshToken);
  res.json({ data: result });
}

export async function logout(req: Request, res: Response): Promise<void> {
  const parsed = logoutSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError('Invalid input', parsed.error.flatten().fieldErrors);
  }

  await authService.logout(parsed.data.refreshToken);
  res.status(204).send();
}

export async function me(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError();
  }

  const profile = await authService.getMe(req.user.id);
  res.json({ data: profile });
}

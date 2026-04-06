import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prismaClient';
import { verifyAccessToken } from '../services/auth.service';
import { UnauthorizedError } from '../utils/errors';

/**
 * Express middleware that extracts and validates the JWT from the
 * Authorization: Bearer <token> header.
 *
 * On success, sets `req.user = { id, email, role, storeId }`.
 * On failure, throws UnauthorizedError (handled by errorHandler).
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or malformed Authorization header');
  }

  const token = authHeader.slice(7); // strip "Bearer "
  const payload = verifyAccessToken(token); // throws on invalid/expired

  // Look up the user to ensure they still exist and get current data
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, email: true, role: true, storeId: true },
  });

  if (!user) {
    throw new UnauthorizedError('User no longer exists');
  }

  req.user = user;
  next();
}

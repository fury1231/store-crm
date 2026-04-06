/**
 * Extend Express Request with authenticated user payload.
 * Populated by the `authenticate` middleware after JWT verification.
 */
declare namespace Express {
  interface Request {
    user?: {
      id: string;
      email: string;
      role: import('../generated/prisma/client').Role;
      storeId: string | null;
    };
  }
}

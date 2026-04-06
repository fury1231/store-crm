import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';

/**
 * Global Express error-handling middleware.
 * - Known errors (AppError) → structured JSON with proper status.
 * - Unknown errors → 500 with generic message (no leak).
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined && { details: err.details }),
      },
    });
    return;
  }

  // Unexpected error — log for debugging, return generic response
  console.error('Unhandled error:', err);

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}

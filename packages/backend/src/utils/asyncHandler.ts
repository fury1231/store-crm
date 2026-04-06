import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wraps an async Express handler so that rejected promises
 * are forwarded to the error-handling middleware automatically.
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

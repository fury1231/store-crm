import { Request, Response, NextFunction } from 'express';

/**
 * Express middleware that logs: method, path, status code, and duration.
 * Hooks into the response 'finish' event so the log fires after the
 * response is sent, capturing the final status code.
 */
export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(
      `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`,
    );
  });

  next();
}

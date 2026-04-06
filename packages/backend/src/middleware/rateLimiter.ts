import rateLimit from 'express-rate-limit';

/**
 * Rate limiter for login endpoint.
 * Max 5 attempts per minute per IP address.
 */
export const loginRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many login attempts, please try again later',
    },
  },
});

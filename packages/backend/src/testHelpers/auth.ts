import jwt from 'jsonwebtoken';
import type { Role } from '../middleware/authorize';

/**
 * Test JWT secret. Tests using this helper MUST set
 * `process.env.JWT_SECRET = TEST_JWT_SECRET` in their setup
 * (typically `beforeEach`) so the auth.service can verify tokens.
 */
export const TEST_JWT_SECRET = 'test-jwt-secret-for-integration';

export interface TestUser {
  id: string;
  email: string;
  role: Role;
  storeId: string | null;
}

/**
 * Default test user — STAFF, attached to a fake store. Override fields as needed.
 */
export const defaultTestUser: TestUser = {
  id: 'usr_test_default',
  email: 'test@example.com',
  role: 'STAFF',
  storeId: 'str_test_default',
};

/**
 * Generate a valid signed JWT access token for tests.
 *
 * @example
 *   const token = makeTestToken({ role: 'ADMIN' });
 *   await request(app).post('/api/stores').set('Authorization', `Bearer ${token}`).send(...)
 */
export function makeTestToken(overrides: Partial<TestUser> = {}): string {
  const user = { ...defaultTestUser, ...overrides };
  return jwt.sign(
    { userId: user.id, role: user.role },
    TEST_JWT_SECRET,
    { expiresIn: '15m' },
  );
}

/**
 * Build the Bearer Authorization header value for a test user.
 * Convenience for `.set('Authorization', authHeader({ role: 'ADMIN' }))`.
 */
export function authHeader(overrides: Partial<TestUser> = {}): string {
  return `Bearer ${makeTestToken(overrides)}`;
}

/**
 * Build the user object that the `authenticate` middleware would set on
 * `req.user` after verifying the token. Used to mock `prisma.user.findUnique`
 * inside route tests so the middleware lookup succeeds.
 */
export function makeAuthenticatedUser(overrides: Partial<TestUser> = {}): TestUser {
  return { ...defaultTestUser, ...overrides };
}

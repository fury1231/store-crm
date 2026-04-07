import type { Page, Route } from '@playwright/test';

/**
 * Mocks the backend API endpoints needed for auth flows during E2E tests.
 *
 * Why mock? The acceptance criteria calls for testing the login/logout UI
 * flows end-to-end. Running against a live backend couples the test to
 * database state and auth seed data. Mocking at the HTTP layer keeps the
 * tests fast, deterministic, and still exercises the full React app shell
 * including routing, context, interceptors, and localStorage persistence.
 */

export const mockUser = {
  id: 'user-1',
  email: 'alice@example.com',
  name: 'Alice Admin',
  role: 'ADMIN',
  storeId: 'store-1',
  store: { id: 'store-1', name: 'Main Street Store' },
};

// The real backend's POST /auth/login response only includes scalar user fields
// (no `store` relation). Frontend must call /auth/me to hydrate the relation.
// We mirror that shape here so the e2e test catches regressions in that flow.
const mockLoginUser = {
  id: mockUser.id,
  email: mockUser.email,
  name: mockUser.name,
  role: mockUser.role,
  storeId: mockUser.storeId,
};

// JWT with far-future expiry so automatic refresh doesn't trigger during tests
function makeFakeJwt(expiresInSeconds = 3600): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({ sub: 'user-1', exp: Math.floor(Date.now() / 1000) + expiresInSeconds }),
  ).toString('base64url');
  return `${header}.${payload}.fake-signature`;
}

export const fakeAccessToken = makeFakeJwt();
export const fakeRefreshToken = 'fake-refresh-token';

interface MockOptions {
  validEmail?: string;
  validPassword?: string;
}

/**
 * Installs route handlers for the auth endpoints the frontend calls.
 * Call this before page.goto().
 */
export async function setupAuthMocks(page: Page, opts: MockOptions = {}) {
  const validEmail = opts.validEmail ?? 'alice@example.com';
  const validPassword = opts.validPassword ?? 'correct-password';

  // POST /auth/login — valid credentials return tokens + user; invalid returns 401
  await page.route('**/auth/login', async (route: Route) => {
    const body = route.request().postDataJSON() as { email?: string; password?: string };
    if (body?.email === validEmail && body?.password === validPassword) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            user: mockLoginUser,
            accessToken: fakeAccessToken,
            refreshToken: fakeRefreshToken,
          },
        }),
      });
    } else {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
        }),
      });
    }
  });

  // GET /auth/me — returns user if Authorization header has our fake token
  await page.route('**/auth/me', async (route: Route) => {
    const authHeader = route.request().headers()['authorization'];
    if (authHeader === `Bearer ${fakeAccessToken}`) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: mockUser }),
      });
    } else {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'Unauthorized' } }),
      });
    }
  });

  // POST /auth/logout — always succeeds
  await page.route('**/auth/logout', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { success: true } }),
    });
  });

  // POST /auth/refresh — return new tokens if called
  await page.route('**/auth/refresh', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: { accessToken: fakeAccessToken, refreshToken: fakeRefreshToken },
      }),
    });
  });
}

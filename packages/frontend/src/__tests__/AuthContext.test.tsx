import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import apiClient from '../api/client';

vi.mock('../api/client', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
    create: vi.fn(),
  },
  configureApiClient: vi.fn(),
}));

// Helper: build a fake JWT with a given expiry (seconds from now)
function makeToken(expiresInSeconds: number): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(
    JSON.stringify({ sub: 'user-1', exp: Math.floor(Date.now() / 1000) + expiresInSeconds }),
  );
  const signature = 'fake-signature';
  return `${header}.${payload}.${signature}`;
}

const mockUser = {
  id: 'u1',
  email: 'alice@example.com',
  name: 'Alice',
  role: 'ADMIN',
  storeId: 'store-1',
  store: { id: 'store-1', name: 'Main Store' },
};

// Consumer component to inspect auth state
function AuthStateProbe() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="is-authenticated">{String(auth.isAuthenticated)}</span>
      <span data-testid="is-loading">{String(auth.isLoading)}</span>
      <span data-testid="user-name">{auth.user?.name ?? ''}</span>
      <span data-testid="access-token">{auth.accessToken ?? ''}</span>
      <button data-testid="do-login" onClick={() => auth.login('a@b.c', 'pw').catch(() => {})}>
        login
      </button>
      <button data-testid="do-logout" onClick={() => auth.logout()}>
        logout
      </button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <AuthProvider>
      <AuthStateProbe />
    </AuthProvider>,
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('bootstrap', () => {
    it('initializes unauthenticated when no token in localStorage', async () => {
      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('is-loading').textContent).toBe('false');
      });
      expect(screen.getByTestId('is-authenticated').textContent).toBe('false');
      expect(apiClient.get).not.toHaveBeenCalled();
    });

    it('loads user on mount when token exists and /auth/me succeeds', async () => {
      localStorage.setItem('accessToken', makeToken(3600));
      vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { data: mockUser } });

      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('is-authenticated').textContent).toBe('true');
      });
      expect(screen.getByTestId('user-name').textContent).toBe('Alice');
      expect(apiClient.get).toHaveBeenCalledWith('/auth/me');
    });

    it('logs out when token invalid and no refresh token', async () => {
      localStorage.setItem('accessToken', 'bad.token.value');
      vi.mocked(apiClient.get).mockRejectedValueOnce({ response: { status: 401 } });

      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('is-loading').textContent).toBe('false');
      });
      expect(screen.getByTestId('is-authenticated').textContent).toBe('false');
      expect(localStorage.getItem('accessToken')).toBeNull();
    });

    it('refreshes token when /auth/me fails but refresh token is valid', async () => {
      localStorage.setItem('accessToken', 'old.token.value');
      localStorage.setItem('refreshToken', 'refresh-token-1');

      const newAccessToken = makeToken(3600);
      vi.mocked(apiClient.get)
        .mockRejectedValueOnce({ response: { status: 401 } })
        .mockResolvedValueOnce({ data: { data: mockUser } });
      vi.mocked(apiClient.post).mockResolvedValueOnce({
        data: { data: { accessToken: newAccessToken, refreshToken: 'refresh-token-2' } },
      });

      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('is-authenticated').textContent).toBe('true');
      });
      expect(apiClient.post).toHaveBeenCalledWith('/auth/refresh', {
        refreshToken: 'refresh-token-1',
      });
      expect(localStorage.getItem('accessToken')).toBe(newAccessToken);
    });
  });

  describe('login', () => {
    it('dispatches LOGIN_SUCCESS and persists tokens on success', async () => {
      // No token in localStorage → bootstrap returns immediately without
      // calling /auth/me. Only the post-login hydration call hits the spy.
      vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { data: mockUser } });

      const accessToken = makeToken(3600);
      // Login response only carries scalar user fields (no `store` relation),
      // matching the real backend contract.
      vi.mocked(apiClient.post).mockResolvedValueOnce({
        data: {
          data: {
            user: { id: 'u1', email: 'alice@example.com', name: 'Alice', role: 'ADMIN', storeId: 'store-1' },
            accessToken,
            refreshToken: 'refresh-1',
          },
        },
      });

      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('is-loading').textContent).toBe('false');
      });

      await act(async () => {
        screen.getByTestId('do-login').click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('is-authenticated').textContent).toBe('true');
      });

      // After login, /auth/me hydration should set the full mockUser with `store` relation
      await waitFor(() => {
        expect(screen.getByTestId('user-name').textContent).toBe('Alice');
      });
      expect(localStorage.getItem('accessToken')).toBe(accessToken);
      expect(localStorage.getItem('refreshToken')).toBe('refresh-1');
      // Post-login /auth/me hydration call (bootstrap was skipped since no token)
      expect(apiClient.get).toHaveBeenCalledWith('/auth/me');
      expect(apiClient.get).toHaveBeenCalledTimes(1);
    });

    it('dispatches LOGIN_FAILURE and clears state on error', async () => {
      vi.mocked(apiClient.get).mockRejectedValueOnce({ response: { status: 401 } });
      vi.mocked(apiClient.post).mockRejectedValueOnce(
        new Error('Invalid credentials'),
      );

      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('is-loading').textContent).toBe('false');
      });

      await act(async () => {
        screen.getByTestId('do-login').click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('is-authenticated').textContent).toBe('false');
      });

      expect(screen.getByTestId('user-name').textContent).toBe('');
      expect(localStorage.getItem('accessToken')).toBeNull();
    });
  });

  describe('logout', () => {
    it('clears state and calls /auth/logout endpoint', async () => {
      localStorage.setItem('accessToken', makeToken(3600));
      localStorage.setItem('refreshToken', 'refresh-99');
      vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { data: mockUser } });
      vi.mocked(apiClient.post).mockResolvedValueOnce({ data: {} });

      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('is-authenticated').textContent).toBe('true');
      });

      await act(async () => {
        screen.getByTestId('do-logout').click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('is-authenticated').textContent).toBe('false');
      });

      expect(apiClient.post).toHaveBeenCalledWith('/auth/logout', {
        refreshToken: 'refresh-99',
      });
      expect(localStorage.getItem('accessToken')).toBeNull();
      expect(localStorage.getItem('refreshToken')).toBeNull();
    });

    it('still clears local state even if /auth/logout fails', async () => {
      localStorage.setItem('accessToken', makeToken(3600));
      localStorage.setItem('refreshToken', 'refresh-99');
      vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { data: mockUser } });
      vi.mocked(apiClient.post).mockRejectedValueOnce(new Error('Network error'));

      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('is-authenticated').textContent).toBe('true');
      });

      await act(async () => {
        screen.getByTestId('do-logout').click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('is-authenticated').textContent).toBe('false');
      });

      expect(localStorage.getItem('accessToken')).toBeNull();
    });
  });

  describe('useAuth hook', () => {
    it('throws when used outside AuthProvider', () => {
      // Suppress console.error for this assertion
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      function BadComponent() {
        useAuth();
        return null;
      }

      expect(() => render(<BadComponent />)).toThrow(
        'useAuth must be used within an AuthProvider',
      );

      errSpy.mockRestore();
    });
  });
});

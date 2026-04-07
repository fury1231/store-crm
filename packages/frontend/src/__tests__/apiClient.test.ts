import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import apiClient, { configureApiClient, resetApiClientState } from '../api/client';

describe('apiClient', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
    // Clear any in-flight refresh state leaked from a previous test.
    resetApiClientState();
  });

  afterEach(() => {
    mock.restore();
    // Reset module-level refresh state AND configuration so no test
    // can leave `isRefreshing = true` and silently queue subsequent 401s.
    resetApiClientState();
    configureApiClient({
      getAccessToken: () => null,
      getStoreId: () => null,
      onUnauthorized: () => {},
      refreshAccessToken: async () => null,
    });
  });

  describe('request interceptor', () => {
    it('attaches Authorization header when token present', async () => {
      configureApiClient({
        getAccessToken: () => 'test-access-token',
        getStoreId: () => null,
        onUnauthorized: () => {},
        refreshAccessToken: async () => null,
      });

      mock.onGet('/resource').reply((config) => {
        expect(config.headers?.Authorization).toBe('Bearer test-access-token');
        return [200, { ok: true }];
      });

      const res = await apiClient.get('/resource');
      expect(res.data).toEqual({ ok: true });
    });

    it('does not attach Authorization header when no token', async () => {
      configureApiClient({
        getAccessToken: () => null,
        getStoreId: () => null,
        onUnauthorized: () => {},
        refreshAccessToken: async () => null,
      });

      mock.onGet('/resource').reply((config) => {
        expect(config.headers?.Authorization).toBeUndefined();
        return [200, { ok: true }];
      });

      await apiClient.get('/resource');
    });

    it('attaches X-Store-Id header when storeId present', async () => {
      configureApiClient({
        getAccessToken: () => 'token',
        getStoreId: () => 'store-42',
        onUnauthorized: () => {},
        refreshAccessToken: async () => null,
      });

      mock.onGet('/resource').reply((config) => {
        expect(config.headers?.['X-Store-Id']).toBe('store-42');
        return [200, {}];
      });

      await apiClient.get('/resource');
    });

    it('does not attach X-Store-Id when storeId is null', async () => {
      configureApiClient({
        getAccessToken: () => 'token',
        getStoreId: () => null,
        onUnauthorized: () => {},
        refreshAccessToken: async () => null,
      });

      mock.onGet('/resource').reply((config) => {
        expect(config.headers?.['X-Store-Id']).toBeUndefined();
        return [200, {}];
      });

      await apiClient.get('/resource');
    });
  });

  describe('response interceptor — 401 handling', () => {
    it('retries request with new token after successful refresh', async () => {
      let currentToken = 'old-token';
      const refreshFn = vi.fn().mockImplementation(async () => {
        currentToken = 'new-token';
        return 'new-token';
      });

      configureApiClient({
        getAccessToken: () => currentToken,
        getStoreId: () => null,
        onUnauthorized: () => {},
        refreshAccessToken: refreshFn,
      });

      // First call: 401, second call: 200 with new token
      let callCount = 0;
      mock.onGet('/protected').reply((config) => {
        callCount++;
        if (callCount === 1) {
          return [401, { error: 'Unauthorized' }];
        }
        expect(config.headers?.Authorization).toBe('Bearer new-token');
        return [200, { data: 'secret' }];
      });

      const res = await apiClient.get('/protected');
      expect(res.data).toEqual({ data: 'secret' });
      expect(refreshFn).toHaveBeenCalledTimes(1);
      expect(callCount).toBe(2);
    });

    it('calls onUnauthorized when refresh fails', async () => {
      const onUnauthorizedFn = vi.fn();
      const refreshFn = vi.fn().mockResolvedValue(null);

      configureApiClient({
        getAccessToken: () => 'old-token',
        getStoreId: () => null,
        onUnauthorized: onUnauthorizedFn,
        refreshAccessToken: refreshFn,
      });

      mock.onGet('/protected').reply(401, { error: 'Unauthorized' });

      await expect(apiClient.get('/protected')).rejects.toBeDefined();
      expect(refreshFn).toHaveBeenCalledTimes(1);
      expect(onUnauthorizedFn).toHaveBeenCalledTimes(1);
    });

    it('does not try to refresh on /auth/login endpoint', async () => {
      const refreshFn = vi.fn();
      const onUnauthorizedFn = vi.fn();

      configureApiClient({
        getAccessToken: () => null,
        getStoreId: () => null,
        onUnauthorized: onUnauthorizedFn,
        refreshAccessToken: refreshFn,
      });

      mock.onPost('/auth/login').reply(401, { error: 'Invalid credentials' });

      await expect(
        apiClient.post('/auth/login', { email: 'x', password: 'y' }),
      ).rejects.toBeDefined();

      expect(refreshFn).not.toHaveBeenCalled();
      expect(onUnauthorizedFn).not.toHaveBeenCalled();
    });

    it('does not try to refresh on /auth/refresh endpoint', async () => {
      const refreshFn = vi.fn();

      configureApiClient({
        getAccessToken: () => 'token',
        getStoreId: () => null,
        onUnauthorized: () => {},
        refreshAccessToken: refreshFn,
      });

      mock.onPost('/auth/refresh').reply(401, {});

      await expect(
        apiClient.post('/auth/refresh', { refreshToken: 'r' }),
      ).rejects.toBeDefined();

      expect(refreshFn).not.toHaveBeenCalled();
    });

    it('passes through non-401 errors unchanged', async () => {
      const refreshFn = vi.fn();

      configureApiClient({
        getAccessToken: () => 'token',
        getStoreId: () => null,
        onUnauthorized: () => {},
        refreshAccessToken: refreshFn,
      });

      mock.onGet('/resource').reply(500, { error: 'Server error' });

      await expect(apiClient.get('/resource')).rejects.toMatchObject({
        response: { status: 500 },
      });
      expect(refreshFn).not.toHaveBeenCalled();
    });
  });
});

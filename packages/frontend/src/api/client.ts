import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// --- Token management (set by AuthContext) ---

let getAccessToken: (() => string | null) | null = null;
let getStoreId: (() => string | null) | null = null;
let onUnauthorized: (() => void) | null = null;
let refreshAccessToken: (() => Promise<string | null>) | null = null;

export function configureApiClient(config: {
  getAccessToken: () => string | null;
  getStoreId: () => string | null;
  onUnauthorized: () => void;
  refreshAccessToken: () => Promise<string | null>;
}) {
  getAccessToken = config.getAccessToken;
  getStoreId = config.getStoreId;
  onUnauthorized = config.onUnauthorized;
  refreshAccessToken = config.refreshAccessToken;
}

// --- Request interceptor: attach Authorization + X-Store-Id ---

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken?.();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  const storeId = getStoreId?.();
  if (storeId) {
    config.headers['X-Store-Id'] = storeId;
  }

  return config;
});

// --- Response interceptor: handle 401 with token refresh ---

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string | null) => void;
  reject: (error: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null = null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token);
    }
  });
  failedQueue = [];
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // Skip refresh for auth endpoints (login, refresh, logout)
    const isAuthEndpoint = originalRequest?.url?.includes('/auth/login')
      || originalRequest?.url?.includes('/auth/refresh')
      || originalRequest?.url?.includes('/auth/logout');

    if (error.response?.status !== 401 || originalRequest?._retry || isAuthEndpoint) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      // Queue this request while another refresh is in progress
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((token) => {
        if (token && originalRequest) {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return apiClient(originalRequest);
        }
        return Promise.reject(error);
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const newToken = await refreshAccessToken?.();
      if (newToken) {
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        processQueue(null, newToken);
        return apiClient(originalRequest);
      }
      processQueue(new Error('Refresh failed'));
      onUnauthorized?.();
      return Promise.reject(error);
    } catch (refreshError) {
      processQueue(refreshError);
      onUnauthorized?.();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

export default apiClient;

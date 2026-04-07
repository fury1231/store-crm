import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import apiClient, { configureApiClient } from '../api/client';
import type { AuthState, AuthAction, User, LoginResponse, RefreshResponse, MeResponse } from '../types/auth';

// --- Reducer ---

function getInitialState(): AuthState {
  return {
    user: null,
    accessToken: localStorage.getItem('accessToken'),
    refreshToken: localStorage.getItem('refreshToken'),
    isAuthenticated: false,
    isLoading: true,
  };
}

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'LOGIN_START':
      return { ...state, isLoading: true };
    case 'LOGIN_SUCCESS':
      return {
        user: action.payload.user,
        accessToken: action.payload.accessToken,
        refreshToken: action.payload.refreshToken,
        isAuthenticated: true,
        isLoading: false,
      };
    case 'LOGIN_FAILURE':
      return { user: null, accessToken: null, refreshToken: null, isAuthenticated: false, isLoading: false };
    case 'LOGOUT':
      return { user: null, accessToken: null, refreshToken: null, isAuthenticated: false, isLoading: false };
    case 'TOKEN_REFRESHED':
      return {
        ...state,
        accessToken: action.payload.accessToken,
        refreshToken: action.payload.refreshToken,
      };
    case 'SET_USER':
      return { ...state, user: action.payload, isAuthenticated: true, isLoading: false };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    default:
      return state;
  }
}

// --- Context ---

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  currentStoreId: string | null;
  setCurrentStoreId: (id: string | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// --- Provider ---

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, null, getInitialState);
  const storeIdRef = useRef<string | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs that mirror state synchronously so the axios request interceptor
  // (which reads via closure on each call) can see updated tokens *before*
  // React commits the next render. Without this, calling apiClient.get
  // immediately after `dispatch(LOGIN_SUCCESS)` would still send the old
  // token because the closure hasn't been refreshed yet.
  const accessTokenRef = useRef<string | null>(state.accessToken);
  const refreshTokenRef = useRef<string | null>(state.refreshToken);

  // Persist tokens to localStorage and mirror to refs on change
  useEffect(() => {
    accessTokenRef.current = state.accessToken;
    if (state.accessToken) {
      localStorage.setItem('accessToken', state.accessToken);
    } else {
      localStorage.removeItem('accessToken');
    }
  }, [state.accessToken]);

  useEffect(() => {
    refreshTokenRef.current = state.refreshToken;
    if (state.refreshToken) {
      localStorage.setItem('refreshToken', state.refreshToken);
    } else {
      localStorage.removeItem('refreshToken');
    }
  }, [state.refreshToken]);

  // Set default store from user profile
  useEffect(() => {
    if (state.user?.storeId && !storeIdRef.current) {
      storeIdRef.current = state.user.storeId;
    }
  }, [state.user]);

  // --- Token refresh logic ---

  const doRefresh = useCallback(async (): Promise<string | null> => {
    const currentRefreshToken = localStorage.getItem('refreshToken');
    if (!currentRefreshToken) return null;

    try {
      const { data } = await apiClient.post<RefreshResponse>('/auth/refresh', {
        refreshToken: currentRefreshToken,
      });
      const { accessToken, refreshToken } = data.data;
      dispatch({ type: 'TOKEN_REFRESHED', payload: { accessToken, refreshToken } });
      return accessToken;
    } catch {
      dispatch({ type: 'LOGOUT' });
      return null;
    }
  }, []);

  // Schedule automatic token refresh (2 minutes before expiry)
  const scheduleRefresh = useCallback(
    (token: string) => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }

      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const expiresAt = payload.exp * 1000;
        const refreshAt = expiresAt - Date.now() - 2 * 60 * 1000; // 2 min before expiry

        if (refreshAt > 0) {
          refreshTimerRef.current = setTimeout(async () => {
            const newToken = await doRefresh();
            if (newToken) {
              scheduleRefresh(newToken);
            }
          }, refreshAt);
        }
      } catch {
        // Invalid token format — skip scheduling
      }
    },
    [doRefresh],
  );

  // Schedule refresh when access token changes
  useEffect(() => {
    if (state.accessToken) {
      scheduleRefresh(state.accessToken);
    }
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [state.accessToken, scheduleRefresh]);

  // --- Bootstrap: validate existing token on mount ---

  useEffect(() => {
    async function bootstrap() {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        dispatch({ type: 'SET_LOADING', payload: false });
        return;
      }

      try {
        const { data } = await apiClient.get<MeResponse>('/auth/me');
        dispatch({ type: 'SET_USER', payload: data.data });
      } catch {
        // Token invalid — try refresh
        const newToken = await doRefresh();
        if (newToken) {
          try {
            const { data } = await apiClient.get<MeResponse>('/auth/me');
            dispatch({ type: 'SET_USER', payload: data.data });
            return;
          } catch {
            // Still failing
          }
        }
        dispatch({ type: 'LOGOUT' });
      }
    }
    bootstrap();
  }, [doRefresh]);

  // --- Configure API client (once on mount; reads tokens from refs) ---

  useEffect(() => {
    configureApiClient({
      getAccessToken: () => accessTokenRef.current,
      getStoreId: () => storeIdRef.current,
      onUnauthorized: () => dispatch({ type: 'LOGOUT' }),
      refreshAccessToken: doRefresh,
    });
  }, [doRefresh]);

  // --- Actions ---

  const login = useCallback(
    async (email: string, password: string) => {
      dispatch({ type: 'LOGIN_START' });
      try {
        const { data } = await apiClient.post<LoginResponse>('/auth/login', {
          email,
          password,
        });
        const { user, accessToken, refreshToken } = data.data;

        // Update refs synchronously so the immediate /auth/me call below
        // sees the new token via the request interceptor.
        accessTokenRef.current = accessToken;
        refreshTokenRef.current = refreshToken;

        dispatch({ type: 'LOGIN_SUCCESS', payload: { user, accessToken, refreshToken } });

        // The /auth/login response only carries scalar user fields (no relations).
        // Fetch /auth/me to hydrate the full user including the `store` object,
        // so the Header / Dashboard can render the store name immediately
        // without requiring a page reload.
        try {
          const { data: meData } = await apiClient.get<MeResponse>('/auth/me');
          dispatch({ type: 'SET_USER', payload: meData.data });
        } catch {
          // Non-fatal: tokens are valid; user just lacks the relation.
          // Header/Dashboard will fall back to placeholder text until next reload.
        }
      } catch (err) {
        dispatch({ type: 'LOGIN_FAILURE' });
        throw err;
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    const currentRefreshToken = state.refreshToken;
    dispatch({ type: 'LOGOUT' });
    storeIdRef.current = null;

    if (currentRefreshToken) {
      try {
        await apiClient.post('/auth/logout', { refreshToken: currentRefreshToken });
      } catch {
        // Ignore logout API errors — local state is already cleared
      }
    }
  }, [state.refreshToken]);

  const setCurrentStoreId = useCallback((id: string | null) => {
    storeIdRef.current = id;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        logout,
        currentStoreId: storeIdRef.current,
        setCurrentStoreId,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

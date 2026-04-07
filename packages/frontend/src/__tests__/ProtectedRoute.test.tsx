import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProtectedRoute from '../components/ProtectedRoute';
import { AuthProvider } from '../contexts/AuthContext';
import { ToastProvider } from '../contexts/ToastContext';
import apiClient from '../api/client';

vi.mock('../api/client', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
  configureApiClient: vi.fn(),
}));

const mockUser = {
  id: '1',
  email: 'test@test.com',
  name: 'Test User',
  role: 'STAFF',
  storeId: 's1',
  store: { id: 's1', name: 'Test Store' },
};

function renderWithRoutes(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<div>Login Page</div>} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <div>Dashboard Content</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
  });

  it('redirects to /login when not authenticated', async () => {
    // No token in localStorage — bootstrap sets isLoading false immediately
    vi.mocked(apiClient.get).mockRejectedValue({ response: { status: 401 } });

    renderWithRoutes('/dashboard');

    await waitFor(() => {
      expect(screen.getByText('Login Page')).toBeInTheDocument();
    });
  });

  it('shows protected content when authenticated', async () => {
    localStorage.setItem('accessToken', 'fake-token');
    // Bootstrap calls GET /auth/me and gets user data
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { data: mockUser },
    });

    renderWithRoutes('/dashboard');

    await waitFor(() => {
      expect(screen.getByText('Dashboard Content')).toBeInTheDocument();
    });
  });

  it('shows loading spinner while checking auth', () => {
    localStorage.setItem('accessToken', 'fake-token');
    // Bootstrap calls GET /auth/me which never resolves
    vi.mocked(apiClient.get).mockReturnValue(new Promise(() => {}));

    renderWithRoutes('/dashboard');

    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
  });
});

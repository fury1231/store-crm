import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import LoginPage from '../pages/LoginPage';
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
    create: vi.fn(),
  },
  configureApiClient: vi.fn(),
}));

function renderLoginPage() {
  return render(
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    // Mock the bootstrap GET /auth/me to fail (not logged in)
    vi.mocked(apiClient.get).mockRejectedValue({ response: { status: 401 } });
  });

  it('renders email and password fields', async () => {
    renderLoginPage();

    await waitFor(() => {
      expect(screen.getByTestId('email-input')).toBeInTheDocument();
    });
    expect(screen.getByTestId('password-input')).toBeInTheDocument();
    expect(screen.getByTestId('login-button')).toBeInTheDocument();
  });

  it('renders the heading and description', async () => {
    renderLoginPage();

    await waitFor(() => {
      expect(screen.getByText('Store CRM')).toBeInTheDocument();
    });
    expect(screen.getByText('Sign in to your account')).toBeInTheDocument();
  });

  it('shows error on failed login', async () => {
    const user = userEvent.setup();
    // Reject with a plain error — LoginPage catch block will show generic message
    vi.mocked(apiClient.post).mockRejectedValueOnce(new Error('Request failed'));

    renderLoginPage();

    await waitFor(() => {
      expect(screen.getByTestId('email-input')).toBeInTheDocument();
    });

    await user.type(screen.getByTestId('email-input'), 'bad@example.com');
    await user.type(screen.getByTestId('password-input'), 'wrongpass');
    await user.click(screen.getByTestId('login-button'));

    await waitFor(() => {
      expect(screen.getByTestId('login-error')).toBeInTheDocument();
    });
  });

  it('disables submit button while loading', async () => {
    const user = userEvent.setup();
    // Make login hang indefinitely
    vi.mocked(apiClient.post).mockImplementation(
      () => new Promise(() => {}),
    );

    renderLoginPage();

    await waitFor(() => {
      expect(screen.getByTestId('email-input')).toBeInTheDocument();
    });

    await user.type(screen.getByTestId('email-input'), 'test@example.com');
    await user.type(screen.getByTestId('password-input'), 'password123');
    await user.click(screen.getByTestId('login-button'));

    await waitFor(() => {
      expect(screen.getByTestId('login-button')).toBeDisabled();
    });
  });

  it('requires email and password fields', async () => {
    renderLoginPage();

    await waitFor(() => {
      expect(screen.getByTestId('email-input')).toBeRequired();
    });
    expect(screen.getByTestId('password-input')).toBeRequired();
  });
});

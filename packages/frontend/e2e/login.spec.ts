import { test, expect } from '@playwright/test';
import { setupAuthMocks } from './helpers/mockApi';

test.describe('Login flow', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMocks(page);
  });

  test('valid credentials redirect to dashboard', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByRole('heading', { name: 'Store CRM' })).toBeVisible();

    await page.getByTestId('email-input').fill('alice@example.com');
    await page.getByTestId('password-input').fill('correct-password');
    await page.getByTestId('login-button').click();

    // Dashboard route should be reached
    await expect(page).toHaveURL(/\/dashboard$/);

    // Dashboard shows welcome message with user name
    await expect(page.getByText(/Welcome back, Alice/i)).toBeVisible();

    // Store name should be displayed prominently in header.
    // Scope to <header> so we don't collide with the "Welcome to Main Street Store"
    // h2 in the dashboard welcome card (Playwright strict mode — see #24).
    await expect(page.locator('header').getByText('Main Street Store')).toBeVisible();
  });

  test('invalid credentials show error and stay on login page', async ({ page }) => {
    await page.goto('/login');

    await page.getByTestId('email-input').fill('alice@example.com');
    await page.getByTestId('password-input').fill('wrong-password');
    await page.getByTestId('login-button').click();

    // Error message should appear
    await expect(page.getByTestId('login-error')).toBeVisible();

    // URL should remain /login
    await expect(page).toHaveURL(/\/login$/);

    // Dashboard content should NOT be visible
    await expect(page.getByText(/Welcome back/i)).not.toBeVisible();
  });

  test('unauthenticated user visiting /dashboard is redirected to /login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('login form has required field validation', async ({ page }) => {
    await page.goto('/login');

    // Try submitting empty form — HTML5 required attribute prevents submit
    await page.getByTestId('login-button').click();

    // Should still be on login page
    await expect(page).toHaveURL(/\/login$/);

    // Email input should be marked required
    const emailInput = page.getByTestId('email-input');
    await expect(emailInput).toHaveAttribute('required', '');
  });
});

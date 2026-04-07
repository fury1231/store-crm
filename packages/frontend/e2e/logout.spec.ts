import { test, expect } from '@playwright/test';
import { setupAuthMocks } from './helpers/mockApi';

test.describe('Logout flow', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMocks(page);
  });

  test('authenticated user can logout and is redirected to login', async ({ page }) => {
    // First log in
    await page.goto('/login');
    await page.getByTestId('email-input').fill('alice@example.com');
    await page.getByTestId('password-input').fill('correct-password');
    await page.getByTestId('login-button').click();
    await expect(page).toHaveURL(/\/dashboard$/);

    // Open user dropdown in header and click sign out
    // The avatar/user-info trigger is inside the Dropdown component
    await page.locator('header').getByText('Alice Admin').click();
    await page.getByTestId('logout-button').click();

    // Should be redirected to login page
    await expect(page).toHaveURL(/\/login$/);

    // Attempting to visit a protected route again should stay on login
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('logout clears localStorage tokens', async ({ page }) => {
    // Log in
    await page.goto('/login');
    await page.getByTestId('email-input').fill('alice@example.com');
    await page.getByTestId('password-input').fill('correct-password');
    await page.getByTestId('login-button').click();
    await expect(page).toHaveURL(/\/dashboard$/);

    // Verify tokens are in localStorage after login
    const accessTokenBefore = await page.evaluate(() => localStorage.getItem('accessToken'));
    expect(accessTokenBefore).not.toBeNull();

    // Logout
    await page.locator('header').getByText('Alice Admin').click();
    await page.getByTestId('logout-button').click();
    await expect(page).toHaveURL(/\/login$/);

    // Verify tokens are cleared
    const accessTokenAfter = await page.evaluate(() => localStorage.getItem('accessToken'));
    const refreshTokenAfter = await page.evaluate(() => localStorage.getItem('refreshToken'));
    expect(accessTokenAfter).toBeNull();
    expect(refreshTokenAfter).toBeNull();
  });
});

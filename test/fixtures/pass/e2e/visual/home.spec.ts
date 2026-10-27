import { test, expect } from '@playwright/test';

test('home page looks the same', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveScreenshot();
});

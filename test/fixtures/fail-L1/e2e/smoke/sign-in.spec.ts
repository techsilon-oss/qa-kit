import { test, expect } from '@playwright/test';

test.describe('sign-in', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/sign-in');
  });

  test('SIGN-01 A visitor signs in and lands on their home page', { tag: '@smoke' }, async ({ page }) => {
    await test.step('sign in', async () => {
      await page.getByRole('button', { name: 'Sign in' }).click();
    });
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  });

  test(`SIGN-01, SIGN-05 The session survives a reload`, async ({ page }) => {
    test.skip(process.env.NO_STORAGE === 'true', 'needs session storage');
    await page.reload();
  });

  // test('an old test, commented out', async () => {});
  /* test("another old test", async () => {}); */
  const note = 'a string that mentions test("not a test")';
  void note;
});
test('signs out', async () => {});

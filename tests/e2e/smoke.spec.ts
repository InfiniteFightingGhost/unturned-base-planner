import { expect, test } from '@playwright/test';

test('loads the editor shell', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Unturned Base Planner' })).toBeVisible();
});

import { expect, test } from '@playwright/test';

test('adding a floor lists it and updates the active floor label', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('floor-selector')).toBeVisible();
  await expect(page.getByTestId('active-floor')).toHaveText('Ground Floor');
  await expect(page.locator('[data-testid^="floor-item-"]')).toHaveCount(1);

  await page.getByTestId('add-floor').click();

  await expect(page.locator('[data-testid^="floor-item-"]')).toHaveCount(2);
  await expect(page.getByTestId('active-floor')).toHaveText('Floor 2');

  const groundFloor = page
    .locator('[data-testid^="floor-item-"]')
    .filter({ has: page.getByLabel('Name of Ground Floor') });
  await expect(groundFloor).toHaveCount(1);
  await groundFloor.locator('.floor-index').click();
  await expect(page.getByTestId('active-floor')).toHaveText('Ground Floor');
});

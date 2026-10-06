import { expect, test } from '@playwright/test';

test('blueprint top view and a two-click measurement', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('blueprint-panel')).toBeVisible();
  await page.getByTestId('toggle-blueprint').click();
  await expect(page.getByTestId('toggle-blueprint')).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('blueprint-view-top_down').click();

  await page.getByTestId('measurement-tool').click();
  await page.getByTestId('measurement-kind').selectOption('distance');

  const canvas = page.locator('.viewport-panel canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (box === null) {
    throw new Error('Viewport canvas has no bounding box');
  }

  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.5);
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.5);

  await expect(page.locator('[data-testid="measurement-item"]')).toHaveCount(1);
  await expect(page.getByTestId('measurement-empty')).toHaveCount(0);
});

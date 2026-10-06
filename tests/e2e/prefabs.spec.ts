import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function pieceCount(page: Page): Promise<number> {
  const text = (await page.getByTestId('piece-count').textContent()) ?? '0';
  return Number.parseInt(text, 10);
}

async function canvasCentre(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator('canvas').boundingBox();
  if (box === null) {
    throw new Error('Canvas has no bounding box');
  }
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test('saves a selection as a prefab, instantiates it, and undoes in one step', async ({ page }) => {
  await page.goto('/');

  await page.getByTestId('piece-search').fill('wall');
  await page.locator('[data-testid^="piece-item-"]').first().click();

  const centre = await canvasCentre(page);
  await page.mouse.click(centre.x - 40, centre.y + 20);
  await page.mouse.click(centre.x + 40, centre.y + 20);
  await expect.poll(() => pieceCount(page)).toBe(2);

  await page.keyboard.press('Control+a');
  await page.getByTestId('prefab-name').fill('Wall pair');
  await page.getByTestId('prefab-save').click();
  await expect(page.getByTestId('prefab-panel').getByText('Wall pair')).toBeVisible();

  const before = await pieceCount(page);
  await page.locator('[data-testid^="prefab-instantiate-"]').first().click();
  await expect.poll(() => pieceCount(page)).toBeGreaterThan(before);

  await page.keyboard.press('Control+z');
  await expect.poll(() => pieceCount(page)).toBe(before);
});

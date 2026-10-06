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

test('applies a linear pattern as one undoable step', async ({ page }) => {
  await page.goto('/');

  await page.getByTestId('piece-search').fill('wall');
  await page.locator('[data-testid^="piece-item-"]').first().click();

  const centre = await canvasCentre(page);
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.click(centre.x, centre.y);
  await expect.poll(() => pieceCount(page)).toBeGreaterThanOrEqual(1);

  const before = await pieceCount(page);

  await page.keyboard.press('Control+a');
  await expect(page.getByTestId('pattern-panel')).toBeVisible();
  await page.getByTestId('pattern-linear-count').fill('3');
  await page.getByTestId('pattern-linear-apply').click();

  await expect.poll(() => pieceCount(page)).toBe(before + 3);

  await page.keyboard.press('Control+z');
  await expect.poll(() => pieceCount(page)).toBe(before);
});

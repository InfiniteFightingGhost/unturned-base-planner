import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function pieceCount(page: Page): Promise<number> {
  const text = (await page.getByTestId('piece-count').textContent()) ?? '0';
  return Number.parseInt(text, 10);
}

/** Pointer coordinates at the centre of the canvas. */
async function canvasCentre(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator('canvas').boundingBox();
  if (box === null) {
    throw new Error('Canvas has no bounding box');
  }
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test('places a piece and supports undo/redo through keyboard shortcuts', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Unturned Base Planner' })).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();

  await page.getByTestId('piece-search').fill('wall');
  const firstResult = page.locator('[data-testid^="piece-item-"]').first();
  await expect(firstResult).toBeVisible();
  await firstResult.click();

  const centre = await canvasCentre(page);
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.click(centre.x, centre.y);

  await expect.poll(() => pieceCount(page)).toBeGreaterThanOrEqual(1);

  await page.keyboard.press('Control+z');
  await expect.poll(() => pieceCount(page)).toBe(0);

  await page.keyboard.press('Control+Shift+z');
  await expect.poll(() => pieceCount(page)).toBeGreaterThanOrEqual(1);
});

test('redo also works with Control+Y', async ({ page }) => {
  await page.goto('/');

  await page.getByTestId('piece-search').fill('wall');
  await page.locator('[data-testid^="piece-item-"]').first().click();

  const centre = await canvasCentre(page);
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.click(centre.x, centre.y);
  await expect.poll(() => pieceCount(page)).toBeGreaterThanOrEqual(1);

  await page.keyboard.press('Control+z');
  await expect.poll(() => pieceCount(page)).toBe(0);

  await page.keyboard.press('Control+y');
  await expect.poll(() => pieceCount(page)).toBeGreaterThanOrEqual(1);
});

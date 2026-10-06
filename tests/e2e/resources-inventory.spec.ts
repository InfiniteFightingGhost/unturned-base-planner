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

test('derives raw requirements, reacts to build state, and computes inventory', async ({ page }) => {
  await page.goto('/');

  await page.getByTestId('piece-search').fill('wall.birch');
  await page.getByTestId('piece-item-wall.birch').click();

  const centre = await canvasCentre(page);
  await page.mouse.click(centre.x, centre.y);
  await expect.poll(() => pieceCount(page)).toBe(1);

  // P28: a birch wall expands to three birch logs.
  await expect(page.getByTestId('resource-amount-log.birch')).toContainText('3');

  // P32/P35: owning two logs leaves one remaining.
  await page.getByTestId('inventory-input-log.birch').fill('2');
  await expect(page.getByTestId('inventory-required-log.birch')).toHaveText('3');
  await expect(page.getByTestId('inventory-remaining-log.birch')).toHaveText('1');
  await expect(page.getByTestId('inventory-total-owned')).toHaveText('2');

  // P33/P34: marking the piece built drops the remaining requirement to zero.
  await page.keyboard.press('Control+a');
  await page.getByTestId('mark-built').click();
  await expect(page.getByTestId('progress-percent')).toHaveText('100%');
  await expect(page.getByTestId('inventory-required-log.birch')).toHaveText('0');
  await expect(page.getByTestId('inventory-remaining-log.birch')).toHaveText('0');
  await expect(page.getByTestId('inventory-surplus-log.birch')).toHaveText('2');
});

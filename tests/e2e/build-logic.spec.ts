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

async function placeAtCentre(page: Page, search: string, definitionTestId: string): Promise<void> {
  await page.getByTestId('piece-search').fill(search);
  await page.getByTestId(definitionTestId).click();
  const centre = await canvasCentre(page);
  await page.waitForTimeout(150);
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.click(centre.x, centre.y);
}

test('blocks a wall with no pillars after a floor is placed', async ({ page }) => {
  await page.goto('/');

  await placeAtCentre(page, 'floor', 'piece-item-floor.birch');
  await expect.poll(() => pieceCount(page)).toBe(1);

  await placeAtCentre(page, 'wall', 'piece-item-wall.birch');
  await expect.poll(() => pieceCount(page)).toBe(1);
  await expect(page.getByTestId('placement-message')).toContainText('pillar');
});

test('snaps a pillar to a floor corner vertex', async ({ page }) => {
  await page.goto('/');

  await placeAtCentre(page, 'floor', 'piece-item-floor.birch');
  await expect.poll(() => pieceCount(page)).toBe(1);

  await placeAtCentre(page, 'pillar', 'piece-item-pillar.birch');
  await expect.poll(() => pieceCount(page)).toBe(2);

  const positionText = (await page.getByTestId('prop-position').textContent()) ?? '';
  const parts = positionText.split(',').map((value) => Number.parseFloat(value.trim()));
  expect(parts).toHaveLength(3);
  expect(parts[1]).toBeCloseTo(2.125, 3);
  expect(Math.abs(parts[0] ?? 0)).toBeCloseTo(3, 3);
  expect(Math.abs(parts[2] ?? 0)).toBeCloseTo(3, 3);
});

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

test('zone assignment updates the count and hiding a zone makes pieces unpickable', async ({
  page,
}) => {
  await page.goto('/');

  await page.getByTestId('piece-search').fill('wall');
  await page.locator('[data-testid^="piece-item-"]').first().click();

  const centre = await canvasCentre(page);
  await page.mouse.click(centre.x - 40, centre.y + 20);
  await page.mouse.click(centre.x + 40, centre.y + 20);
  await expect.poll(() => pieceCount(page)).toBe(2);

  // Add a zone and assign the whole selection to it.
  await page.getByTestId('add-zone').click();
  await expect(page.locator('[data-testid^="zone-item-"]')).toHaveCount(1);

  await page.keyboard.press('Control+a');
  await page.getByTestId('selection-zone-select').selectOption({ index: 1 });
  await expect(page.locator('[data-testid^="zone-count-"]').first()).toHaveText('2');

  // Hide the zone: its pieces must no longer be pickable.
  await page.getByTestId('tool-select').click();
  await page.locator('[data-testid^="zone-visible-"]').first().click();

  await page.mouse.click(centre.x - 40, centre.y + 20);
  await expect(page.getByTestId('properties-panel')).toContainText('Nothing selected.');

  // The document still owns the pieces; only their rendering/picking is hidden.
  await expect.poll(() => pieceCount(page)).toBe(2);
});

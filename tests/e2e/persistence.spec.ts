import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function pieceCount(page: Page): Promise<number> {
  const text = (await page.getByTestId('piece-count').textContent()) ?? '0';
  return Number.parseInt(text, 10);
}

async function placeFirstWallPiece(page: Page): Promise<void> {
  await page.getByTestId('piece-search').fill('wall');
  await page.locator('[data-testid^="piece-item-"]').first().click();
  const box = await page.locator('canvas').boundingBox();
  if (box === null) {
    throw new Error('Canvas has no bounding box');
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.click(x, y);
}

test('autosaves a placed piece and restores it after reload', async ({ page }) => {
  await page.goto('/');

  await placeFirstWallPiece(page);
  await expect.poll(() => pieceCount(page)).toBeGreaterThanOrEqual(1);

  await expect(page.getByTestId('autosave-status')).toContainText('Saved', {
    timeout: 10_000,
  });

  await page.reload();
  await expect.poll(() => pieceCount(page)).toBeGreaterThanOrEqual(1);
});

test('export then import round-trips a project through the file input', async ({ page }) => {
  await page.goto('/');

  await placeFirstWallPiece(page);
  await expect.poll(() => pieceCount(page)).toBeGreaterThanOrEqual(1);

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-project').click();
  const download = await downloadPromise;
  const path = await download.path();
  if (path === null) {
    throw new Error('Download did not produce a file path');
  }

  await page.getByTestId('new-project').click();
  await expect.poll(() => pieceCount(page)).toBe(0);

  await page.getByTestId('import-input').setInputFiles(path);
  await expect.poll(() => pieceCount(page)).toBeGreaterThanOrEqual(1);
});

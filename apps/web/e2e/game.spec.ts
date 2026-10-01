import { expect, test } from '@playwright/test';
import { openGame, randomLot, stopAtLot } from './helpers';

test('o jogo abre pronto para dirigir e o carro anda', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openGame(page);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2500);
  await page.keyboard.up('KeyW');
  const speed = await page.evaluate(() => window.__drivemart!.carSpeed);
  expect(speed).toBeGreaterThan(3);
  expect(errors).toEqual([]);
});

test('parar na vaga mostra o cartão do prédio com o preço', async ({ page }) => {
  await openGame(page);
  await stopAtLot(page, await randomLot(page));
  await expect(page.locator('.zone-card h2')).not.toBeEmpty();
  await expect(page.locator('.zone-card .badge')).toBeVisible();
});

test('o mapa abre com a tecla M e fecha com Esc', async ({ page }) => {
  await openGame(page);
  await page.keyboard.press('KeyM');
  await expect(page.getByRole('dialog', { name: 'Mapa' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Mapa' })).toBeHidden();
});

import { expect, test } from '@playwright/test';
import { openGame, randomLot, stopAtLot } from './helpers';

test('o jogo abre pronto para dirigir e o carro anda', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openGame(page);
  // Acelera até passar de 3 m/s; com WebGL por software e a máquina ocupada o jogo roda devagar,
  // então o teste espera a velocidade em vez de um tempo fixo.
  await page.keyboard.down('KeyW');
  await expect
    .poll(() => page.evaluate(() => window.__drivemart!.carSpeed), { timeout: 20_000 })
    .toBeGreaterThan(3);
  await page.keyboard.up('KeyW');
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

test('troca de cidade pelo menu da barra superior', async ({ page }) => {
  await openGame(page);
  expect(await page.evaluate(() => window.__drivemart!.layout.cityId)).toBe('rio');
  await page.getByRole('button', { name: 'Rio', exact: true }).click();
  await page.getByRole('button', { name: 'San Francisco' }).click();
  await expect
    .poll(() => page.evaluate(() => window.__drivemart?.layout.cityId), { timeout: 150_000 })
    .toBe('sf');
  await expect(page).toHaveURL(/cidade=sf/);
  await expect(page.getByRole('button', { name: 'SF', exact: true })).toBeVisible();
  // Para numa vaga de San Francisco.
  await stopAtLot(page, await randomLot(page));
});

test('escolhe outro carro e outra cor nas configurações', async ({ page }) => {
  await openGame(page);
  await page.getByRole('button', { name: 'Configurações' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Configurações' });
  await dialog.getByRole('combobox', { name: 'Carro' }).selectOption({ label: 'Sedã creme' });
  await dialog.getByRole('radio', { name: 'Cor 3' }).click();
  await expect
    .poll(() => page.evaluate(() => window.__drivemart!.carChoice))
    .toEqual({ id: 'rio-1', color: 2 });
  // A escolha fica salva para a cidade.
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => window.__drivemart?.carChoice), { timeout: 150_000 })
    .toEqual({ id: 'rio-1', color: 2 });
  // O ônibus também anda.
  await page.getByRole('button', { name: 'Configurações' }).first().click();
  await dialog.getByRole('combobox', { name: 'Carro' }).selectOption({ label: 'Ônibus' });
  await page.keyboard.press('Escape');
  await page.keyboard.down('KeyW');
  await expect
    .poll(() => page.evaluate(() => window.__drivemart!.carSpeed), { timeout: 20_000 })
    .toBeGreaterThan(3);
  await page.keyboard.up('KeyW');
});

test.describe('modo de teste (sem Firebase)', () => {
  test.skip(process.env.VITE_OFFLINE !== 'true', 'Rode com VITE_OFFLINE=true para testar o modo de teste.');

  test('mostra o imóvel sem login nem compra', async ({ page }) => {
    await openGame(page);
    await expect(page.getByText('Modo de teste', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Entrar' })).toHaveCount(0);
    await stopAtLot(page, await randomLot(page));
    await expect(page.locator('.zone-card')).toContainText('desativados nesta versão de teste');
    await expect(page.locator('.zone-card button')).toHaveCount(0);
    // A tecla E não abre nenhum modal.
    await page.keyboard.press('KeyE');
    await expect(page.locator('.modal')).toHaveCount(0);
  });

  test('o mapa permite teleportar para qualquer imóvel', async ({ page }) => {
    await openGame(page);
    await page.keyboard.press('KeyM');
    const canvas = page.locator('.map-canvas');
    await expect(canvas).toBeVisible();
    await canvas.click();
    await expect(page.getByRole('button', { name: 'Teleportar' })).toBeVisible();
    await page.getByRole('button', { name: 'Teleportar' }).click();
    await expect(page.locator('.zone-card')).toBeVisible({ timeout: 30_000 });
  });
});

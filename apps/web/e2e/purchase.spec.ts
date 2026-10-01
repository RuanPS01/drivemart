import { expect, test, type Browser, type Page } from '@playwright/test';
import { emulatorsUp, openGame, randomLot, signUp, stopAtLot } from './helpers';

// Fluxo completo com dinheiro de mentira: precisa dos emuladores (npm run dev:all) com o catálogo gravado.
test.beforeAll(async () => {
  test.skip(!(await emulatorsUp()), 'Emuladores do Firebase desligados (rode npm run dev:all).');
});

async function player(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await openGame(page);
  return page;
}

test('compra da plataforma, revenda em dois Pix e confirmação do vendedor', async ({ browser }) => {
  // Vendedora compra o imóvel da plataforma.
  const seller = await player(browser);
  await signUp(seller, 'Maria Vendedora');
  const lot = await randomLot(seller);
  await stopAtLot(seller, lot);
  await seller.keyboard.press('KeyE');
  await seller.getByRole('button', { name: 'Já confirmei' }).click();
  await seller.getByRole('button', { name: 'Gerar Pix' }).click();
  await expect(seller.locator('.pix-qr')).toBeVisible();
  await seller.getByRole('button', { name: 'Simular pagamento (teste)' }).click();
  await expect(seller.getByText('O imóvel é seu.')).toBeVisible();

  // Anuncia com a chave Pix.
  await seller.getByRole('button', { name: 'Personalizar agora' }).click();
  await seller.getByRole('tab', { name: 'Venda' }).click();
  await seller.getByLabel('Preço de venda (R$)').fill('1.500,00');
  await expect(seller.getByText('R$ 1.350,00')).toBeVisible();
  await seller.getByLabel('Chave Pix', { exact: true }).fill('529.982.247-25');
  await seller.getByLabel('Nome de quem recebe').fill('Maria Vendedora');
  await seller.getByRole('button', { name: 'Colocar à venda' }).click();
  await expect(seller.getByRole('button', { name: 'Atualizar anúncio' })).toBeVisible();
  await seller.keyboard.press('Escape');

  // Comprador paga a taxa e depois o vendedor.
  const buyer = await player(browser);
  await signUp(buyer, 'Joao Comprador');
  await stopAtLot(buyer, lot);
  await buyer.getByRole('button', { name: /Comprar de/ }).click();
  await buyer.getByRole('button', { name: 'Já confirmei' }).click();
  await buyer.getByRole('button', { name: 'Pagar a taxa com Pix' }).click();
  await expect(buyer.getByText('Passo 1: pague a taxa de R$ 150,00')).toBeVisible();
  await buyer.getByRole('button', { name: 'Simular pagamento (teste)' }).click();
  await expect(buyer.getByText('Passo 2: pague R$ 1.350,00 a Maria Vendedora')).toBeVisible();
  await expect(buyer.locator('.pix-code')).toHaveValue(/br\.gov\.bcb\.pix/);
  await buyer.getByRole('button', { name: 'Já paguei o vendedor' }).click();
  await expect(buyer.getByText(/confirmar o recebimento/)).toBeVisible();

  // Vendedora confirma em Meus imóveis.
  await seller.locator('.user-menu > button').click();
  await seller.locator('.user-menu-list button', { hasText: 'Meus imóveis' }).click();
  await expect(seller.getByText('Confirme o recebimento')).toBeVisible();
  await seller.getByRole('button', { name: 'Recebi o Pix, concluir venda' }).click();

  await expect(buyer.getByText('O imóvel é seu.')).toBeVisible();
});

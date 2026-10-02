import { expect, type Page } from '@playwright/test';

declare global {
  interface Window {
    __drivemart?: {
      carSpeed: number;
      carChoice: { id: string; color: number };
      layout: { cityId: string };
      teleportToLot(id: string): boolean;
      parcels: { byId: Map<string, unknown> };
    };
  }
}

/** Abre o jogo e espera a cidade ficar pronta para dirigir. */
export async function openGame(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('drivemart:help-dismissed', '1'));
  await page.goto('/');
  await page.waitForFunction(() => !!window.__drivemart, null, { timeout: 150_000 });
  await expect(page.locator('.speedometer')).toBeVisible();
}

/** Para o carro na vaga de um lote. */
export async function stopAtLot(page: Page, lotId: string): Promise<void> {
  await page.evaluate((id) => window.__drivemart!.teleportToLot(id), lotId);
  await expect(page.locator('.zone-card')).toBeVisible({ timeout: 30_000 });
}

const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/demo-drivemart';
const OWNER = { 'Content-Type': 'application/json', Authorization: 'Bearer owner' };

/** Cria uma conta pelo modal e confirma o e-mail direto no emulador de Auth. */
export async function signUp(page: Page, name: string): Promise<{ email: string; uid: string }> {
  const email = `${name.toLowerCase().replace(/\W/g, '')}${Date.now()}@teste.com`;
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('button', { name: 'Criar uma conta' }).click();
  await page.getByLabel('Nome').fill(name);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill('segredo123');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.locator('.user-menu')).toBeVisible();
  const look = (await (
    await fetch(`${AUTH}/accounts:lookup`, {
      method: 'POST',
      headers: OWNER,
      body: JSON.stringify({ email: [email] }),
    })
  ).json()) as { users: { localId: string }[] };
  const uid = look.users[0]!.localId;
  await fetch(`${AUTH}/accounts:update`, {
    method: 'POST',
    headers: OWNER,
    body: JSON.stringify({ localId: uid, emailVerified: true }),
  });
  return { email, uid };
}

/** Lote comprável sorteado do traçado (evita repetir lotes já vendidos no emulador). */
export async function randomLot(page: Page): Promise<string> {
  return page.evaluate(() => {
    const ids = [...window.__drivemart!.parcels.byId.entries()]
      .filter(([, l]) => (l as { z: unknown; fl: number }).z && (l as { fl: number }).fl >= 2)
      .map(([id]) => id);
    return ids[Math.floor(Math.random() * ids.length)]!;
  });
}

/** Os emuladores do Firebase estão no ar? */
export async function emulatorsUp(): Promise<boolean> {
  try {
    return (await fetch('http://127.0.0.1:9099/')).ok;
  } catch {
    return false;
  }
}

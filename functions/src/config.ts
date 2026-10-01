import { defineSecret, defineString } from 'firebase-functions/params';
import {
  DEFAULT_PLATFORM,
  DEFAULT_PRICING,
  type PlatformConfig,
  type PricingConfig,
} from '@drivemart/shared';
import { db } from './lib/firebase';

/** Access Token do Mercado Pago (produção ou teste). */
export const MP_ACCESS_TOKEN = defineSecret('MP_ACCESS_TOKEN');
/** Assinatura secreta do webhook (Suas integrações > Webhooks). */
export const MP_WEBHOOK_SECRET = defineSecret('MP_WEBHOOK_SECRET');
/** URL pública da função mercadoPagoWebhook (enviada em cada pedido). */
export const MP_WEBHOOK_URL = defineString('MP_WEBHOOK_URL', { default: '' });
/** "mercadopago" (padrão) ou "fake" (só para testes). No emulador o padrão é "fake". */
export const PAYMENT_PROVIDER = defineString('PAYMENT_PROVIDER', { default: '' });

export async function platformConfig(): Promise<PlatformConfig> {
  const snap = await db.doc('config/platform').get();
  return { ...DEFAULT_PLATFORM, ...(snap.data() as Partial<PlatformConfig> | undefined) };
}

export type PricingDoc = PricingConfig & { overrides?: Record<string, number> };

export async function pricingConfig(): Promise<PricingDoc> {
  const snap = await db.doc('config/pricing').get();
  return { ...DEFAULT_PRICING, ...(snap.data() as Partial<PricingDoc> | undefined) };
}

import { MP_ACCESS_TOKEN, MP_WEBHOOK_URL, PAYMENT_PROVIDER } from '../config';
import { isEmulator } from '../lib/firebase';
import { fakeProvider } from './fake';
import { mercadoPagoProvider } from './mercadopago';
import type { PaymentProvider } from './provider';

let override: PaymentProvider | null = null;

/** Permite trocar o provedor nos testes. */
export function setProviderForTests(p: PaymentProvider | null): void {
  override = p;
}

export function getProvider(): PaymentProvider {
  if (override) return override;
  const choice = PAYMENT_PROVIDER.value() || (isEmulator ? 'fake' : 'mercadopago');
  if (choice === 'fake') return fakeProvider;
  return mercadoPagoProvider(MP_ACCESS_TOKEN.value(), MP_WEBHOOK_URL.value());
}

export function providerByName(name: string): PaymentProvider {
  if (override) return override;
  return name === 'fake'
    ? fakeProvider
    : mercadoPagoProvider(MP_ACCESS_TOKEN.value(), MP_WEBHOOK_URL.value());
}

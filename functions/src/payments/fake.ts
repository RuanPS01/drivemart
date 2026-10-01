import { buildBrCode } from '@drivemart/shared';
import { db } from '../lib/firebase';
import type { ChargeStatus, PaymentProvider, PixCharge, PixChargeInput } from './provider';

/**
 * Provedor de testes: gera um Pix de mentira. O estado fica em `_fakePayments/{id}` (sem acesso pelo cliente),
 * e o pagamento é simulado pela função devSimulatePayment, disponível só no emulador.
 */
export const fakeProvider: PaymentProvider = {
  name: 'fake',
  async createPix(input: PixChargeInput): Promise<PixCharge> {
    const id = `FAKE-${input.orderId}`;
    await db
      .doc(`_fakePayments/${id}`)
      .set({ orderId: input.orderId, amount: input.amountCents, state: 'pending' });
    return {
      providerOrderId: id,
      providerPaymentId: `PAY-${input.orderId}`,
      qrCode: buildBrCode({
        key: '123e4567-e12b-12d1-a456-426655440000',
        name: 'DriveMart Teste',
        city: 'Rio de Janeiro',
        amountCents: input.amountCents,
        txid: input.orderId.slice(0, 25),
      }),
      qrCodeBase64: null,
      ticketUrl: null,
      status: 'action_required',
    };
  },
  async getStatus(providerOrderId: string): Promise<ChargeStatus> {
    const snap = await db.doc(`_fakePayments/${providerOrderId}`).get();
    const d = snap.data() as { orderId: string; amount: number; state: ChargeStatus['state'] } | undefined;
    return {
      state: d?.state ?? 'failed',
      providerStatus: d?.state ?? 'unknown',
      externalReference: d?.orderId ?? null,
      paidCents: d?.state === 'paid' ? d.amount : 0,
      providerPaymentId: d ? `PAY-${d.orderId}` : null,
    };
  },
  async refund(providerOrderId: string) {
    await db.doc(`_fakePayments/${providerOrderId}`).set({ state: 'refunded' }, { merge: true });
  },
  async cancel(providerOrderId: string) {
    const ref = db.doc(`_fakePayments/${providerOrderId}`);
    const snap = await ref.get();
    if (snap.data()?.state === 'pending') await ref.set({ state: 'canceled' }, { merge: true });
  },
};

/** Marca uma cobrança falsa como paga (simulação no emulador e testes). */
export async function markFakePaid(providerOrderId: string): Promise<void> {
  await db.doc(`_fakePayments/${providerOrderId}`).set({ state: 'paid' }, { merge: true });
}

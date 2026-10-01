import type { OrderDoc } from '@drivemart/shared';
import type { Caller } from './lib/auth';
import { fail } from './lib/errors';
import { db, isEmulator } from './lib/firebase';
import { markFakePaid } from './payments/fake';
import { applyChargeStatus } from './orders/settle';

/** Simula o pagamento de um Pix de teste. Só funciona no emulador com o provedor falso. */
export async function devSimulatePayment(caller: Caller, orderId: string): Promise<{ result: string }> {
  if (!isEmulator) fail('permission-denied', 'Disponível só no ambiente de desenvolvimento.');
  const snap = await db.doc(`orders/${orderId}`).get();
  const o = snap.data() as OrderDoc | undefined;
  if (!o) fail('not-found', 'Pedido não encontrado.');
  if (o.buyerUid !== caller.uid) fail('permission-denied', 'Este pedido não é seu.');
  if (o.payment.provider !== 'fake' || !o.payment.providerOrderId)
    fail('failed-precondition', 'Pedido sem cobrança de teste.');
  await markFakePaid(o.payment.providerOrderId);
  const result = await applyChargeStatus(orderId, {
    state: 'paid',
    providerStatus: 'processed',
    externalReference: orderId,
    paidCents: o.payment.amount,
    providerPaymentId: o.payment.providerPaymentId,
  });
  return { result };
}

import type { OrderDoc, ParcelDoc } from '@drivemart/shared';
import type { Caller } from '../lib/auth';
import { fail } from '../lib/errors';
import { db } from '../lib/firebase';
import { providerByName } from '../payments';
import { releaseReservation, runRefund } from './settle';

/** O comprador desiste: cancela o Pix pendente (ou devolve a taxa já paga na revenda) e libera o lote. */
export async function cancelOrder(caller: Caller, orderId: string): Promise<{ status: string }> {
  if (typeof orderId !== 'string' || !orderId) fail('invalid-argument', 'Pedido inválido.');
  const orderRef = db.doc(`orders/${orderId}`);
  const snap = await orderRef.get();
  if (!snap.exists) fail('not-found', 'Pedido não encontrado.');
  const o = snap.data() as OrderDoc;
  if (o.buyerUid !== caller.uid) fail('permission-denied', 'Este pedido não é seu.');
  if (o.status !== 'pending_payment' && o.status !== 'fee_paid') {
    fail('failed-precondition', 'Este pedido não pode mais ser cancelado.');
  }
  if (o.status === 'pending_payment' && o.payment.providerOrderId) {
    await providerByName(o.payment.provider)
      .cancel(o.payment.providerOrderId)
      .catch((err) => console.warn('[cancelar] provedor', err));
  }
  const needsRefund = o.status === 'fee_paid';
  await db.runTransaction(async (tx) => {
    const cur = (await tx.get(orderRef)).data() as OrderDoc;
    if (cur.status !== o.status) fail('aborted', 'O pedido mudou. Tente de novo.');
    const parcelRef = db.doc(`parcels/${o.parcelId}`);
    const p = (await tx.get(parcelRef)).data() as ParcelDoc | undefined;
    releaseReservation(tx, parcelRef, p, orderId);
    tx.update(orderRef, {
      status: 'canceled',
      updatedAt: Date.now(),
      ...(needsRefund
        ? { refund: { status: 'pending', reason: 'Compra cancelada pelo comprador.', at: Date.now() } }
        : {}),
    });
  });
  if (needsRefund && o.payment.providerOrderId)
    await runRefund(orderId, o.payment.provider, o.payment.providerOrderId);
  return { status: 'canceled' };
}

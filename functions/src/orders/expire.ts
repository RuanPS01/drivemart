import type { OrderDoc, ParcelDoc } from '@drivemart/shared';
import { db } from '../lib/firebase';
import { providerByName } from '../payments';
import { releaseReservation, runRefund, applyChargeStatus } from './settle';

/**
 * Rotina periódica: confere Pix vencidos (o pagamento pode ter chegado sem webhook),
 * expira os não pagos e trata os prazos da revenda.
 */
export async function expireOrders(
  now = Date.now(),
): Promise<{ expired: number; settled: number; stages: number }> {
  let expired = 0,
    settled = 0,
    stages = 0;
  const pending = await db
    .collection('orders')
    .where('status', '==', 'pending_payment')
    .where('expiresAt', '<', now)
    .limit(200)
    .get();
  for (const doc of pending.docs) {
    const o = doc.data() as OrderDoc;
    if (o.payment.providerOrderId) {
      try {
        const st = await providerByName(o.payment.provider).getStatus(o.payment.providerOrderId);
        if (st.state === 'paid') {
          await applyChargeStatus(doc.id, st);
          settled++;
          continue;
        }
        await providerByName(o.payment.provider)
          .cancel(o.payment.providerOrderId)
          .catch(() => {});
      } catch (err) {
        console.warn('[expirar] consulta ao provedor falhou', doc.id, err);
      }
    }
    const r = await applyChargeStatus(doc.id, {
      state: 'expired',
      providerStatus: 'expired',
      externalReference: doc.id,
      paidCents: 0,
      providerPaymentId: null,
    });
    if (r === 'expired') expired++;
  }

  // Revenda: comprador não marcou "já paguei" no prazo depois da taxa. Expira e devolve a taxa.
  const feePaid = await db
    .collection('orders')
    .where('status', '==', 'fee_paid')
    .where('resale.stageDeadline', '<', now)
    .limit(100)
    .get();
  for (const doc of feePaid.docs) {
    const o = doc.data() as OrderDoc;
    await db.runTransaction(async (tx) => {
      const cur = (await tx.get(doc.ref)).data() as OrderDoc;
      if (cur.status !== 'fee_paid') return;
      const parcelRef = db.doc(`parcels/${o.parcelId}`);
      const p = (await tx.get(parcelRef)).data() as ParcelDoc | undefined;
      releaseReservation(tx, parcelRef, p, doc.id);
      tx.update(doc.ref, {
        status: 'expired',
        refund: { status: 'pending', reason: 'Pagamento ao vendedor não informado no prazo.', at: now },
        updatedAt: now,
      });
    });
    if (o.payment.providerOrderId) await runRefund(doc.id, o.payment.provider, o.payment.providerOrderId);
    stages++;
  }

  // Revenda: vendedor não confirmou no prazo. Vira disputa para o admin decidir.
  const waiting = await db
    .collection('orders')
    .where('status', '==', 'buyer_marked_paid')
    .where('resale.stageDeadline', '<', now)
    .limit(100)
    .get();
  for (const doc of waiting.docs) {
    await doc.ref.update({
      status: 'disputed',
      'resale.disputeReason': 'O vendedor não confirmou o recebimento no prazo.',
      updatedAt: now,
    });
    stages++;
  }
  return { expired, settled, stages };
}

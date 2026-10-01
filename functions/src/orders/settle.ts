import { FieldValue, type Transaction, type DocumentReference } from 'firebase-admin/firestore';
import { buildBrCode, type OrderDoc, type ParcelDoc } from '@drivemart/shared';
import { platformConfig } from '../config';
import type { SalePrivate } from '../parcels/sale';
import { db } from '../lib/firebase';
import { providerByName } from '../payments';
import type { ChargeStatus } from '../payments/provider';

export type SettleResult = 'completed' | 'fee_paid' | 'refunded' | 'expired' | 'canceled' | 'ignored';

/** Libera a reserva do lote se ela pertence ao pedido. Lote com dono volta para "à venda". */
export function releaseReservation(
  tx: Transaction,
  ref: DocumentReference,
  p: ParcelDoc | undefined,
  orderId: string,
): void {
  if (!p || p.reservation?.orderId !== orderId) return;
  tx.update(ref, {
    status: p.ownerUid ? 'for_sale' : 'available',
    reservation: FieldValue.delete(),
    updatedAt: Date.now(),
  });
}

/** Passa a posse do lote para o comprador (fachada, link e venda zerados para o novo dono). */
export function transferOwnership(
  tx: Transaction,
  parcelRef: DocumentReference,
  orderId: string,
  o: OrderDoc,
): void {
  const now = Date.now();
  tx.update(parcelRef, {
    status: 'owned',
    ownerUid: o.buyerUid,
    ownerName: o.buyerName,
    reservation: FieldValue.delete(),
    displayName: null,
    linkUrl: null,
    facade: null,
    salePrice: null,
    purchasedAt: now,
    updatedAt: now,
  });
  tx.delete(parcelRef.collection('private').doc('sale'));
  tx.set(parcelRef.collection('history').doc(orderId), {
    kind: o.kind,
    fromUid: o.sellerUid,
    toUid: o.buyerUid,
    price: o.price,
    at: now,
  });
}

/**
 * Aplica o estado de uma cobrança (vindo do webhook, da verificação periódica ou da simulação) ao pedido.
 * Idempotente: chamadas repetidas com o mesmo estado não mudam nada.
 */
export async function applyChargeStatus(orderId: string, st: ChargeStatus): Promise<SettleResult> {
  const orderRef = db.doc(`orders/${orderId}`);
  const platform = await platformConfig();
  // Estorno decidido dentro da transação e executado depois dela.
  const pending: { refund?: { provider: string; providerOrderId: string } } = {};

  const result = await db.runTransaction<SettleResult>(async (tx) => {
    const osnap = await tx.get(orderRef);
    if (!osnap.exists) return 'ignored';
    const o = osnap.data() as OrderDoc;
    const parcelRef = db.doc(`parcels/${o.parcelId}`);
    const p = (await tx.get(parcelRef)).data() as ParcelDoc | undefined;
    const now = Date.now();

    if (st.state === 'paid') {
      if (st.paidCents > 0 && st.paidCents < o.payment.amount) {
        console.warn('[pedido] valor pago menor que o devido', orderId, st.paidCents, o.payment.amount);
        return 'ignored';
      }
      if (!['pending_payment', 'expired', 'canceled'].includes(o.status)) return 'ignored';
      const paidFields = {
        'payment.status': 'paid',
        'payment.paidAt': now,
        'payment.providerPaymentId': st.providerPaymentId ?? o.payment.providerPaymentId,
        updatedAt: now,
      };
      const reservedForThis = p?.reservation?.orderId === orderId;
      const freeAgain = o.kind === 'primary' && (p?.status ?? 'available') === 'available' && !p?.ownerUid;
      if (o.status === 'pending_payment' && (reservedForThis || freeAgain)) {
        if (o.kind === 'primary') {
          transferOwnership(tx, parcelRef, orderId, o);
          tx.update(orderRef, { ...paidFields, status: 'completed' });
          return 'completed';
        }
        // Revenda: taxa paga; comprador agora paga o vendedor pelo BR Code com a chave dele.
        const priv = (await tx.get(parcelRef.collection('private').doc('sale'))).data() as
          SalePrivate | undefined;
        const deadline = now + platform.buyerConfirmHours * 3_600_000;
        tx.update(parcelRef, {
          'reservation.until': deadline + platform.sellerConfirmHours * 3_600_000,
          updatedAt: now,
        });
        tx.update(orderRef, {
          ...paidFields,
          status: 'fee_paid',
          'resale.stageDeadline': deadline,
          'resale.brCode': priv ? sellerBrCodeFor(priv, o.sellerAmount, orderId) : '',
        });
        return 'fee_paid';
      }
      // Pagamento chegou tarde (lote já foi para outra pessoa ou pedido cancelado): devolve.
      tx.update(orderRef, {
        ...paidFields,
        status: 'refunded',
        refund: {
          status: 'pending',
          reason: 'Pagamento recebido depois do prazo; o imóvel não estava mais reservado.',
          at: now,
        },
      });
      if (o.payment.providerOrderId)
        pending.refund = { provider: o.payment.provider, providerOrderId: o.payment.providerOrderId };
      return 'refunded';
    }

    if (st.state === 'expired' || st.state === 'canceled' || st.state === 'failed') {
      if (o.status !== 'pending_payment') return 'ignored';
      releaseReservation(tx, parcelRef, p, orderId);
      const status = st.state === 'canceled' ? 'canceled' : 'expired';
      tx.update(orderRef, { status, 'payment.status': st.providerStatus, updatedAt: now });
      return status;
    }

    if (st.state === 'refunded' && o.status !== 'completed' && o.status !== 'refunded') {
      releaseReservation(tx, parcelRef, p, orderId);
      tx.update(orderRef, {
        status: 'refunded',
        refund: { status: 'done', reason: 'Estornado no provedor.', at: now },
        updatedAt: now,
      });
      return 'refunded';
    }
    return 'ignored';
  });

  if (pending.refund) await runRefund(orderId, pending.refund.provider, pending.refund.providerOrderId);
  return result;
}

function sellerBrCodeFor(priv: SalePrivate, amount: number, orderId: string): string {
  return buildBrCode({
    key: priv.pixKey,
    name: priv.receiverName,
    city: priv.receiverCity,
    amountCents: amount,
    txid: `DM${orderId}`.replace(/[^A-Za-z0-9]/g, '').slice(0, 25),
    description: 'DriveMart revenda',
  });
}

/** Pede o estorno ao provedor e registra o resultado no pedido. */
export async function runRefund(orderId: string, provider: string, providerOrderId: string): Promise<void> {
  try {
    await providerByName(provider).refund(providerOrderId);
    await db.doc(`orders/${orderId}`).update({ 'refund.status': 'done', 'refund.at': Date.now() });
  } catch (err) {
    console.error('[estorno] falhou', orderId, err);
    await db.doc(`orders/${orderId}`).update({ 'refund.status': 'failed', 'refund.at': Date.now() });
  }
}

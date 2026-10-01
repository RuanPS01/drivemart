import type { OrderDoc, ParcelDoc } from '@drivemart/shared';
import type { Caller } from '../lib/auth';
import { fail } from '../lib/errors';
import { db } from '../lib/firebase';
import { releaseReservation, runRefund, transferOwnership } from '../orders/settle';

export interface DisputeInput {
  orderId: string;
  /** complete: o imóvel vai para o comprador. cancel: volta para o vendedor (à venda). */
  outcome: 'complete' | 'cancel';
  /** Na anulação, devolve a taxa paga pelo comprador. */
  refundFee?: boolean;
  note?: string;
}

/** Admin decide uma revenda em disputa (ou aguardando confirmação do vendedor). */
export async function resolveDispute(admin: Caller, input: DisputeInput): Promise<{ status: string }> {
  if (typeof input.orderId !== 'string' || !input.orderId) fail('invalid-argument', 'Pedido inválido.');
  if (input.outcome !== 'complete' && input.outcome !== 'cancel')
    fail('invalid-argument', 'Decisão inválida.');
  const ref = db.doc(`orders/${input.orderId}`);
  const note = String(input.note ?? '').slice(0, 300) || null;
  const refund: { provider?: string; providerOrderId?: string } = {};

  const status = await db.runTransaction(async (tx) => {
    const o = (await tx.get(ref)).data() as OrderDoc | undefined;
    if (!o) fail('not-found', 'Pedido não encontrado.');
    if (o.kind !== 'resale' || (o.status !== 'disputed' && o.status !== 'buyer_marked_paid')) {
      fail('failed-precondition', 'Este pedido não está em disputa.');
    }
    const parcelRef = db.doc(`parcels/${o.parcelId}`);
    const p = (await tx.get(parcelRef)).data() as ParcelDoc | undefined;
    const now = Date.now();
    const resolution = { by: admin.uid, outcome: input.outcome, note, at: now };
    if (input.outcome === 'complete') {
      if (p?.reservation?.orderId !== input.orderId) {
        fail('failed-precondition', 'O imóvel não está mais reservado para este pedido.');
      }
      transferOwnership(tx, parcelRef, input.orderId, o);
      tx.update(ref, { status: 'completed', resolution, updatedAt: now });
      return 'completed';
    }
    releaseReservation(tx, parcelRef, p, input.orderId);
    const withRefund = input.refundFee === true && Boolean(o.payment.providerOrderId);
    tx.update(ref, {
      status: 'canceled',
      resolution,
      updatedAt: now,
      ...(withRefund
        ? { refund: { status: 'pending', reason: 'Disputa anulada pelo admin.', at: now } }
        : {}),
    });
    if (withRefund && o.payment.providerOrderId) {
      refund.provider = o.payment.provider;
      refund.providerOrderId = o.payment.providerOrderId;
    }
    return 'canceled';
  });

  if (refund.provider && refund.providerOrderId) {
    await runRefund(input.orderId, refund.provider, refund.providerOrderId);
  }
  return { status };
}

const PARCEL_ID = /^[a-z]{2,10}-[0-9a-z]{6}$/;

/** Bloqueia ou libera a fachada (e opcionalmente remove o link) de um imóvel. */
export async function moderateParcel(
  admin: Caller,
  input: { parcelId: string; blocked: boolean; clearLink?: boolean },
): Promise<{ ok: true }> {
  if (typeof input.parcelId !== 'string' || !PARCEL_ID.test(input.parcelId))
    fail('invalid-argument', 'Imóvel inválido.');
  const ref = db.doc(`parcels/${input.parcelId}`);
  const p = (await ref.get()).data() as ParcelDoc | undefined;
  if (!p) fail('not-found', 'Imóvel não encontrado.');
  const update: Record<string, unknown> = { moderatedBy: admin.uid, updatedAt: Date.now() };
  if (p.facade) update['facade.moderation'] = input.blocked ? 'blocked' : 'ok';
  if (input.clearLink) update.linkUrl = null;
  await ref.update(update);
  return { ok: true };
}

/** Fecha uma denúncia, bloqueando o conteúdo do imóvel quando procedente. */
export async function resolveReport(
  admin: Caller,
  input: { reportId: string; action: 'dismiss' | 'block' },
): Promise<{ ok: true }> {
  if (typeof input.reportId !== 'string' || !input.reportId) fail('invalid-argument', 'Denúncia inválida.');
  if (input.action !== 'dismiss' && input.action !== 'block') fail('invalid-argument', 'Ação inválida.');
  const ref = db.doc(`reports/${input.reportId}`);
  const r = (await ref.get()).data() as { parcelId: string; status: string } | undefined;
  if (!r) fail('not-found', 'Denúncia não encontrada.');
  if (input.action === 'block' && PARCEL_ID.test(r.parcelId)) {
    await moderateParcel(admin, { parcelId: r.parcelId, blocked: true, clearLink: true });
  }
  await ref.update({
    status: input.action === 'block' ? 'actioned' : 'dismissed',
    resolvedBy: admin.uid,
    resolvedAt: Date.now(),
  });
  return { ok: true };
}

import { maskPixKey, splitResale, type OrderDoc, type ParcelDoc } from '@drivemart/shared';
import { platformConfig } from '../config';
import type { Caller } from '../lib/auth';
import { fail } from '../lib/errors';
import { db } from '../lib/firebase';
import { getProvider } from '../payments';
import type { SalePrivate } from '../parcels/sale';
import { releaseReservation, transferOwnership } from './settle';

export interface ResaleStart {
  orderId: string;
  price: number;
  fee: number;
  sellerAmount: number;
  qrCode: string;
  qrCodeBase64: string | null;
  expiresAt: number;
}

/**
 * Comprador inicia a revenda: reserva o imóvel e gera o Pix da taxa da plataforma.
 * O QR do vendedor só é liberado depois que a taxa for paga (ver applyChargeStatus).
 */
export async function startResaleOrder(caller: Caller, parcelId: string): Promise<ResaleStart> {
  const platform = await platformConfig();
  if (platform.requireVerifiedEmail && !caller.google && !caller.emailVerified) {
    fail('failed-precondition', 'Confirme seu e-mail antes de comprar.');
  }
  const parcelRef = db.doc(`parcels/${parcelId}`);
  const orderRef = db.collection('orders').doc();
  const now = Date.now();
  const expiresAt = now + platform.paymentMinutes * 60_000;

  const order = await db.runTransaction(async (tx) => {
    const p = (await tx.get(parcelRef)).data() as ParcelDoc | undefined;
    if (!p) fail('not-found', 'Imóvel não encontrado.');
    if (p.status !== 'for_sale' || !p.salePrice || !p.ownerUid)
      fail('failed-precondition', 'Este imóvel não está à venda agora.');
    if (p.ownerUid === caller.uid) fail('failed-precondition', 'Você já é o dono deste imóvel.');
    const priv = (await tx.get(parcelRef.collection('private').doc('sale'))).data() as
      SalePrivate | undefined;
    if (!priv) fail('failed-precondition', 'O vendedor ainda não informou a chave Pix.');
    const { fee, seller } = splitResale(p.salePrice, platform.resaleFeeBps);
    tx.update(parcelRef, {
      status: 'reserved',
      reservation: { orderId: orderRef.id, uid: caller.uid, until: expiresAt },
      updatedAt: now,
    });
    const o: OrderDoc = {
      kind: 'resale',
      cityId: p.cityId,
      parcelId,
      buyerUid: caller.uid,
      buyerName: caller.name,
      buyerEmail: caller.email,
      sellerUid: p.ownerUid,
      sellerName: p.ownerName ?? null,
      price: p.salePrice,
      fee,
      sellerAmount: seller,
      status: 'pending_payment',
      expiresAt,
      createdAt: now,
      updatedAt: now,
      payment: {
        provider: getProvider().name,
        providerOrderId: null,
        providerPaymentId: null,
        qrCode: null,
        qrCodeBase64: null,
        ticketUrl: null,
        status: 'creating',
        amount: fee,
        paidAt: null,
      },
      resale: {
        brCode: '',
        receiverName: priv.receiverName,
        pixKeyType: priv.pixKeyType,
        pixKeyMasked: maskPixKey(priv.pixKeyType, priv.pixKey),
        txid: `DM${orderRef.id}`.slice(0, 25),
        buyerMarkedPaidAt: null,
        sellerConfirmedAt: null,
        receiptPath: null,
        stageDeadline: expiresAt,
        disputeReason: null,
      },
      refund: null,
    };
    tx.set(orderRef, o);
    return o;
  });

  try {
    const charge = await getProvider().createPix({
      orderId: orderRef.id,
      amountCents: order.fee,
      description: `DriveMart: taxa de revenda ${parcelId}`,
      payerEmail: caller.email,
      payerName: caller.name,
      expiresMinutes: platform.paymentMinutes,
    });
    await orderRef.update({
      'payment.providerOrderId': charge.providerOrderId,
      'payment.providerPaymentId': charge.providerPaymentId,
      'payment.qrCode': charge.qrCode,
      'payment.qrCodeBase64': charge.qrCodeBase64,
      'payment.ticketUrl': charge.ticketUrl,
      'payment.status': charge.status,
      updatedAt: Date.now(),
    });
    return {
      orderId: orderRef.id,
      price: order.price,
      fee: order.fee,
      sellerAmount: order.sellerAmount,
      qrCode: charge.qrCode,
      qrCodeBase64: charge.qrCodeBase64,
      expiresAt,
    };
  } catch (err) {
    console.error('[revenda] falha ao criar Pix da taxa', err);
    await db.runTransaction(async (tx) => {
      const p = (await tx.get(parcelRef)).data() as ParcelDoc | undefined;
      releaseReservation(tx, parcelRef, p, orderRef.id);
      tx.update(orderRef, { status: 'failed', 'payment.status': 'error', updatedAt: Date.now() });
    });
    fail('unavailable', 'Não foi possível gerar o Pix agora. Tente de novo em instantes.');
  }
}

async function loadOrder(orderId: string): Promise<OrderDoc> {
  if (typeof orderId !== 'string' || !orderId) fail('invalid-argument', 'Pedido inválido.');
  const snap = await db.doc(`orders/${orderId}`).get();
  if (!snap.exists) fail('not-found', 'Pedido não encontrado.');
  const o = snap.data() as OrderDoc;
  if (o.kind !== 'resale') fail('failed-precondition', 'Este pedido não é uma revenda.');
  return o;
}

/** Comprador informa que pagou o vendedor (opcionalmente com comprovante). */
export async function markResalePaid(
  caller: Caller,
  orderId: string,
  receiptPath?: string,
): Promise<{ status: string }> {
  const o = await loadOrder(orderId);
  if (o.buyerUid !== caller.uid) fail('permission-denied', 'Este pedido não é seu.');
  if (o.status !== 'fee_paid')
    fail('failed-precondition', 'A taxa ainda não foi paga ou o pedido já avançou.');
  if (receiptPath && (typeof receiptPath !== 'string' || !receiptPath.startsWith(`receipts/${orderId}/`))) {
    fail('invalid-argument', 'Comprovante inválido.');
  }
  const platform = await platformConfig();
  const ref = db.doc(`orders/${orderId}`);
  await db.runTransaction(async (tx) => {
    const cur = (await tx.get(ref)).data() as OrderDoc;
    if (cur.status !== 'fee_paid') fail('aborted', 'O pedido mudou. Atualize a tela.');
    const deadline = Date.now() + platform.sellerConfirmHours * 3_600_000;
    tx.update(ref, {
      status: 'buyer_marked_paid',
      'resale.buyerMarkedPaidAt': Date.now(),
      'resale.receiptPath': receiptPath ?? null,
      'resale.stageDeadline': deadline,
      updatedAt: Date.now(),
    });
    tx.update(db.doc(`parcels/${o.parcelId}`), { 'reservation.until': deadline, updatedAt: Date.now() });
  });
  return { status: 'buyer_marked_paid' };
}

/** Vendedor confirma que recebeu: o imóvel passa para o comprador. */
export async function confirmResaleReceipt(caller: Caller, orderId: string): Promise<{ status: string }> {
  const o = await loadOrder(orderId);
  if (o.sellerUid !== caller.uid) fail('permission-denied', 'Só o vendedor pode confirmar o recebimento.');
  const ref = db.doc(`orders/${orderId}`);
  await db.runTransaction(async (tx) => {
    const cur = (await tx.get(ref)).data() as OrderDoc;
    if (cur.status !== 'buyer_marked_paid' && cur.status !== 'fee_paid') {
      fail('failed-precondition', 'Este pedido não está aguardando confirmação.');
    }
    const parcelRef = db.doc(`parcels/${o.parcelId}`);
    const p = (await tx.get(parcelRef)).data() as ParcelDoc | undefined;
    if (p?.reservation?.orderId !== orderId || p.ownerUid !== caller.uid)
      fail('failed-precondition', 'O imóvel não está reservado para este pedido.');
    transferOwnership(tx, parcelRef, orderId, cur);
    tx.update(ref, { status: 'completed', 'resale.sellerConfirmedAt': Date.now(), updatedAt: Date.now() });
  });
  return { status: 'completed' };
}

/** Vendedor diz que não recebeu: vira disputa para o admin. */
export async function rejectResaleReceipt(
  caller: Caller,
  orderId: string,
  reason: string,
): Promise<{ status: string }> {
  const o = await loadOrder(orderId);
  if (o.sellerUid !== caller.uid) fail('permission-denied', 'Só o vendedor pode responder.');
  if (o.status !== 'buyer_marked_paid')
    fail('failed-precondition', 'Este pedido não está aguardando confirmação.');
  await db.doc(`orders/${orderId}`).update({
    status: 'disputed',
    'resale.disputeReason':
      String(reason ?? '').slice(0, 300) || 'O vendedor informou que não recebeu o Pix.',
    updatedAt: Date.now(),
  });
  return { status: 'disputed' };
}

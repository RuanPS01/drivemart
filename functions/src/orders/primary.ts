import { FieldValue } from 'firebase-admin/firestore';
import { lotPrice, type OrderDoc, type ParcelDoc } from '@drivemart/shared';
import { platformConfig, pricingConfig } from '../config';
import type { Caller } from '../lib/auth';
import { fail } from '../lib/errors';
import { db } from '../lib/firebase';
import { getProvider } from '../payments';

const PARCEL_ID = /^[a-z]{2,10}-[0-9a-z]{6}$/;

/** Preço atual de um lote vendido pela plataforma (centavos). */
export async function parcelPrice(parcelId: string, p: ParcelDoc): Promise<number> {
  const cfg = await pricingConfig();
  const override = cfg.overrides?.[parcelId];
  if (typeof override === 'number' && override > 0) return Math.round(override);
  return lotPrice({ area: p.area, floors: p.floors, orla: p.orla }, cfg);
}

export interface PrimaryOrderResult {
  orderId: string;
  amount: number;
  qrCode: string;
  qrCodeBase64: string | null;
  expiresAt: number;
}

/**
 * Cria a compra de um lote vendido pela plataforma: reserva o lote, gera o Pix e devolve o QR.
 * Se o comprador já tem um pedido em aberto para o mesmo lote, devolve esse pedido.
 */
export async function createPrimaryOrder(caller: Caller, parcelId: string): Promise<PrimaryOrderResult> {
  if (typeof parcelId !== 'string' || !PARCEL_ID.test(parcelId)) fail('invalid-argument', 'Imóvel inválido.');
  const platform = await platformConfig();
  if (platform.requireVerifiedEmail && !caller.google && !caller.emailVerified) {
    fail(
      'failed-precondition',
      'Confirme seu e-mail antes de comprar (enviamos um link quando você criou a conta).',
    );
  }

  const parcelRef = db.doc(`parcels/${parcelId}`);
  const now = Date.now();
  const expiresAt = now + platform.paymentMinutes * 60_000;

  // Pedido em aberto do mesmo comprador para o mesmo lote: reaproveita.
  const existing = await db
    .collection('orders')
    .where('buyerUid', '==', caller.uid)
    .where('parcelId', '==', parcelId)
    .where('status', '==', 'pending_payment')
    .limit(1)
    .get();
  const prev = existing.docs[0];
  if (prev) {
    const o = prev.data() as OrderDoc;
    if (o.expiresAt > now + 60_000 && o.payment.qrCode) {
      return {
        orderId: prev.id,
        amount: o.price,
        qrCode: o.payment.qrCode,
        qrCodeBase64: o.payment.qrCodeBase64,
        expiresAt: o.expiresAt,
      };
    }
  }

  const orderRef = db.collection('orders').doc();
  const price = await db.runTransaction(async (tx) => {
    const snap = await tx.get(parcelRef);
    if (!snap.exists) fail('not-found', 'Imóvel não encontrado no catálogo.');
    const p = snap.data() as ParcelDoc;
    if (!p.purchasable) fail('failed-precondition', 'Este imóvel não pode ser comprado.');
    const status = p.status ?? 'available';
    const reservedByOther =
      status === 'reserved' && p.reservation && p.reservation.until > now && p.reservation.uid !== caller.uid;
    if (status === 'owned' || status === 'for_sale') fail('failed-precondition', 'Este imóvel já tem dono.');
    if (reservedByOther)
      fail(
        'failed-precondition',
        'Outra pessoa está comprando este imóvel agora. Tente de novo em alguns minutos.',
      );
    const amount = await parcelPrice(parcelId, p);
    tx.update(parcelRef, {
      status: 'reserved',
      reservation: { orderId: orderRef.id, uid: caller.uid, until: expiresAt },
      updatedAt: now,
    });
    const order: OrderDoc = {
      kind: 'primary',
      cityId: p.cityId,
      parcelId,
      buyerUid: caller.uid,
      buyerName: caller.name,
      buyerEmail: caller.email,
      sellerUid: null,
      sellerName: null,
      price: amount,
      fee: amount,
      sellerAmount: 0,
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
        amount,
        paidAt: null,
      },
      resale: null,
      refund: null,
    };
    tx.set(orderRef, order);
    return amount;
  });

  try {
    const charge = await getProvider().createPix({
      orderId: orderRef.id,
      amountCents: price,
      description: `DriveMart: imóvel ${parcelId}`,
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
      amount: price,
      qrCode: charge.qrCode,
      qrCodeBase64: charge.qrCodeBase64,
      expiresAt,
    };
  } catch (err) {
    console.error('[pix] falha ao criar cobrança', err);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(parcelRef);
      const p = snap.data() as ParcelDoc | undefined;
      if (p?.reservation?.orderId === orderRef.id) {
        tx.update(parcelRef, {
          status: 'available',
          reservation: FieldValue.delete(),
          updatedAt: Date.now(),
        });
      }
      tx.update(orderRef, { status: 'failed', 'payment.status': 'error', updatedAt: Date.now() });
    });
    fail('unavailable', 'Não foi possível gerar o Pix agora. Tente de novo em instantes.');
  }
}
